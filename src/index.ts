import * as vscode from 'vscode';
import * as log from './vsutil/log';
import * as ws from './vsutil/ws';
import * as vsutil from './vsutil/vsutil';
import * as cmd from './vsutil/cmd';
import { cc } from './closure/cc';

import {commands as cfgcmd} from './cmd/config';
import {commands as cccmd} from './cmd/compiler';
import { closureCompilerTaskProvider } from './cmd/task';

export function activate(context:vscode.ExtensionContext) {
    console.log(`[extension: closurecompiler] activate`);
    cc.version().then(str=>{
        console.log(str);
    });

    vscode.tasks.registerTaskProvider('google-closure-compiler', closureCompilerTaskProvider);
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
