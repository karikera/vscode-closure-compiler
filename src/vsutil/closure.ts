
import * as make from '../util/make';
import * as util from '../util/util';
import * as vs from '../util/vs';
import * as cc from '../util/closure';
import glob from '../util/pglob';
import File from '../util/file';

import * as work from './work';
import * as ws from './ws';


export interface Config
{
	js_output_file_filename?:string;
	js?:string[]|string;
	js_output_file?:string;
	generate_exports?:boolean;
	create_source_map?:string;
	output_wrapper?:string;
}

export interface MakeJsonConfig
{
	name:string;
	output:string;
	src:string[];
	export?:boolean;
	makejson:string;
	projectdir:string;
	closure?:Config;
	includeReference?:boolean;
}

export function closure(task:work.Task, options:MakeJsonConfig, config:Config):Promise<string>
{
    var projname = options.name;
    var out = options.output;
    var src = options.src;
    if (src.length == 0)
        return Promise.reject(Error("No source"));
    options.export = !!options.export;
    
    const makeFile = new make.MakeFile;

    makeFile.on(out, src.concat([options.makejson]), ()=>{
        return new Promise((resolve, reject)=> {
            const curdir = process.cwd();
            try
            {
                process.chdir(options.projectdir);
                task.logger.message(projname + ": BUILD");

                const ex_parameter:Config = {
                    js_output_file_filename: out.substr(out.lastIndexOf("/")+1)
                };
                const parameter:Config = {
                    js: src, 
                    js_output_file: out,
                    generate_exports: options.export
                };

                var finalOptions = util.merge(parameter, config, ex_parameter);
                finalOptions = util.merge(finalOptions, options.closure, ex_parameter);

				const args = [];
				util.addOptions(args, finalOptions);
				
				const java = new cc.Process(args);
                java.stdout = data => task.logger.message(data);
				java.stderr = data => task.logger.message(data);
				const oncancel = task.oncancel(()=>java.kill());
				java.onkill = ()=>{
					oncancel.dispose();
					reject(work.CANCELLED);
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
    });

    return makeFile.make(out).then(v=>make.State[v]);
}

export async function build(task:work.Task, makejson:File, config:Config):Promise<void>
{
	const projectdir = makejson.parent();
	const workspace = ws.getFromFile(makejson);
    function toAbsolute(p:string):string
    {
		var str:File;
        if (p.startsWith('/'))
            return workspace.child(p).fsPath;
        else
			return projectdir.child(p).fsPath;
    }

	var options:MakeJsonConfig = await makejson.json();
	if (!options)
	{
		const err = Error('invalid make.json');
		err.fsPath = makejson;
		throw err;
	}
    if (!options.name)
        options.name = ws.workpath(projectdir);
    options.projectdir = projectdir.fsPath;

    options.src = options.src instanceof Array ? options.src : [options.src];
    options.makejson = makejson.fsPath;
    options.output = toAbsolute(options.output);

    const arg = (await glob(options.src.map(toAbsolute))).map(path=>File.parse(path));

	if (options.includeReference !== false)
	{
		const includer = new vs.Includer;
		await includer.include(arg);
		if (includer.errors.length !== 0)
		{
			for(const err of includer.errors)
			{
				task.logger.message(err[0]+":"+err[1]+"\n\t"+err[2]);
			}
			return;
		}
		options.src = includer.list.map(file=>file.fsPath);
	}

	const msg = await closure(task, options, config);
	task.logger.message(options.name + ": "+msg);
}
