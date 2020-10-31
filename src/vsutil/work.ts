
import * as ws from './ws';
import * as log from './log';
import * as error from './error';
import vscode = require('vscode');

export const CANCELLED = Symbol('TASK_CANCELLED');

enum TaskState
{
	WAIT,
	STARTED,
	DONE,
}

export class OnCancel
{
	constructor(private task:TaskBase, private target?:()=>any)
	{
	}

	public dispose():void
	{
		if (this.target === undefined) return;
		this.task.removeCancelListener(this.target);
		this.target = undefined;
	}
}

export interface Task
{
	readonly cancelled:boolean;
	
	oncancel(oncancel:()=>any):OnCancel;
	checkCanceled():void;
	with<T>(waitWith:Promise<T>):Promise<T>;
	log(message:string):void;
	error(err:any):void;
}

export abstract class TaskBase implements Task
{
	public cancelled:boolean = false;
	
	protected state:TaskState = TaskState.WAIT;
	
	private cancelListeners:Array<()=>any> = [];
	
	abstract log(message:string):void;

	cancel():void
	{
		if (this.cancelled) return;
		this.cancelled = true;
		this.fireCancel();
	}
	
	with<T>(waitWith:Promise<T>):Promise<T>
	{
		if (this.state !== TaskState.STARTED)
		{
			return Promise.reject(Error('Task.with must call in task'));
		}

		if (this.cancelled) return Promise.reject(CANCELLED);
		return new Promise((resolve, reject)=>{
			this.oncancel(()=>reject(CANCELLED));
			waitWith.then(v=>{
				if (this.cancelled) return;
				this.removeCancelListener(reject);
				resolve(v);
			});
			waitWith.catch(err=>{
				if (this.cancelled) return;
				this.removeCancelListener(reject);
				reject(err);
			});
		});
	}
	
	oncancel(oncancel:()=>any):OnCancel
	{
		if (this.cancelled)
		{
			oncancel();
			return new OnCancel(this);
		}
		this.cancelListeners.push(oncancel);
		return new OnCancel(this, oncancel);
	}

	removeCancelListener(oncancel:()=>any):boolean
	{
		const idx = this.cancelListeners.lastIndexOf(oncancel);
		if (idx === -1) return false;
		this.cancelListeners.splice(idx, 1);
		return true;
	}

	checkCanceled():void
	{
		if (this.cancelled) throw CANCELLED;
	}

	private fireCancel():void
	{
		for(const listener of this.cancelListeners)
		{
			listener();
		}
		this.cancelListeners.length = 0;
	}

	error(err:any):void
	{
		this.log(err && err.stack || err+'');
	}
}

export class TerminalTask extends TaskBase implements vscode.Pseudoterminal
{
	private def:vscode.TaskDefinition|null = null;
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private readonly closeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidClose: vscode.Event<void> = this.closeEmitter.event;

	constructor(private readonly task:(def:vscode.TaskDefinition, task:Task)=>any)
	{
		super();
		this.onDidClose(()=>this.cancel());
	}

	set(def:vscode.TaskDefinition):this
	{
		this.def = def;
		return this;
	}

	open():void
	{
		this._run();
	}

	private async _run():Promise<void>
	{
		if (this.state >= TaskState.STARTED)
		{
			console.error('Already running.');
			return;
		}
		this.state = TaskState.STARTED;
		this.cancelled = false;
		if (this.def === null)
		{
			this.log('Invalid task defination.');
			this.closeEmitter.fire();
			return;
		}
		try
		{
			await this.task(this.def, this);
		}
		catch(err)
		{
			if (err === CANCELLED) return;
			this.error(err);
			console.error(err);
		}
		this.closeEmitter.fire();
		this.close();
	}

	close():void
	{
		this.state = TaskState.WAIT;
		this.cancelled = false;
	}

	log(message:string):void
	{
		this.writeEmitter.fire(message.replace(/\n/g,"\r\n")+'\r\n');
	}
}

class TaskImpl extends TaskBase
{
	public next:TaskImpl|null = null;

	private resolve:()=>void;
	private timeout:NodeJS.Timer;
	public promise:Promise<void>;
	public readonly logger:log.Logger;

	constructor(private scheduler:Scheduler,public name:string, public task:(task:Task)=>any)
	{
		super();

		this.logger = scheduler.logger;
		this.promise = new Promise<void>(resolve=>this.resolve = resolve);
	}

	log(message:string):void
	{
		this.logger.message(message);
	}

	error(err:any):void
	{
		this.logger.error(err);
	}

	setTimeLimit(timeout:number):void
	{
		if (this.timeout) return;
		if (this.state >= TaskState.STARTED) return;

		this.timeout = setTimeout(()=>{
			this.cancelled = true;

			const task = this.scheduler.currentTask;
			if (task === null) this.logger.error(Error(`Closure Compiler is busy: [null...?] is being proceesed. Cannot run [${this.name}]`));
			else this.logger.error(Error(`Closure Compiler is busy: [${task.name}] is being proceesed. Cannot run [${this.name}]`));
		}, timeout);
	}

	async play():Promise<void>
	{
		if (this.state >= TaskState.STARTED)
		{
			console.error('play must call once');
			throw Error('play must call once');
		}
		this.state = TaskState.STARTED;
		if (this.timeout)
		{
			clearTimeout(this.timeout);
		}
		
		if (this.cancelled) return;

		this.logger.verbose(`[TASK:${this.name}] started`);
		try
		{
			await this.task(this);
		}
		catch(err)
		{
			if (err === CANCELLED)
			{
				this.logger.verbose(`[TASK:${this.name}] cancelled`);
				return;
			}
			error.processError(this.logger, err);
		}
		this.logger.verbose(`[TASK:${this.name}] done`);
		this.resolve();
		return this.promise;
	}

}

export class Scheduler implements ws.WorkspaceItem
{
	public currentTask:TaskImpl|null = null;
	private nextTask:TaskImpl|null = null;
	private lastTask:TaskImpl|null = null;
	public readonly logger:log.Logger;

	constructor(arg:log.Logger|ws.Workspace)
	{
		if (arg instanceof ws.Workspace)
		{
			this.logger = arg.query(log.Logger);
		}
		else
		{
			this.logger = arg;
		}
	}

	public dispose()
	{
		this.cancel();
	}

	public cancel():void
	{
		const task = this.currentTask;
		if (!task) return;

		task.cancel();

		this.logger.message(`[${task.name}]task is cancelled`);
		this.currentTask = null;

		var next = task.next;
		while (next)
		{
			this.logger.message(`[${next.name}]task is cancelled`);
			next = next.next;
		}

		this.nextTask = null;
		this.lastTask = null;
	}

	public task(name:string, taskfunc:(task:Task)=>any):Thenable<void>
	{
		const task = new TaskImpl(this, name, taskfunc);
		const last = this.lastTask;
		if (last)
		{
			last.next = task;
			this.lastTask = task;
		}
		else
		{
			this.nextTask = this.lastTask = task;
		}
		if (!this.currentTask)
		{
			this.logger.verbose(`[SCHEDULAR] busy`);
			this.progress();
		}
		return task.promise;
	}
	
	public taskWithTimeout(name:string, timeout:number, taskfunc:(task:Task)=>any):Thenable<void>
	{
		const task = new TaskImpl(this, name, taskfunc);
		task.setTimeLimit(timeout);
		const last = this.lastTask;
		if (last)
		{
			last.next = task;
			this.lastTask = task;
		}
		else
		{
			this.nextTask = this.lastTask = task;
		}
		if (!this.currentTask)
		{
			this.logger.verbose(`[SCHEDULAR] busy`);
			this.progress();
		}
		return task.promise;
	}
	
	private progress():void
	{
		const task = this.nextTask;
		if (!task)
		{
			this.logger.verbose(`[SCHEDULAR] idle`);
			this.currentTask = null;
			return;
		}
		this.currentTask = task;

		const next = task.next;
		if (next === null)
		{
			this.nextTask = this.lastTask = null;
		}
		else
		{
			this.nextTask = next;
		}
		task.play().then(()=>this.progress());
	}
}
