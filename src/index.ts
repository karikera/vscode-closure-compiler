import * as vscode from 'vscode';
const workspace = vscode.workspace;

import * as log from './vsutil/log';
import * as ws from './vsutil/ws';
import * as vsutil from './vsutil/vsutil';
import * as cmd from './vsutil/cmd';

import {commands as cfgcmd} from './cmd/config';
import {commands as cccmd} from './cmd/compiler';


let ccTask:vscode.Task[]|null;

export function activate(context:vscode.ExtensionContext) {
    console.log('[extension: closurecompiler] activate');
    // vscode.tasks.registerTaskProvider('google-closure-compiler', {
    //     provideTasks(){
    //       if (ccTask) return ccTask;
    //       return ccTask = [new vscode.Task(
    //         { type: 'rake', task: 'compile' },
    //         vscode.TaskScope.Workspace,
    //         'compile',
    //         'rake',
    //         new vscode.ShellExecution('rake compile')
    //       )];
    //     },
    //     resolveTask(_task: vscode.Task): vscode.Task | undefined {
    //       const task = _task.definition.task;
    //       if (task) {
    //         const definition: vscode.TaskDefinition = <any>_task.definition;
    //         return new vscode.Task(
    //           definition,
    //           definition.task,
    //           'rake',
    //           new vscode.ShellExecution(`rake ${definition.task}`)
    //         );
    //       }
    //       return undefined;
    //     }
    // });
        
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
