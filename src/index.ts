import * as vscode from 'vscode';
const workspace = vscode.workspace;

import * as log from './vsutil/log';
import * as ws from './vsutil/ws';
import * as work from './vsutil/work';
import * as vsutil from './vsutil/vsutil';
import * as cmd from './vsutil/cmd';

import * as cfg from './config';

import {commands as cfgcmd} from './cmd/config';
import {commands as cccmd} from './cmd/compiler';

export function activate(context:vscode.ExtensionContext) {
	console.log('[extension: closurecompiler] activate');

	cmd.registerCommands(context, cfgcmd, cccmd);
	vsutil.setContext(context);
	ws.Workspace.loadAll();	
}

export function deactivate() {
    try
    {
		ws.Workspace.unloadAll();
        console.log('[extension: closurecompiler] deactivate');
    }
    catch(err)
    {
        log.defaultLogger.error(err);
    }
}
