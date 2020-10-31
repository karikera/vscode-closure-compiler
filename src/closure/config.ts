
import { File } from 'krfile';
import { parseJson } from 'krjson';

import {ConfigContainer} from "../util/config";

import * as vsutil from "../vsutil/vsutil";
import { WorkspaceItem, Workspace } from '../vsutil/ws';

export interface ClosureConfig
{
	js_output_file_filename?:string;
	js?:string[]|string;
	js_output_file?:string;
	generate_exports?:boolean;
	create_source_map?:string;
	output_wrapper?:string;
	remove_last_line?:boolean;
	entry_point?:string;
	js_module_root?:string;
}

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
	public readonly options:ClosureConfig = <any>{};
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

	public async init():Promise<void>
	{
		const data:ClosureConfig = await this.path.initJson(CONFIG_INIT);
		vsutil.open(this.path);
		this.set(data);
	}

	public set(obj:ClosureConfig):void
	{
		if (!(obj instanceof Object))
		{
			throw new TypeError("Invalid json data type: "+ typeof obj);
		}
		
		this.clearConfig();
		this.appendConfig(CONFIG_BASE);
		this.appendConfig(obj);
	}

	public async load():Promise<void>
	{
		var data:string;
		try
		{
			const mtime = await this.path.mtime();
			if (this.lastModified === mtime) return;
			data = await this.path.open();
		}
		catch(err)
		{
			const data = await this.path.initJson(CONFIG_INIT);
			this.set(data);
			return;
		}
		this.set(parseJson(data));
	}
}

export const GlobalConfig:{new(workspace:Workspace):ConfigClass&ClosureConfig} = ConfigClass;
export type GlobalConfig = ConfigClass & ClosureConfig;
