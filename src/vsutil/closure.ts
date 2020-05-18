import globby = require('globby');
import { krarg } from 'krarg';
import { File } from 'krfile';
import path = require('path');

import * as make from '../util/make';
import * as vs from '../util/vs';
import * as cc from '../util/closure';

import { Workspace } from './ws';
import { Task, CANCELLED } from './work';

export interface Config
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

export interface MakeJsonConfig
{
	name:string;
	output:string;
	src?:string[];
	entry?:string;
	export?:boolean;
	makejson:string;
	projectdir:string;
	closure?:Config;
	includeReference?:boolean;
	includeImports?:boolean;
}

function hasGlobPattern(path:string):boolean
{
	return /[*?\[\]!?+*@{}\(\)|]/.test(path);
}

export async function closure(task:Task, options:MakeJsonConfig, config:Config):Promise<string>
{
    var projname = options.name;
    var out = options.output;
	options.export = !!options.export;
	
	const makeFile = new make.MakeFile;
		
	const ex_parameter:Config = {
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
	const parameter:Config = {
		js: src, 
		js_output_file: out,
		generate_exports: options.export
	};
	
	var finalOptions = krarg.merge(parameter, config, ex_parameter);
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
				task.logger.message(projname + ": BUILD");
				
				const args = krarg.create(finalOptions);
				
				const java = new cc.Process(args);
				java.stdout = data => task.logger.message(data);
				java.stderr = data => task.logger.message(data);
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
					else resolve(make.State.ERROR);
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

    makeFile.on(out, src.concat([options.makejson]), async ()=>{
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

export async function build(task:Task, makejson:File, config:Config):Promise<void>
{
	const projectdir = makejson.parent();
	const workspace = Workspace.fromFile(makejson);
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
	function configToAbsolute(config:Config, curdir:File):void
	{
		if (config.js) config.js = toAbsolute(config.js, curdir);
		if (config.entry_point) config.entry_point = toAbsolute(config.entry_point, curdir);
		if (config.js_module_root) config.js_module_root = toAbsolute(config.js_module_root, curdir);
	}

	var options:MakeJsonConfig = await makejson.json();
	if (!options)
	{
		const err = Error('invalid make.json');
		err.file = makejson;
		throw err;
	}
    if (!options.name)
        options.name = workspace.workpath(projectdir);
    options.projectdir = projectdir.fsPath;

    if (options.src) options.src = options.src instanceof Array ? options.src : [options.src];
    options.makejson = makejson.fsPath;
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
		await includer.append(arg, makejson);
		if (includer.errors.length !== 0)
		{
			for(const err of includer.errors)
			{
				task.logger.message(err[0].fsPath+":"+err[1]+"\n\t"+err[2]);
			}
			return;
		}
		options.src = includer.list.map(file=>file.fsPath);
	}

	const msg = await closure(task, options, config);
	task.logger.message(options.name + ": "+msg);
}
