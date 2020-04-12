
import { File } from 'krfile';
import { parseJson } from 'krjson';

import {ConfigContainer} from "./util/config";

import {Config as ClosureConfig} from "./vsutil/closure";
import * as vsutil from "./vsutil/vsutil";
import { WorkspaceItem, Workspace } from './vsutil/ws';
import { Task } from './vsutil/work';

import * as closure from './closure';


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

class ConfigClass extends ConfigContainer implements WorkspaceItem
{
	readonly path:File;
	public readonly options:Config = <any>{};
	private lastModified:number = 0;

	constructor(private workspace:Workspace)
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
			this.set(parseJson(data));
		});
	}

	private taskWrap(name:string, onwork:(task:Task)=>Promise<void>):Thenable<void>
	{
		return closure.scheduler.taskWithTimeout(name, 1000,task=>onwork(task));
	}
}


export const Config:{new(workspace:Workspace):ConfigClass&ClosureConfig} = ConfigClass;
export type Config = ConfigClass & ClosureConfig;
