
import { File } from 'krfile';

import * as closure from './vsutil/closure';
import * as vsutil from './vsutil/vsutil';
import { Workspace } from './vsutil/ws';
import { Task, Scheduler } from './vsutil/work';
import { Config } from './config';
import { defaultLogger } from './vsutil/log';

export async function all(task:Task, workspace:Workspace):Promise<void>
{
	task.logger.clear();
	task.logger.show();
	
	const config = workspace.query(Config);
	const files = await task.with(workspace.glob('**/make.json'));
	
	for (const file of files)
	{
		await closure.build(task, file, config.splitConfig());
	}
	task.logger.message('FINISH ALL');
}

export function makeJson(makejson:File, input?:string):Promise<void>
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
		src: input, 
		output: output,
		includeReference: true,
		closure: {}
	};

	return makejson.initJson(makejsonDefault).then(() => vsutil.open(makejson)).then(()=>{});
}

export function make(task:Task, makejs:File):Promise<void>
{
	task.logger.clear();
	task.logger.show();
	const config = Workspace.fromFile(makejs).query(Config);
	return closure.build(task, makejs, config.splitConfig());
}

export const scheduler = new Scheduler(defaultLogger);
