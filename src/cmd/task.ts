
import path = require('path');
import vscode = require('vscode');

import { ClosureTask } from '../closure';

let ccTask:vscode.Task[]|null;

export const closureCompilerTaskProvider:vscode.TaskProvider<vscode.Task> = {
    provideTasks(){
      if (ccTask) return ccTask;
      return ccTask = [ClosureTask.basic()];
    },
    resolveTask(_task: vscode.Task): vscode.Task | undefined {
      const task = _task.definition.task;
      if (task) {
        return ClosureTask.resolve(_task);
      }
      return undefined;
    }
};