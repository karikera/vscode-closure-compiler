
import * as cp from 'child_process';
import { krarg } from 'krarg';
import { ClosureConfig } from './config';
const closureCompilerJava:string = require('google-closure-compiler-java');

export namespace cc
{
	export function makeArgs(options:ClosureConfig):string[]
	{
		const args = krarg.create(options);
		args.unshift('-jar', closureCompilerJava);
		return args;
	}
	
	export class Process
	{
		private readonly java:cp.ChildProcess;
	
		stdout:(data:string)=>void = ()=>{};
		stderr:(data:string)=>void = ()=>{};
		onkill:()=>void = ()=>{};
		onclose:(code:number)=>void = ()=>{};
		onerror:(err:Error)=>void = ()=>{};
	
		constructor(options:ClosureConfig)
		{
			this.java = cp.spawn('java', makeArgs(options));
			this.java.stdout!.on('data', (data:Buffer)=>this.stdout(data.toString()));
			this.java.stderr!.on('data', (data:Buffer)=>this.stderr(data.toString()));
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
			const help = cp.spawn("java", ["-jar", closureCompilerJava, "--help"]);
			var str = '';
			help.stderr.on('data', (data:string) => { str += data; });
			help.stdout.on('data', (data:string) => { str += data; });
			help.on('close', (code, signal)=>resolve(str));
		});
	}
	
	export function version():Promise<string>
	{
		return new Promise<string>(resolve=>{
			const help = cp.spawn("java", ["-jar", closureCompilerJava, "--version"]);
			var str = '';
			help.stderr.on('data', (data:string) => { str += data; });
			help.stdout.on('data', (data:string) => { str += data; });
			help.on('close', (code, signal)=>resolve(str));
		});
	}
}
