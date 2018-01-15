
import File from './util/file';

import * as closure from './vsutil/closure';
import * as log from './vsutil/log';
import * as ws from './vsutil/ws';
import * as work from './vsutil/work';
import * as vsutil from './vsutil/vsutil';

import * as cfg from './config';

export async function all(task:work.Task, workspace:ws.Workspace):Promise<void>
{
	task.logger.clear();
	task.logger.show();
	
	const config = workspace.query(cfg.Config);
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

export function make(task:work.Task, makejs:File):Promise<void>
{
	task.logger.clear();
	task.logger.show();
	const config = ws.getFromFile(makejs).query(cfg.Config);
	return closure.build(task, makejs, config.splitConfig());
}

export const scheduler = new work.Scheduler(log.defaultLogger);
