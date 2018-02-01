
import * as reader from '../util/reader';
import * as cc from '../util/closure';
import { File } from 'krfile';

interface SchemaField
{
	enum?:string[];
	description?:string;
	default?:any;
	type?:string;
}

enum FieldType
{
	VAL,
	ENUM,
	SWITCH
}

class Field
{
	public command:string = '';
	public obj:SchemaField = {};
	public type:FieldType = FieldType.SWITCH;
	public enums = new Set<string>();

	constructor()
	{
	}
	
	public parseHead(properties:any, text:string):void
	{
		const r = new reader.Reader;
		r.data = text;
		

		this.command = r.readTo(reader.WHITE_SPACE).substr(2);
		var obj:SchemaField = properties[this.command];
		if (!obj) obj = properties[this.command] = {};
		this.obj = obj;

		while (!r.eof)
		{
			let word = r.readTo(reader.WHITE_SPACE);
			r.skipSpace();
			if (word === '(')
			{
				r.readTo(')');
				r.skipSpace();
				continue;
			}
			if (word === 'VAL')
			{
				this.type = FieldType.VAL;
			}
			if (word.startsWith('['))
			{
				word = word.substr(1);
				if (!word.endsWith(']'))
				{
					word += ' ';
					word += r.readTo(']');
				}
				const startEnums = word.split('|');
				for(const v of startEnums)
				{
					this.enums.add(v.trim());
				}
				this.type = FieldType.ENUM;
			}
		}
	}

	public parseDescription(info:string):void
	{
		const match = info.match(/\(default: ([^)]+)\)/);
		if (match)
		{
			this.obj.default = match[1];
		}
		if (this.type === FieldType.SWITCH && this.obj.default === 'false')
		{
			this.obj.default = false;
			this.obj.type = 'boolean';
		}
		if (this.obj.default === 'true')
		{
			this.enums.add('true');
			this.enums.add('false');
		}

		const optionsIdx = info.lastIndexOf('Options: ');
		if (optionsIdx !== -1)
		{
			let options = info.substr(optionsIdx+9);
			let endIdx = options.lastIndexOf('(');
			if (endIdx === -1) endIdx = options.length;
			let endIdx2 = options.indexOf('.');
			if (endIdx2 !== -1 && endIdx2 < endIdx) 
			{
				endIdx = endIdx2;
			}
			
			options = options.substr(0, endIdx);
			for(const v of options.split(','))
			{
				let name = v.trim();
				const optionidx = name.search(/[\( \t\r\n]/);
				if (optionidx !== -1)
				{
					name = name.substr(0, optionidx);
				}
				this.enums.add(name);
			}
		}
		if (this.enums.size)
		{
			this.obj.enum = [...this.enums];
			delete this.obj.type;
		}
		this.obj.description = info;		
	}

}

(async ()=>{
	const schema = await new File('schema/closure.old.schema.json').json();
	const helpMessage = await cc.help();
	const r = new reader.Reader;
	r.data = helpMessage;
	r.skipSpace();
	
	const props = schema.properties;
	const leftProps = new Set<string>(Object.keys(props));

	var front = '';
	var back = '';

	var ignore = false;

	while (!r.eof)
	{
		var info = r.readTo(reader.LINE);
		if (info.length === 0) continue;
		info = info.replace(/\x1b\[0m/g, '');
		if (/\x1b\[1mAvailable Error Groups:/
			.test(info))
		{
			back += '\n';
			back += info.substr(4).trim();
			for (;;)
			{
				var info = r.readTo(reader.LINE).trim();
				if (info.length === 0) break;
				back += ' ';
				back += info;
			}
			continue;
		}
		if (/\x1b\[1m[^:]+:/.test(info)) continue;
		if (info.startsWith('[0m')) info = info.substr(3);
		var new_front = info.substr(0, 40);
		const spliter = info.substr(40,2);
		var new_back = info.substr(42);
		if (new_front.startsWith(' --'))
		{
			console.assert(spliter === ': ', info);
			if (front)
			{
				const field = new Field();
				field.parseHead(props, front);
				field.parseDescription(back);
				leftProps.delete(field.command);
			}
			front = new_front.trim();
			back = new_back.trim();
		}
		else
		{
			front += ' ';
			front += new_front.trim();
			back += ' ';
			back += new_back.trim();
		}
	}

	delete props.help;
	for (const left of leftProps)
	{
		delete props[left];
	}
	
	const outfile = new File('schema/closure.schema.json');
	await outfile.create(JSON.stringify(schema, null, 4));
})().catch(err=>{
	console.error(err);
});