
import {Tag,Reader} from './reader';
import { File } from 'krfile';
import { findImports } from './findimports';

async function openImport(file:File):Promise<string>
{
	try
	{
		return await file.open();
	}
	catch(err)
	{
		if (err.code !== 'ENOENT') throw err;
	}
	try
	{
		return await new File(file.fsPath + '.ts').open();
	}
	catch(err)
	{
		if (err.code !== 'ENOENT') throw err;
	}
	try
	{
		return await new File(file.fsPath + '.js').open();
	}
	catch(err)
	{
		if (err.code !== 'ENOENT') throw err;
	}
	throw Includer.FILE_NOT_FOUND;
}

export class Includer
{
	public static readonly FILE_NOT_FOUND = {};
	public static readonly SELF_INCLUDE = {};

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
			throw Includer.SELF_INCLUDE;
		this.included.add(src.fsPath);
		this.including.add(src.fsPath);

		console.log('    '.repeat(this.level)+src.fsPath);

		const data = await openImport(src);
		this.level ++;
		const dir = src.parent();
		
		if (this.opts.includeImports !== false)
		{
			const imports = findImports(src.fsPath, data);
			for (const imp of imports)
			{
				await this._append(dir.child(imp));
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
					catch(e)
					{
						switch(e)
						{
						case Includer.SELF_INCLUDE:
							this.errors.push([src, tag.lineNumber, e.message]);
							break;
						case Includer.FILE_NOT_FOUND:
							this.errors.push([src, tag.lineNumber, "File not found: "+file.fsPath]);
							break;
						default: throw e;
						}
					}
					break;
				}
			}
		}
		this.list.push(src);
		this.level --;
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
					switch (err)
					{
					case Includer.FILE_NOT_FOUND:
						this.errors.push([appender, 0, "File not found: "+src[i].fsPath]);
						break;
					default:
						throw err;
					}
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
				switch (err)
				{
				case Includer.FILE_NOT_FOUND:
					this.errors.push([appender, 0, "File not found: "+src.fsPath]);
					break;
				default:
					throw err;
				}
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
