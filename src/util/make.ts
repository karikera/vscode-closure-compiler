
import { File } from 'krfile';

class MakeFileItem
{
	public compiling = false;

	constructor(public readonly children:string[], public readonly callback:()=>Promise<State>)
	{
	}
}

export enum State
{
	LATEST,
	COMPLETE,
	ERROR
}

export class MakeFile
{
	map = new Map<string, MakeFileItem>();

	on(master:string, children:string[], callback:()=>Promise<State>):void
	{
		this.map.set(master, new MakeFileItem(children, callback));
	}

	async make(target:string, stack:string[] = []):Promise<State>
	{
		const that = this;
		var mtime = 0;
		const options = this.map.get(target);
		if (!options) return State.LATEST;
		if (options.compiling)
		{
			throw Error(`reculsive target: ${stack.join(' -> ')} -> ${target}`);
		}
		options.compiling = true;
		stack.push(target);

		const children = options.children;
		if (children.length === 0) return options.callback();

		var state = State.LATEST;
		for(const child of children)
		{
			const res = await that.make(child, stack);
			if (res > state) state = res;
			if (state !== State.LATEST) continue;
			if(!mtime)
			{
				try
				{
					const stat = await new File(target).stat();
					mtime = +stat.mtime;
				}
				catch(err)
				{
					state = State.COMPLETE;
					continue;
				}
			}
			
			try
			{
				const stat = await new File(target).stat();
				if (mtime <= +stat.mtime) state = State.COMPLETE;
			}
			catch (err)
			{
				state = State.COMPLETE;
			}
		}

		stack.pop();

		if (state !== State.COMPLETE) return state;
		return options.callback();
	}
}

