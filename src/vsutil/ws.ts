
import * as path from 'path';
import * as event from '../util/event';
import { workspace, Uri, WorkspaceFolder, Disposable } from 'vscode';
import { File } from 'krfile';

export interface WorkspaceItem
{
	dispose():void;
}

interface WorkspaceItemConstructor<T extends WorkspaceItem>
{
	new(workspace:Workspace):T;
}

interface ItemMap
{
	values():Iterable<WorkspaceItem>;
	get<T extends WorkspaceItem>(item:WorkspaceItemConstructor<T>):T|undefined;
	set<T extends WorkspaceItem>(item:WorkspaceItemConstructor<T>, T):void;
	clear():void;
}

export enum WorkspaceOpenState
{
	CREATED,
	OPENED
}

export class Workspace extends File
{
	private static wsmap = new Map<string, Workspace>();
	private static wsloading = new Map<string, Workspace>();
	private readonly items:ItemMap = new Map;
	public readonly name:string;

	constructor(public readonly workspaceFolder:WorkspaceFolder, public readonly openState:WorkspaceOpenState)
	{
		super(workspaceFolder.uri.fsPath);
		this.name = workspaceFolder.name;
	}

	static getCurrent():Workspace
	{
		if (workspace.rootPath === undefined)
		{
			if (workspace.workspaceFolders)
			{
				for (const ws of workspace.workspaceFolders)
				{
					const fsws = Workspace.wsmap.get(ws.uri.fsPath);
					if (!fsws) continue;
					return fsws;
				}
			}
			throw Error("Need workspace");
		}
		return Workspace.fromFile(new File(workspace.rootPath));
	}

	/**
	 * path from workspace
	 */
	workpath(file:File):string
	{
		const workspacePath = this.fsPath;
		const fsPath = file.fsPath;
		if (fsPath.startsWith(workspacePath))
		{
			if (workspacePath.length === fsPath.length) return '';
			const workpath = fsPath.substr(workspacePath.length);
			if (workpath.startsWith(path.sep)) 
			{
				if (path.sep === '\\') return workpath.replace(/\\/g, '/').substr(1);
				if (path.sep !== '/') return workpath.replace(new RegExp(path.sep, 'g'), '/').substr(1);
				return workpath.substr(1);
			}
		}
		throw Error(`${fsPath} is not in workspace`);
	}

	public query<T extends WorkspaceItem>(type:WorkspaceItemConstructor<T>):T
	{
		var item = this.items.get(type);
		if (item === undefined)
		{
			item = new type(this);
			this.items.set(type, item);
		}
		return item;
	}

	private dispose():void
	{
		for(const item of this.items.values())
		{
			item.dispose();
		}
		this.items.clear();
		
	}

	static getInstance(workspace:WorkspaceFolder):Workspace|undefined
	{
		return Workspace.wsmap.get(workspace.uri.fsPath);
	}

	static createInstance(workspaceFolder:WorkspaceFolder):Workspace
	{
		const workspacePath = workspaceFolder.uri.fsPath;
		var fsws = Workspace.wsmap.get(workspacePath);
		if (fsws) return fsws;
		Workspace.wsloading.delete(workspacePath);
		fsws = new Workspace(workspaceFolder, WorkspaceOpenState.CREATED);
		Workspace.wsmap.set(workspacePath, fsws);
		onNewWorkspace.fire(fsws);
		return fsws;
	}

	static async load(workspaceFolder:WorkspaceFolder):Promise<void>
	{
		const fsws = new Workspace(workspaceFolder, WorkspaceOpenState.OPENED);
		const workspacePath = workspaceFolder.uri.fsPath;
		if (Workspace.wsloading.has(workspacePath)) return;
	
		Workspace.wsloading.set(workspacePath, fsws);
		const existed = await fsws.child('.vscode/closurecompiler.json').exists();
		
		if (!Workspace.wsloading.has(workspacePath)) return;
		Workspace.wsloading.delete(workspacePath);

		if (existed)
		{
			Workspace.wsmap.set(workspacePath, fsws);
			onNewWorkspace.fire(fsws);
		}
	}

	static unload(workspaceFolder:WorkspaceFolder):void
	{
		const workspacePath = workspaceFolder.uri.fsPath;
		Workspace.wsloading.delete(workspacePath);

		const ws = Workspace.wsmap.get(workspacePath);
		if (ws)
		{
			ws.dispose();
			Workspace.wsmap.delete(workspacePath);
		}
	}
	
	static loadAll():void
	{
		workspaceWatcher = workspace.onDidChangeWorkspaceFolders(e=>{
			for (const ws of e.added)
			{
				Workspace.load(ws);
			}
			for (const ws of e.removed)
			{
				Workspace.unload(ws);
			}
		});
		if (workspace.workspaceFolders)
		{
			for(const ws of workspace.workspaceFolders)
			{
				Workspace.load(ws);
			}
		}
	}

	static unloadAll():void
	{
		if (workspaceWatcher)
		{
			workspaceWatcher.dispose();
			workspaceWatcher = undefined;
		}
		for(const ws of Workspace.wsmap.values())
		{
			ws.dispose();
		}
		Workspace.wsmap.clear();
		Workspace.wsloading.clear();
	}


	static * all():Iterable<Workspace>
	{
		if (workspace.workspaceFolders)
		{
			for(const ws of workspace.workspaceFolders)
			{
				const fsws = Workspace.wsmap.get(ws.uri.fsPath);
				if (fsws) yield fsws;
			}
		}
	}

	static one(file:File|undefined):Workspace|undefined
	{
		if (Workspace.wsmap.size === 1)
		{
			const one = Workspace.wsmap.values().next().value;
			if (file)
			{
				const folder = workspace.getWorkspaceFolder(Uri.file(file.fsPath));
				if (!folder) return undefined;
				if (one.fsPath !== folder.uri.fsPath) return undefined;
			}
			return one;
		}
		return undefined;
	}

	static fromFile(file:File):Workspace
	{
		const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(file.fsPath));
		if (!workspaceFolder) throw Error(file.fsPath+" is not in workspace");
		const fsworkspace = Workspace.getInstance(workspaceFolder);
		if (!fsworkspace) throw Error(file.fsPath+" Closure Compiler is not inited");
		return fsworkspace;
	}
	
	static createFromFile(file:File):Workspace
	{
		const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(file.fsPath));
		if (!workspaceFolder) throw Error(file.fsPath+" is not in workspace");
		return Workspace.createInstance(workspaceFolder);
	}
}

var workspaceWatcher:Disposable|undefined;

export const onNewWorkspace = event.make<Workspace>();
