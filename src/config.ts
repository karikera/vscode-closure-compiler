
import {Options as FtpOptions} from 'ftp';
import {ConnectConfig as SftpOptions} from 'ssh2';
import minimatch = require('minimatch');

import File from "./util/file";
import {ConfigContainer} from "./util/config";
import * as util from "./util/util";
import * as closure from './closure';

import {Config as ClosureConfig} from "./vsutil/closure";
import * as log from "./vsutil/log";
const logger = log.defaultLogger;
import * as ws from "./vsutil/ws";
import * as work from "./vsutil/work";
import * as vsutil from "./vsutil/vsutil";
import * as error from "./vsutil/error";

const CONFIG_BASE:ClosureConfig = {
	create_source_map: "%js_output_file%.map",
	output_wrapper: "%output%\n//# sourceMappingURL=%js_output_file_filename%.map"
};
const CONFIG_INIT:ClosureConfig = {
	create_source_map: "%js_output_file%.map",
	output_wrapper: "%output%\n//# sourceMappingURL=%js_output_file_filename%.map"
};
const REGEXP_MAP = {
	".": "\\.", 
	"+": "\\+", 
	"?": "\\?", 
	"[": "\\[", 
	"]": "\\]",
	"^": "^]",
	"$": "$]",
	"*": "[^/]*",
	"**": ".*"
};

export enum State
{
	NOTFOUND,
	INVALID,
	LOADED
}

function patternToRegExp(pattern:string):RegExp
{
	let regexp = pattern.replace(/([.?+\[\]^$]|\*\*?)/g, chr=>REGEXP_MAP[chr]);
	if (regexp.startsWith("/"))
		regexp = "^" + regexp;
	else
		regexp = ".*/"+regexp;
	if (!regexp.endsWith("/"))
		regexp += "(/.*)?$";
	return new RegExp(regexp);
}

class ConfigClass extends ConfigContainer implements ws.WorkspaceItem
{
	readonly path:File;
	public readonly options:Config = <any>{};
	private lastModified:number = 0;

	constructor(private workspace:ws.Workspace)
	{
		super();

		this.path = workspace.child('./.vscode/closurecompiler.json');

		this.clearConfig();
		this.appendConfig(CONFIG_BASE);
	}

	dispose()
	{
	}

	public init():Thenable<void>
	{
		return this.taskWrap('closureCompiler.init', async(task)=>{
			const data:Config = await this.path.initJson(CONFIG_INIT);
			vsutil.open(this.path);
			this.set(data);
		});
	}

	public set(obj:Config):void
	{
		if (!(obj instanceof Object))
		{
			throw new TypeError("Invalid json data type: "+ typeof obj);
		}
		
		this.clearConfig();
		this.appendConfig(CONFIG_BASE);
		this.appendConfig(obj);
	}

	public load():Thenable<void>
	{
		return this.taskWrap('config loading', async(task)=>{
			var data;
			try
			{
				const mtime = await this.path.mtime();
				if (this.lastModified === mtime) return;
				data = await this.path.open();
			}
			catch(err)
			{
				data = await this.path.initJson(CONFIG_INIT);
				this.set(data);
				return;
			}
			this.set(util.parseJson(data));
		});
	}

	private taskWrap(name:string, onwork:(task:work.Task)=>Promise<void>):Thenable<void>
	{
		return closure.scheduler.taskWithTimeout(name, 1000,task=>onwork(task));
	}
}


export const Config:{new(workspace:ws.Workspace):ConfigClass&ClosureConfig} = ConfigClass;
export type Config = ConfigClass & ClosureConfig;
