
import * as event from '../util/event';

import * as ws from '../vsutil/ws';
import * as log from '../vsutil/log';
import * as work from '../vsutil/work';
import * as vsutil from '../vsutil/vsutil';

import * as cfg from '../config';
import * as closure from '../closure';

export const commands = {
	async 'closureCompiler.init'(){
		const workspace = await vsutil.createWorkspace();
		if (!workspace) return;
		const config = workspace.query(cfg.Config);
		await config.init();
	},
	'closureCompiler.cancel'(){
		closure.scheduler.cancel();
	},
};
