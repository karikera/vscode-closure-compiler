
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
	if (input && input.endsWith('.js'))
	{
	}
	else
	{
		input = "./script.js";
	}
	const output = input +'.min.js';
	const makejsonDefault = 
	{
		name: "jsproject",
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
