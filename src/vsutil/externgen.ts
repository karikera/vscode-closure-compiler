
import * as cp from 'child_process';
import { File } from 'krfile';

import * as work from './work';

export function gen(task:work.Task, jsfile:File):Promise<void>
{
	const logger = task.logger;
	return new Promise<void>((res, rej)=>{
		const jsfiledir = jsfile.parent();
		const proc = cp.fork(`${__dirname}/externgen_sandbox.js`, [jsfile.fsPath], {cwd:jsfiledir.fsPath});
		var end = false;
		proc.on('message', (data:{error:string, output:string}|string)=>{
			if (typeof data  === 'string')
			{
				logger.message(data);
				return;
			}
			end = true;
			if (data.error)
			{
				rej(Error(data.error));
			}
			else
			{
				logger.message(data.output);
				res();
			}
		});
		const oncancel = task.oncancel(()=>proc.kill());
		proc.on('close', (exitCode, signal)=>{
			if (signal === 'SIGTERM')
			{
				oncancel.dispose();
				rej(work.CANCELLED);
				return;
			}			
			if (!end) rej(Error('exit code:'+exitCode));
		});
	});
}
