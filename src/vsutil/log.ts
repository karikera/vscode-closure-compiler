
import * as ws from './ws';
import { OutputChannel, window } from 'vscode';
import * as vsutil from './vsutil';
import * as fs from 'fs';
import File from '../util/file';

export type Level = 'VERBOSE' | 'NORMAL' | 'ERROR';
enum LogLevelEnum
{
	VERBOSE,
	NORMAL,
	ERROR,
}

const MAXIMUM_TRACE_LENGTH = 4096;

export class Logger implements ws.WorkspaceItem
{
	public logLevel:LogLevelEnum = LogLevelEnum.NORMAL;
	private output:OutputChannel|null = null;
	private text:string = '';
	private errorLineFindIndex:number = 0;
	public static all:Set<Logger> = new Set;

	constructor(name:string|ws.Workspace)
	{
		if (name instanceof ws.Workspace)
		{
			name = "CC/" + name.name;
		}
		this.output = window.createOutputChannel(name);
		Logger.all.add(this);
	}
	
	private print(message:string):void
	{
		if (!this.output) return;
		this.output.appendLine(message);
		if (this.text.length < MAXIMUM_TRACE_LENGTH)
		{
			this.text += message+'\n';
		}
	}

	private log(level:LogLevelEnum, ...message:string[]):void
	{
		if (level < this.logLevel) return;
		switch (this.logLevel)
		{
		case LogLevelEnum.VERBOSE:
			this.print(LogLevelEnum[level]+': '+message.join(' ').replace(/\n/g, '\nVERBOSE: '));
			break;
		default:
			this.print(message.join(' '));
			break;
		}
	}

	public async gotoErrorLine():Promise<void>
	{
		var i = this.errorLineFindIndex;
		const regexp = /([ \t\r\n]*[a-zA-Z]\:)?[\\/][^<>:"|?*\0-\x1f]+/g;
		const numexp = /[0-9]+/g;
		regexp.lastIndex = i;
		for (;;)
		{
			const find = regexp.exec(this.text);
			if (find)
			{
				const front = regexp.lastIndex - find[0].length;
				const filename = find[0].trim();
				const exists = await new Promise<boolean>(resolve=>fs.exists(filename, resolve));
				if (exists)
				{
					const nextLineIdx = this.text.indexOf('\n', regexp.lastIndex);
					const line = nextLineIdx === -1 ? this.text.substr(regexp.lastIndex) : this.text.substring(regexp.lastIndex, nextLineIdx);
					
					numexp.lastIndex = 0;
					const lineNumber = numexp.exec(line);
					const column = numexp.exec(line);
					const lineNumber_ = lineNumber ? +lineNumber[0] : 0;
					const column_ = column ? +column[0] : 0;

					const file = File.parse(filename);
					vsutil.open(file, lineNumber_, column_);
					this.errorLineFindIndex = regexp.lastIndex;
					return;
				}
				regexp.lastIndex = regexp.lastIndex - find[0].length + 1;
			}
			else
			{
				this.errorLineFindIndex = 0;
				return;
			}
		}
	}
	
	public setLogLevel(level:Level):void
	{
		this.logLevel = LogLevelEnum[level];
		this.verbose(`logLevel = ${level}`);

		if (this.logLevel === defaultLogger.logLevel)
		{
			var minLevel = LogLevelEnum.ERROR;
			for (const logger of Logger.all)
			{
				if (logger.logLevel < minLevel)
				{
					minLevel = logger.logLevel;
				}
			}
			defaultLogger.logLevel = minLevel;
		}
	}
	
	public message(...message:string[]):void
	{
		this.log(LogLevelEnum.NORMAL, ...message);
	}
	
	public verbose(...message:string[]):void
	{
		this.log(LogLevelEnum.VERBOSE, ... message);
	}
		
	public error(err:NodeJS.ErrnoException|string):void
	{
		console.error(err);
		this.log(LogLevelEnum.ERROR, err.toString());
		if (err instanceof Error)
		{
			window.showErrorMessage(err.message, 'Detail')
			.then(res=>{
				if (res !== 'Detail') return;
				var output = '[';
				output += err.constructor.name;
				output += ']\nmessage: ';
				output += err.message;
				if (err.code)
				{
					output += '\ncode: ';
					output += err.code;
				}
				if (err.errno)
				{
					output += '\nerrno: ';
					output += err.errno;
				}
				output += '\n[Stack Trace]\n';
				output += err.stack;
				vsutil.openNew(output);
			});
		}
		else
		{
			window.showErrorMessage(err.toString());
		}
	}

	public errorConfirm(err:Error|string, ...items:string[]):Thenable<string|undefined>
	{
		var msg:string;
		if (err instanceof Error)
		{
			msg = err.message;
			console.error(err);
			this.log(LogLevelEnum.ERROR, err.toString());
		}
		else
		{
			msg = err;
			console.error(new Error(err));
			this.log(LogLevelEnum.ERROR, err);
		}

		return window.showErrorMessage(msg, ...items);
	}

	public wrap(func:()=>void):void
	{
		try
		{
			func();
		}
		catch(err)
		{
			this.error(err);
		}
	}

	public show():void
	{
		if (!this.output) return;
		this.output.show();
	}

	public clear():void 
	{
		const out = this.output;
		if (!out) return;
		out.clear();
		this.text = '';
		this.errorLineFindIndex = 0;
	}

	public dispose():void
	{
		const out = this.output;
		if (!out) return;
		out.dispose();
		this.output = null;
		this.text = '';
		this.errorLineFindIndex = 0;
		Logger.all.delete(this);
	}

}

export const defaultLogger:Logger = new Logger('Closure Compiler');
