
import * as vsutil from '../vsutil/vsutil';

import { GlobalConfig } from '../closure/config';
import { closure } from '../closure/closure';

export const commands = {
	async 'closureCompiler.init'(){
		const workspace = await vsutil.createWorkspace();
		if (!workspace) return;
		const config = workspace.query(GlobalConfig);
		
		return closure.scheduler.taskWithTimeout('closureCompiler.init', 1000,()=>config.init());
	},
	'closureCompiler.cancel'(){
		closure.scheduler.cancel();
	},
};
