
import * as vscode from 'vscode';
const workspace = vscode.workspace;
const window = vscode.window;

import * as externgen from '../vsutil/externgen';
import * as log from '../vsutil/log';
const logger = log.defaultLogger;
import { File } from 'krfile';
import * as cmd from '../vsutil/cmd';
import * as vsutil from '../vsutil/vsutil';
import { Workspace } from '../vsutil/ws';

import * as cfg from '../config';
import * as closure from '../closure';

async function compileClosure(args:cmd.Args, jsonfile:File)
{
	args.workspace = Workspace.createFromFile(jsonfile);
	
	const config = args.workspace.query(cfg.Config);
	await config.load();
	await workspace.saveAll();

	closure.scheduler.taskWithTimeout('closureCompiler.compile', 1000, async(task) => {

		try
		{
			await closure.make(task, jsonfile);
			if (jsonfile)
			{
				vsutil.addLatestSelectedFile("compileTarget", jsonfile);
				args.workspace = Workspace.createFromFile(jsonfile);
			}
		}
		catch(err)
		{
			logger.error(err);
		}
	});
}

export const commands:cmd.Command = {
	async['closureCompiler.gotoErrorLine'](args:cmd.Args){
		log.defaultLogger.gotoErrorLine();
	},
	async['closureCompiler.makejson'](args:cmd.Args){
		if (!args.file) throw Error('No file selected');
		await closure.makeJson(args.file.sibling('make.json'), args.file.basename());
	},
		
	async['closureCompiler.compile'](args:cmd.Args){
		if (args.file)
		{
			if(args.file.basename() === 'make.json')
			{
				return await compileClosure(args, args.file);
			}
			else
			{
				args.file = args.file.sibling('make.json');
				if (await args.file.exists())
				{
					return await compileClosure(args, args.file);
				}
			}
		}
		try
		{
			args.file = await vsutil.selectFile(undefined, "compileTarget"); // '**/make.json'
			if (args.file)
			{
				return await compileClosure(args, args.file);
			}
		}
		catch(err)
		{
			if (err !== 'NO_FILE') throw err;			
			if (!args.file) throw Error('Need make.json file, You can use Generate make.json command');
			const select = await logger.errorConfirm(Error('Need makejson file'), 'Generate make.json');
			if (!select) return;
			await closure.makeJson(args.file.sibling('make.json'), args.file.basename());
			return;
		}
	},

	async 'closureCompiler.compileAll'(args:cmd.Args){
		if (!args.workspace)
		{
			args.workspace = await vsutil.createWorkspace();
			if (!args.workspace) return;
		}

		const config = args.workspace.query(cfg.Config);
		await config.load();
		await workspace.saveAll();
		const curworkspace = args.workspace;

		closure.scheduler.taskWithTimeout('closureCompiler.compileAll', 1000, async(task) => {
			logger.clear();
			logger.show();
			return closure.all(task, curworkspace);
		});
	},
	async 'closureCompiler.generateExtern'(args:cmd.Args){
		if (!args.file) throw Error('File is not selected');
		const selected = args.file;

		closure.scheduler.taskWithTimeout('closureCompiler.generateExtern', 1000, async (task) => {
			logger.show();
			return externgen.gen(task, selected);
		});
	}
};
