
import { File } from 'krfile';
import 'krjson';

import * as log from './log';
import * as vsutil from './vsutil';

declare global
{
	interface Error
	{
		suppress?:boolean;
	}
}

export function processError(logger:log.Logger, err:any)
{
	switch (err)
	{
	case 'IGNORE': break;
	default:
		if (err instanceof Error)
		{
			if (!err.suppress)
			{
				logger.message("closurecompiler.json: error");
				logger.error(err);
			}
			else
			{
				logger.show();
				logger.message("closurecompiler.json: "+err.message);
			}
			if (err.file instanceof File)
			{
				if (err.line)
				{
					vsutil.open(err.file, err.line, err.column);
				}
				else
				{
					vsutil.open(err.file);
				}
			}
		}
		break;
	}
}
