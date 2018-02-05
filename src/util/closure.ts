
import * as cp from 'child_process';
import * as path from 'path';

const ftpkrRoot:string = path.join(path.dirname(__filename),'../..').replace(/\\/g, '/');
const closurecompiler:string = ftpkrRoot + "/compiler-latest/closure-compiler-v20180101.jar";

export class Process
{
	private readonly java:cp.ChildProcess;

	stdout:(data:string)=>void = ()=>{};
	stderr:(data:string)=>void = ()=>{};
	onkill:()=>void = ()=>{};
	onclose:(code:number)=>void = ()=>{};
	onerror:(err:Error)=>void = ()=>{};

	constructor(args:string[])
	{
		args.unshift('-jar', closurecompiler);

		this.java = cp.spawn("java", args);
		this.java.stdout.on('data', (data:string)=>this.stdout(data));
		this.java.stderr.on('data', (data:string)=>this.stderr(data));
		this.java.on('error', (err)=>{
			this.onerror(err);
			this.onclose(-1);
		});
		this.java.on('close', (code, signal) => {
			if (signal === 'SIGTERM') this.onkill();
			else this.onclose(code);
		});
	}

	kill()
	{
		this.java.kill();
	}
}

export function help():Promise<string>
{
	return new Promise<string>(resolve=>{
		const help = cp.spawn("java", ["-jar", closurecompiler, "--help"]);
		var str = '';
		help.stderr.on('data', (data:string) => { str += data; });
		help.stdout.on('data', (data:string) => { str += data; });
		help.on('close', (code, signal)=>resolve(str));
	});
}
