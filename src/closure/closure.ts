import globby = require('globby');
import { krarg } from 'krarg';
import { File } from 'krfile';
import path = require('path');

import * as make from '../util/make';
import * as vs from '../util/vs';

import { Workspace } from '../vsutil/ws';
import { Task, CANCELLED, Scheduler } from '../vsutil/work';
import { defaultLogger } from '../vsutil/log';
import * as vsutil from '../vsutil/vsutil';

import { cc } from './cc';
import { ClosureConfig, GlobalConfig } from './config';

export namespace closure
{
	export interface MakeJsonConfig
	{
		name?:string;
		label?:string;
		output:string;
		src?:string[];
		entry?:string;
		export?:boolean;
		additionalDeps?:string[];
		projectdir:string;
		closure?:ClosureConfig;
		includeReference?:boolean;
		includeImports?:boolean;
	}
	
	function hasGlobPattern(path:string):boolean
	{
		return /[*?\[\]!?+*@{}\(\)|]/.test(path);
	}
	
	async function closure(task:Task, options:MakeJsonConfig, config:ClosureConfig):Promise<string>
	{
		let projname = options.name;
		let out = options.output;
		if (!out) throw Error('Invalid options, output not found');
		options.export = !!options.export;
		
		const makeFile = new make.MakeFile;
			
		const ex_parameter:ClosureConfig = {
			js_output_file_filename: path.basename(out),
		};
	
		const files = new Set<string>();
		if (options.src)
		{
			for (const file of options.src) files.add(file);
		}
		if (config.js)
		{
			for (const file of config.js) files.add(file);
			delete config.js;
		}
		if (options.closure && options.closure.js)
		{
			for (const file of options.closure.js) files.add(file);
			delete options.closure.js;
		}
		if (files.size == 0) throw Error("No source");
		const src = [...files];
		const parameter:ClosureConfig = {
			js: src, 
			js_output_file: out,
			generate_exports: options.export
		};
		
		let finalOptions = krarg.merge(parameter, config, ex_parameter);
		finalOptions = krarg.merge(finalOptions, options.closure, ex_parameter);
	
		if (finalOptions.output_wrapper && out.endsWith('.html'))
		{
			finalOptions.output_wrapper = finalOptions.output_wrapper.replace(/[\x80-\uffff]/g, 
				str=>'&#'+str.charCodeAt(0)+';');
		}
	
		function callClosure():Promise<make.State>
		{
			return new Promise((resolve, reject)=> {
				const curdir = process.cwd();
				try
				{
					process.chdir(options.projectdir);
					task.log(projname + ": BUILD");
					
					const java = new cc.Process(finalOptions);
					java.stdout = data => task.log(data);
					java.stderr = data => task.log(data);
					const oncancel = task.oncancel(()=>java.kill());
					java.onkill = ()=>{
						oncancel.dispose();
						reject(CANCELLED);
					};
					java.onerror = (err)=>{
						reject(err);
					};
					java.onclose = code=>{
						if (code === 0) resolve(make.State.COMPLETE);
						else
						{
							task.log(`Exit Code: ${code}`);
							resolve(make.State.ERROR);
						}
					};
	
					process.chdir(curdir);
				}
				catch (err)
				{
					process.chdir(curdir);
					reject(err);
				}
			});
		}
	

		let deps:string[];
		if (options.additionalDeps) deps = src.concat(options.additionalDeps);
		else deps = src;
		makeFile.on(out, deps, async ()=>{
			const res = await callClosure();
			if (res === make.State.ERROR) return res;
			if (finalOptions.js_output_file && finalOptions.js_output_file.endsWith('.html'))
			{
				const file = new File(finalOptions.js_output_file);
				const stat = await file.stat();
				await file.truncate(stat.size - 1);
			}
			return res;
		});
	
		const v = await makeFile.make(out);
		return make.State[v];
	}
	
	export async function buildWith(task:Task, projectdir:File, options:MakeJsonConfig, additionalDep:File[]):Promise<void>
	{
		if (!options.output) throw Error('Invalid options, output not found');
		const workspace = Workspace.fromFile(projectdir);
		
		const globalConfig = workspace.query(GlobalConfig);
		await globalConfig.load();
		const config = globalConfig.splitConfig();
	
		function toAbsolute<T>(p:T, curdir:File):T
		{
			if (p instanceof Array)
			{
				for (let i=0;i<p.length;i++)
				{
					p[i] = toAbsolute(p[i], curdir);
				}
			}
			else
			{
				switch (typeof p)
				{
				case 'string':
					if (p.startsWith('/'))
						return workspace.child(p).fsPath as any;
					else
						return curdir.child(p).fsPath as any;
					break;
				case 'object':
					for (const key in p)
					{
						p[key] = toAbsolute(p[key], curdir);
					}
					break;
				}
			}
			return p;
		}
		function configToAbsolute(config:ClosureConfig, curdir:File):void
		{
			if (config.js) config.js = toAbsolute(config.js, curdir);
			if (config.entry_point) config.entry_point = toAbsolute(config.entry_point, curdir);
			if (config.js_module_root) config.js_module_root = toAbsolute(config.js_module_root, curdir);
		}
	
		if (!options.name)
			options.name = options.label || workspace.workpath(projectdir);
		options.projectdir = projectdir.fsPath;
	
		if (options.src) options.src = options.src instanceof Array ? options.src : [options.src];
		if (options.additionalDeps)
		{
			options.additionalDeps = options.additionalDeps instanceof Array ? options.additionalDeps : [options.additionalDeps];
			options.additionalDeps = toAbsolute(options.additionalDeps, projectdir);
			options.additionalDeps.push(...additionalDep.map(file=>file.fsPath));
		}
		options.output = toAbsolute(options.output, projectdir);
		
		if (options.closure) configToAbsolute(options.closure, projectdir);
		configToAbsolute(config, workspace);
	
		const arg:File[] = [];
		if (options.entry) arg.push(new File(toAbsolute(options.entry, projectdir)));
		if (options.src)
		{
			const globFiles:string[] = [];
			const normalFiles:string[] = [];
			const files = options.src.map(name=>toAbsolute(name, projectdir));
			for (const file of files)
			{
				if (hasGlobPattern(file)) globFiles.push(file);
				else normalFiles.push(file);
			}
			arg.push(...(await globby(globFiles)).map(path=>new File(path)));
			arg.push(... normalFiles.map(path=>new File(path)));
		}
	
		if (options.includeReference !== false || options.includeImports !== false)
		{
			const includer = new vs.Includer(options);
			console.log(`${options.name}: INCLUDES`);
			for (const dep of additionalDep)
			{
				await includer.append(arg, dep);
			}
			if (includer.errors.length !== 0)
			{
				for(const err of includer.errors)
				{
					task.log(err[0].fsPath+":"+err[1]+"\n\t"+err[2]);
				}
				return;
			}
			options.src = includer.list.map(file=>file.fsPath);
		}
	
		const msg = await closure(task, options, config);
		task.log(options.name + ": "+msg);
	}
	
	export async function build(task:Task, makejson:File):Promise<void>
	{
		const projectdir = makejson.parent();
		const options:MakeJsonConfig = await makejson.json();
		if (options === null || typeof options !== 'object')
		{
			const err = Error('Invalid make.json, is not object');
			err.file = makejson;
			throw err;
		}
		if (!options.output)
		{
			const err = Error('Invalid make.json, has not output');
			err.file = makejson;
			throw err;
		}
		await buildWith(task, projectdir, options, [makejson]);
	}
	
	export async function makeJson(makejson:File, input?:string):Promise<void>
	{
		var output = '';
		if (input && input.endsWith('.js'))
		{
			
			output = input.substr(0, input.indexOf('.')+1) +'min.js';
		}
		else
		{
			input = "./script.js";
			output = './script.min.js';
		}
		
		var folder = makejson.parent();
		var appname = folder.basename();
		if (appname === 'src')
		{
			appname = folder.parent().basename();
			output = '../'+output.substr(output.lastIndexOf('/')+1);
		}

		const makejsonDefault = 
		{
			name: appname,
			entry: input,
			output: output,
			includeImports: true,
			includeReference: true,
			closure: {}
		};

		await makejson.initJson(makejsonDefault);
		await vsutil.open(makejson);
	}

	export const scheduler = new Scheduler(defaultLogger);
	
}
