
import File from '../util/file';
import * as log from './log';
import * as vsutil from './vsutil';

declare global
{
	interface Error
	{
		suppress?:boolean;
		fsPath?:File;
		line?:number;
		column?:number;
	}
}

export function processError(logger:log.Logger, err)
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
			if (err.fsPath)
			{
				if (err.line)
				{
					vsutil.open(err.fsPath, err.line, err.column);
				}
				else
				{
					vsutil.open(err.fsPath);
				}
			}
		}
		break;
	}
}
