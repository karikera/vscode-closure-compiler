
import * as fs from 'fs';
import * as getParameterNames from 'get-parameter-names';

class Printer
{
	output:string = '';
	space:string = '';
	spaceWrited:boolean = false;

	reduce():void
	{
		this.output = this.output.substr(0, this.output.length-1);
	}

	open():void
	{
		this.print('{');
		this.space += '\t';
	}

	close():void
	{
		this.space = this.space.substr(0, this.space.length-1);
		this.print('}');
	}

	print(text:string):void
	{
		if (!this.spaceWrited)
		{
			this.output += this.space;
			this.spaceWrited = true;
		}
		this.output += text;
	}

	lineFeed():void
	{
		this.output += '\n';
		this.spaceWrited = false;
	}
}

const cls = new Printer;
const out = new Printer;

function outFunctionPost(value:Function):void
{	
	out.print('(');
	const paramNames = getParameterNames(value);
	out.print(paramNames.join(','));
	out.print('){}');
		
	//out.print(JSON.stringify(func));
}

function outValue(prefix:string, value:any, postfix:string):void
{
	switch (typeof value)
	{
	case 'string':
		out.print(prefix+JSON.stringify(value)+postfix);
		break;
	case 'number':
	case 'undefined':
		out.print(`${prefix}${value}${postfix}`);
		break;
	case 'object':
		out.print(`${prefix}`);
		switch(value.constructor)
		{
		case Array:
			out.print(`[]`);
			break;
		case Function:
			out.print(`function`);
			outFunctionPost(value);
			break;
		default:
			out.open();
			for(const member in value)
			{
				out.lineFeed();
				outMember(member, value[member]);
			}
			out.reduce();
			out.lineFeed();
			out.close();
			break;
		}
		out.print(`${postfix}`);
		break;
	default:
		out.print(`// unknown type: ${typeof value}`);
		break;
	}
}

function outMember(varname:string, value:any):void
{
	if(value && value.constructor === Function)
	{
		out.print(varname);
		outFunctionPost(value);
		out.print(',');
	}
	else
	{
		outValue(`${varname}:`, value, ',');
	}
}

function outGlobal(varname:string, value:any):void
{
	if(value && value.constructor === Function)
	{
		out.print('function ');
		out.print(varname);
		outFunctionPost(value);
	}
	else
	{
		outValue(`var ${varname}=`, value, ';');
	}
}
if (!process.send)
{
	console.error('This process must be worker');
}
else
{
	try
	{
		class Element
		{
		}

		const anyglobal = global as any;

		anyglobal['Element'] = Element;
		anyglobal['self'] = anyglobal;
		anyglobal['location'] = {
		};
		anyglobal['document'] = {
			getElementsByTagName()
			{
				return new Element;
			},
		};

		const postrun:(()=>void)[] = [()=>{}];

		anyglobal['requestAnimationFrame'] = function(fn:()=>void)
		{
			postrun.push(fn);
		};

		anyglobal['set'+'Timeout'] = anyglobal['set'+'Interval'] = function(callback:(...args:any[])=>void, delay:number, ...args:any[]):number
		{
			const id = postrun.length;
			postrun.push(callback.bind(anyglobal, ...args));
			return id;
		};
		
		anyglobal['clear'+'Timeout'] = anyglobal['clear'+'Interval'] = function(id:number):void
		{
			postrun[id] = function(){};
		};

		const ignores = new Set();
		for(const varname in anyglobal)
		{
			ignores.add(varname);
		}

		const filename = process.argv[2];
		const source = fs.readFileSync(filename, 'utf-8');

		try
		{
			eval.apply(anyglobal, source);
			for(const run of postrun.slice()) run();
		}
		catch(e)
		{
			const message = {output:'', error:e.stack.replace(/at eval \(eval at <anonymous> \(.+\), <anonymous>:([0-9]+):([0-9]+)\)/g, `at Object.<anonymous> (${filename}:$1$2)`)};
			process.send(message);
			process.exit(-1);
		}


		for(const varname in anyglobal)
		{
			if (ignores.has(varname)) continue;
			outGlobal(varname, anyglobal[varname]);
		}

	}
	catch(e)
	{
		process.send({output:'', error:e.stack});
		process.exit(-1);
	}

	process.send({output:'/** @externs */\n' + cls.output + '\n' + out.output, error: null});
}