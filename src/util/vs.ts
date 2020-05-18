
import {Tag,Reader} from './reader';
import { File } from 'krfile';
import { findImports } from './findimports';

export class Includer
{
	included:Set<string> = new Set;
	including:Set<string> = new Set;
	list:File[] = [];
	errors:Array<[File, number, string]> = [];
	level:number = 0;

	constructor(private readonly opts:{includeImports?:boolean, includeReference?:boolean})
	{
	}
	
	private async _append(src:File):Promise<void>
	{
		if (this.included.has(src.fsPath))
			return;
		if (this.including.has(src.fsPath))
		{
			throw Error('Recursive including');
		}
		this.included.add(src.fsPath);
		this.including.add(src.fsPath);

		try
		{
			console.log('    '.repeat(this.level)+src.fsPath);
	
			const data = await src.open();
			this.level ++;
			const dir = src.parent();
			
			if (this.opts.includeImports !== false)
			{
				try
				{
					const imports = await findImports(src, data);
					for (const imp of imports)
					{
						try
						{
							await this._append(imp.file);
						}
						catch (err)
						{
							this.errors.push([src, imp.line, err.message]);
						}
					}
				}
				catch (err)
				{
					if (err.lineNumber !== undefined)
					{
						this.errors.push([src, err.lineNumber, err.message]);
					}
					else
					{
						throw err;
					}
				}
			}
	
			if (this.opts.includeReference !== false)
			{
				for (const tag of readXml(data))
				{
					switch (tag.name)
					{
					case "reference":
						var file = dir.child(tag.props.path);
						if (file.fsPath.endsWith('.d.ts')) break;
						try
						{
							await this._append(file);
						}
						catch (err)
						{
							this.errors.push([src, tag.lineNumber, err.message]);
						}
						break;
					}
				}
			}
			this.list.push(src);
			this.level --;
		}
		catch (err)
		{
			if (err.code === 'ENOENT')
			{
				throw Error("File not found: "+src.fsPath);
			}
		}
	}

	public async append(src:File|File[], appender:File):Promise<void>
	{
		console.log('INCLUDER>');
		if (src instanceof Array)
		{
			for (var i=0;i<src.length;i++)
			{
				try
				{
					await this._append(src[i]);
				}
				catch (err)
				{
					this.errors.push([appender, 0, err.message]);
				}
			}
			return;
		}
		else
		{
			try
			{
				await this._append(src);
			}
			catch (err)
			{
				this.errors.push([appender, 0, err.message]);
			}
		}
	}
}

export function readXml(data:string):Tag[]
{
	const page = new Reader;
	page.data = data;
	if (data.charCodeAt(0) === 0xfeff) page.i = 1;

	var lineNumber = 0;
	const line = new Reader;
	const out:Tag[] = [];

	for(;;)
	{
		page.skipSpace();
		if (!page.startsWith("///")) break;
		
		lineNumber++;
		line.i = 0;
		var linestr = page.readTo("\n");
		if (!linestr) continue;
	
		line.data = linestr;
		const close = line.data.lastIndexOf("/>");
		if (close === -1) continue;
		line.data = line.data.substr(0, close);

		line.skipSpace();
		if (!line.startsWith("<")) continue;
		out.push(new Tag(line, lineNumber));
	}
	return out;
}
