
import * as vscode from 'vscode';
const workspace = vscode.workspace;

import * as externgen from '../vsutil/externgen';
import * as log from '../vsutil/log';
const logger = log.defaultLogger;
import * as cmd from '../vsutil/cmd';
import * as vsutil from '../vsutil/vsutil';
import { closure } from '../closure/closure';

import { ClosureAllTask, ClosureTask } from '../closure';

export const commands:cmd.Command = {
	async['closureCompiler.makejson'](args:cmd.Args){
		if (!args.file) throw Error('No file selected');
		await closure.makeJson(args.file.sibling('make.json'), args.file.basename());
	},
		
	async['closureCompiler.compile'](args:cmd.Args){
		if (!args.workspace)
		{
			args.workspace = await vsutil.createWorkspace();
			if (!args.workspace) return;
		}
		await workspace.saveAll();
		if (args.file)
		{
			if(args.file.basename() === 'make.json')
			{
			}
			else
			{
				args.file = args.file.sibling('make.json');
				if (!(await args.file.exists()))
				{
					args.file = undefined;
				}
			}
		}
		try
		{
			if (!args.file) args.file = await vsutil.selectFile(undefined, "compileTarget"); // '**/make.json'
			if (args.file) await vscode.tasks.executeTask(ClosureTask.fromMakeJson(args.workspace, args.file));
		}
		catch(err)
		{
			if (err !== 'NO_FILE') throw err;			
			if (!args.file) throw Error('Need make.json file, You can use Generate make.json command');
			const select = await logger.errorConfirm(Error('Need makejson file'), 'Generate make.json');
			if (!select) return;
			await closure.makeJson(args.file.sibling('make.json'), args.file.basename());
		}
	},

	async 'closureCompiler.compileAll'(args:cmd.Args){
		if (!args.workspace)
		{
			args.workspace = await vsutil.createWorkspace();
			if (!args.workspace) return;
		}

		await workspace.saveAll();
	
		const alltask = args.workspace.query(ClosureAllTask);
		await vscode.tasks.executeTask(alltask);
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
