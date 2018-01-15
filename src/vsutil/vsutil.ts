
import * as vscode from 'vscode';
import File from '../util/file';
import * as ws from './ws';
import { ExtensionContext } from 'vscode';

const window = vscode.window;
const workspace = vscode.workspace;
var context:ExtensionContext|undefined;

export class StateBar implements ws.WorkspaceItem
{
	private statebar:vscode.StatusBarItem|undefined;
	private disposed:boolean = false;
	
	constructor(workspace:ws.Workspace)
	{
	}

	public dispose()
	{
		if (this.disposed) return;
		this.close();
		this.disposed = true;
	}

	public close()
	{
		if (this.statebar)
		{
			this.statebar.dispose();
			this.statebar = undefined;
		}
	}

	public set(state:string):void
	{
		if (this.disposed) return;
		if (!this.statebar) this.statebar = window.createStatusBarItem();
		this.statebar.text = state;
		this.statebar.show();
	}
}

export function setContext(ctx:ExtensionContext):void
{
	context = ctx;
}

export function setState(key:string, value:any):void
{
	if (!context) throw Error('Need context');
	context.workspaceState.update(key, value);
}

export function getState(key:string):any
{
	if (!context) throw Error('Need context');
	return context.workspaceState.get(key);
}

export function createWorkspace():Promise<ws.Workspace|undefined>
{
	return new Promise<ws.Workspace|undefined>((resolve, reject)=>{
		const pick = new QuickPick;
		if (!workspace.workspaceFolders)
		{
			reject(Error("Need workspace"));
			return;
		}
		if (workspace.workspaceFolders.length === 1)
		{
			resolve(ws.Workspace.createInstance(workspace.workspaceFolders[0]));
			return;
		}
		for(const workspaceFolder of workspace.workspaceFolders)
		{
			const fsws = ws.Workspace.getInstance(workspaceFolder);
			var name = workspaceFolder.name;
			if (fsws) name += ' [inited]';
			pick.item(name, ()=>resolve(ws.Workspace.createInstance(workspaceFolder)));
		}
		pick.oncancel = ()=>resolve(undefined);
		pick.open("Select Workspace");
	});
}

export function selectWorkspace():Promise<ws.Workspace|undefined>
{
	return new Promise<ws.Workspace|undefined>((resolve, reject)=>{
		const pick = new QuickPick;
		for(const workspaceFolder of ws.Workspace.all())
		{
			pick.item(workspaceFolder.name, ()=>resolve(workspaceFolder));
		}
		if (pick.items.length === 0)
		{
			reject(Error("Need workspace"));
			return;
		}
		if (pick.items.length === 1)
		{
			pick.items[0].onselect();
			return;
		}
		pick.oncancel = ()=>resolve(undefined);
		pick.open("Select Workspace");
	});
}

const LATEST_COUNT_LIMIT = 10;

export async function selectFile(globPattern:string, latestSaveKey?:string):Promise<File|undefined>
{
	var selected:File|undefined;
	var latest:string[] = latestSaveKey ? (getState(latestSaveKey) || []) : [];
	const hasmap = new Set<string>(latest);

	const pick = new QuickPick;
	for (const workspace of ws.Workspace.all())
	{
		for (const file of await workspace.glob(globPattern))
		{
			if (hasmap.delete(file.fsPath)) continue;
			const pathname = workspace.name+'/'+ws.workpath(file);
			pick.item(pathname, ()=>{
				if (latestSaveKey) addLatestSelectedFile(latestSaveKey, file);
				selected = file;
			});
		}
	}

	const latestItems:QuickPickItem[] = [];
	for (const fullpath of latest)
	{
		if (hasmap.has(fullpath)) continue;
		const file = new File(fullpath);
		const pathname = ws.getFromFile(file).name+'/'+ws.workpath(file);
		latestItems.push(pick.itemAlloc(pathname, ()=>{
			if (latestSaveKey) addLatestSelectedFile(latestSaveKey, file);
			selected = file;
		}));
	}
	pick.items.unshift(...latestItems);

	if (pick.items.length === 0) throw 'NO_FILE';
	await pick.open();
	return selected;
}

export function addLatestSelectedFile(latestSaveKey:string, file:File):void
{
	const latest:string[] = getState(latestSaveKey) || [];
	for (var i=0;i<latest.length;i++)
	{
		if (latest[i] === file.fsPath)
		{
			latest.splice(i, 1);
			break;
		}
	}
	if (latest.length >= LATEST_COUNT_LIMIT) latest.length = LATEST_COUNT_LIMIT - 1;
	latest.unshift(file.fsPath);
	setState(latestSaveKey, latest);
}

export function fileOrEditorFile(uri: any): Promise<File> {
	try
	{
		if (uri instanceof vscode.Uri && uri.fsPath) { // file.fsPath is undefined when activated by hotkey
			const path = new File(uri.fsPath);
			return Promise.resolve(path);
		}
		else {
			const editor = window.activeTextEditor;
			if (!editor) throw Error('No file selected');
			const doc = editor.document;
			const path = new File(doc.uri.fsPath);
			return Promise.resolve().then(()=>doc.save()).then(()=>path);
		}
	}
	catch(e)
	{
		return Promise.reject(e);
	}
}

export function info(info:string, ...items:string[]):Thenable<string|undefined>
{
	return window.showInformationMessage(info, ...items);
}

export function openWithError(path:File, message:string, line?:number, column?:number):Promise<vscode.TextEditor>
{
	window.showErrorMessage(path + ": " + message);
	return open(path, line, column);
}

export class QuickPickItem implements vscode.QuickPickItem
{
	public label: string;
	public description: string = '';
	public detail?: string;
	public onselect:()=>any;
}

export class QuickPick
{
	public items:QuickPickItem[] = [];
	public oncancel:()=>any = ()=>{};

	constructor()
	{
	}

	public clear()
	{
		this.items.length = 0;
	}
	
	public itemAlloc(label:string, onselect:()=>any):QuickPickItem
	{
		const item = new QuickPickItem();
		item.label = label;
		item.onselect = onselect;
		return item;
	}

	public item(label:string, onselect:()=>any):QuickPickItem
	{
		const item = this.itemAlloc(label, onselect);
		this.items.push(item);
		return item;
	}
	
	async open(placeHolder?:string):Promise<void>
	{
		const selected = await window.showQuickPick(this.items, {placeHolder});
		if (selected === undefined)
		{
			await this.oncancel();
		}
		else
		{
			await selected.onselect();
		}
	}

}

export async function open(path:File, line?:number, column?:number):Promise<vscode.TextEditor>
{
	const doc = await workspace.openTextDocument(path.fsPath);
	const editor = await window.showTextDocument(doc);
	if (line !== undefined)
	{
		line --;
		if (column === undefined) column = 0;
		
		const pos = new vscode.Position(line, column);
		editor.selection = new vscode.Selection(pos, pos);
		editor.revealRange(new vscode.Range(pos, pos));		
	}
	return editor;
}

export async function openNew(content:string):Promise<vscode.TextDocument>
{
	const doc = await workspace.openTextDocument({content});
	window.showTextDocument(doc);
	return doc;
}
