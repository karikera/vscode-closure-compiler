
import { commands, ExtensionContext } from 'vscode';
import { File } from 'krfile';

import * as ws from './ws';
import * as log from './log';
import * as work from './work';
import * as vsutil from './vsutil';
import * as error from './error';
import { Workspace } from './ws';

export interface Args
{
	file?:File;
	workspace?:ws.Workspace;
}

export type Command = {[key:string]:(args:Args)=>any};

async function runCommand(commands:Command, name:string, ...args:any[]):Promise<void>
{
	var cmdargs:Args = {};

	try
	{
		try
		{
			cmdargs.file = await vsutil.fileOrEditorFile(args[0]);
			cmdargs.workspace = Workspace.fromFile(cmdargs.file);
		}
		catch(e)
		{
			if (!cmdargs.workspace) cmdargs.workspace = ws.Workspace.one(cmdargs.file);
		}

		log.defaultLogger.verbose(`[Command] ${name}`);
		await commands[name](cmdargs);
	}
	catch(err)
	{
		switch (err)
		{
		case 'PASSWORD_CANCEL':
			log.defaultLogger.verbose(`[Command:${name}]: cancelled by password input`);
			break;
		default:
			error.processError(log.defaultLogger, err);
			break;
		}
	}
}

export function registerCommands(context:ExtensionContext, ...cmdlist:Command[])
{
	for(const cmds of cmdlist)
	{
		for (const name in cmds)
		{
			const disposable = commands.registerCommand(name, (...args) => runCommand(cmds, name, ...args));
			context.subscriptions.push(disposable);
		}
	}
}
