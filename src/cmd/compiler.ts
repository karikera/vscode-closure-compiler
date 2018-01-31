
import * as vscode from 'vscode';
const workspace = vscode.workspace;
const window = vscode.window;

import File from '../util/File';

import * as externgen from '../vsutil/externgen';
import * as ws from '../vsutil/ws';
import * as log from '../vsutil/log';
const logger = log.defaultLogger;
import * as cmd from '../vsutil/cmd';
import * as vsutil from '../vsutil/vsutil';
import * as work from '../vsutil/work';

import * as cfg from '../config';
import * as closure from '../closure';

export const commands:cmd.Command = {
	async['closureCompiler.gotoErrorLine'](args:cmd.Args){
		if (!args.workspace) throw Error('No workspace selected');
		log.defaultLogger.gotoErrorLine();
	},
	async['closureCompiler.makejson'](args:cmd.Args){
		if (!args.file) throw Error('No file selected');
		await closure.makeJson(args.file.sibling('make.json'), args.file.basename());
	},
		
	async['closureCompiler.compile'](args:cmd.Args){
		if (!args.file || args.file.basename() !== 'make.json')
		{
			try
			{
				args.file = await vsutil.selectFile('**/make.json', "compileTarget");
				if (!args.file) return;
			}
			catch(err)
			{
				if (err !== 'NO_FILE') throw err;			
				if (!args.file) throw Error('Need make.json file, You can use Generate make.json command');
			}
		}
		args.workspace = ws.createFromFile(args.file);

		const selected = args.file;
		const config = args.workspace.query(cfg.Config);
		await config.load();
		await workspace.saveAll();

		closure.scheduler.taskWithTimeout('closureCompiler.compile', 1000, async(task) => {

			var makejson = selected.sibling('make.json');
			try
			{
				if (!await makejson.exists())
				{
					const select = await logger.errorConfirm(Error('Need makejson file'), 'Generate make.json');
					if (!select) return;
					await closure.makeJson(makejson, selected.basename());
				}
				await closure.make(task, makejson);
				if (args.file)
				{
					vsutil.addLatestSelectedFile("compileTarget", args.file);
					args.workspace = ws.createFromFile(args.file);
				}
			}
			catch(err)
			{
				logger.error(err);
			}
		});
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
