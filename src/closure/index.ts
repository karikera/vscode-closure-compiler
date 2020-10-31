import vscode = require('vscode');
const workspace = vscode.workspace;

import { File } from 'krfile';
import { Workspace, WorkspaceItem } from '../vsutil/ws';
import * as vsutil from '../vsutil/vsutil';

import { closure } from './closure';
import { TerminalTask } from '../vsutil/work';

class ClosureBuildTask extends TerminalTask
{
	constructor(
	  public readonly workspace:Workspace) {
		super(async(def)=>{
			if (def === null) throw Error('Invalid task defination');
			if ('makejson' in def)
			{
				const makejson = new File(def.makejson);
				await closure.build(this, makejson);
				vsutil.addLatestSelectedFile("compileTarget", makejson);
			}
			else
			{
				if (!def.output) throw Error('Invalid task, output not found');
				await closure.buildWith(this, this.workspace, def as any, [this.workspace.child('vscode/tasks.json')]);
			}
		});
	}
}
  
class ClosureBuildTaskWithMakeJson extends TerminalTask {
	constructor(
	  public readonly workspace:Workspace, 
	  public readonly makejson:File) {
		super(async()=>{
			await closure.build(this, this.makejson);
			vsutil.addLatestSelectedFile("compileTarget", this.makejson);
		});
	  }
}

class ClosureBuildAllTask extends TerminalTask
{
  constructor(public readonly workspace:Workspace)
  {
	super(async()=>{
		const files = await this.with(this.workspace.glob('**/make.json'));
		for (const file of files)
		{
			await closure.build(this, file);
		}
		this.log('FINISH ALL');
	});
  }
}

class ClosureExecutionWithMakeJson extends vscode.CustomExecution
{
	private readonly task:ClosureBuildTaskWithMakeJson;
	constructor(workspace:Workspace, makejson:File)
	{
		super(async(def)=>this.task.set(def));
		this.task = new ClosureBuildTaskWithMakeJson(workspace, makejson);
	}
}

class ClosureExecution extends vscode.CustomExecution
{
	private readonly task:ClosureBuildTask;
	constructor(workspace:Workspace)
	{
		super(async(def)=>this.task.set(def));
		this.task = new ClosureBuildTask(workspace);
	}
}

class ClosureAllExecution extends vscode.CustomExecution
{
	private readonly task:ClosureBuildAllTask;
	constructor(workspace:Workspace)
	{
		super(async()=>this.task);
		this.task = new ClosureBuildAllTask(workspace);
	}
}

const COMPILER_TYPE = 'google-closure-compiler';
const DEFAULT_TASK = 'compile';
const PROBLEM_MATCHER = '$google-closure-compiler';

export class ClosureAllTask extends vscode.Task implements WorkspaceItem
{
	constructor(workspace:Workspace)
	{
		super(
			{type: COMPILER_TYPE, task: 'compile-all', problemMatcher: PROBLEM_MATCHER}, 
			vscode.TaskScope.Workspace,
			'compile-all',
			COMPILER_TYPE,
			new ClosureAllExecution(workspace));
	}

	dispose():void
	{
	}
}

const MAX_ITEMS = 8;
class FileTaskMap implements WorkspaceItem
{
	private readonly queue:string[] = [];
	private readonly map = new Map<string, vscode.Task>();

	constructor(public readonly workspace:Workspace)
	{
	}

	get(file:File):ClosureTask
	{
		let task = this.map.get(file.fsPath);
		if (task) return task;
		task = new vscode.Task(
			{type: COMPILER_TYPE, task: DEFAULT_TASK, problemMatcher: PROBLEM_MATCHER}, 
			vscode.TaskScope.Workspace,
			DEFAULT_TASK,
			COMPILER_TYPE,
			new ClosureExecution(this.workspace));
		this.map.set(file.fsPath, task);
		if (this.queue.length >= MAX_ITEMS)
		{
			this.map.delete(this.queue.pop()!);
		}
		this.queue.push(file.fsPath);
		return task;
	}

	getFromMakeJson(makejson:File)
	{
		let task = this.map.get(makejson.fsPath);
		if (task) return task;
		task = new vscode.Task(
			{type: COMPILER_TYPE, task: DEFAULT_TASK, problemMatcher: PROBLEM_MATCHER}, 
			vscode.TaskScope.Workspace,
			DEFAULT_TASK,
			COMPILER_TYPE,
			new ClosureExecutionWithMakeJson(this.workspace, makejson));
		this.map.set(makejson.fsPath, task);
		if (this.queue.length >= MAX_ITEMS)
		{
			this.map.delete(this.queue.pop()!);
		}
		this.queue.push(makejson.fsPath);
		return task;
	}

	dispose():void
	{
		this.map.clear();
	}
}

export class ClosureTask extends vscode.Task
{
	static basic():vscode.Task
	{
		return new vscode.Task(
			{type: COMPILER_TYPE, task: DEFAULT_TASK, problemMatcher: PROBLEM_MATCHER}, 
			vscode.TaskScope.Workspace,
			DEFAULT_TASK,
			COMPILER_TYPE,
			new ClosureExecution(Workspace.getCurrent()));
	}

	static resolve(task:ClosureTask):ClosureTask|undefined
	{
		const workspace = Workspace.getCurrent();
		const map = workspace.query(FileTaskMap);
		if (!task.definition.output) return undefined;
	
		const newtask = map.get(workspace.child(task.definition.output));
		newtask.definition = task.definition;
		newtask.name = task.definition.task;
		newtask.source = COMPILER_TYPE;
		newtask.execution = newtask.execution;
        return newtask;
	}

	static fromMakeJson(workspace:Workspace, makejson:File):ClosureTask
	{
		const map = workspace.query(FileTaskMap);
		return map.getFromMakeJson(makejson);
	}
}
