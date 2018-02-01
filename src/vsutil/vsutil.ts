
import { ExtensionContext, StatusBarItem, workspace, window, TextEditor, Position, Selection, Range, TextDocument, Uri } from 'vscode';

import { Workspace, WorkspaceItem } from './ws';
import { File } from 'krfile';

var context:ExtensionContext|undefined;

export class StateBar implements WorkspaceItem
{
	private statebar:StatusBarItem|undefined;
	private disposed:boolean = false;
	
	constructor(workspace:Workspace)
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

export function createWorkspace():Promise<Workspace|undefined>
{
	return new Promise<Workspace>((resolve, reject)=>{
		const pick = new QuickPick<Workspace>("Select Workspace");
		if (!workspace.workspaceFolders)
		{
			reject(Error("Need workspace"));
			return;
		}
		for(const workspaceFolder of workspace.workspaceFolders)
		{
			const fsws = Workspace.getInstance(workspaceFolder);
			var name = workspaceFolder.name;
			if (fsws) name += ' [inited]';
			pick.item(name, ()=>Workspace.createInstance(workspaceFolder));
		}
		pick.open({autoSelectLessThenTwo:true}).then(resolve).catch(reject);
	});
}

export function selectWorkspace():Promise<Workspace|undefined>
{
	return new Promise<Workspace|undefined>((resolve, reject)=>{
		const pick = new QuickPick("Select Workspace");
		for(const workspaceFolder of Workspace.all())
		{
			pick.item(workspaceFolder.name, ()=>workspaceFolder);
		}
		if (pick.items.length === 0)
		{
			reject(Error("Need workspace"));
			return;
		}
		pick.open({autoSelectLessThenTwo: true}).then(resolve).catch(reject);
	});
}

const LATEST_COUNT_LIMIT = 10;

export async function selectFile(globPattern:string, latestSaveKey?:string):Promise<File|undefined>
{
	var latest:string[] = latestSaveKey ? (getState(latestSaveKey) || []) : [];
	const hasmap = new Set<string>(latest);

	const pick = new QuickPick<File>();
	for (const workspace of Workspace.all())
	{
		for (const file of await workspace.glob(globPattern))
		{
			if (hasmap.delete(file.fsPath)) continue;
			const pathname = workspace.name+'/'+workspace.workpath(file);
			pick.item(pathname, ()=>{
				if (latestSaveKey) addLatestSelectedFile(latestSaveKey, file);
				return file;
			});
		}
	}

	const latestItems:QuickPickItem<File>[] = [];
	for (const fullpath of latest)
	{
		if (hasmap.has(fullpath)) continue;
		const file = new File(fullpath);
		const workspace = Workspace.fromFile(file);
		const pathname = workspace.name+'/'+workspace.workpath(file);
		latestItems.push(pick.itemAlloc(pathname, ()=>{
			if (latestSaveKey) addLatestSelectedFile(latestSaveKey, file);
			return file;
		}));
	}
	pick.items.unshift(...latestItems);

	if (pick.items.length === 0) throw 'NO_FILE';
	return await pick.open({});
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
		if (uri instanceof Uri && uri.fsPath) { // file.fsPath is undefined when activated by hotkey
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

export function openWithError(path:File, message:string, line?:number, column?:number):Promise<TextEditor>
{
	window.showErrorMessage(path + ": " + message);
	return open(path, line, column);
}

export class QuickPickItem<T>
{
	public label: string;
	public description: string = '';
	public detail?: string;
	public onselect:()=>T;
}

export class QuickPick<T>
{
	public items:QuickPickItem<T>[] = [];
	public oncancel:()=>undefined = ()=>undefined;
	private _itemsPromise:Promise<QuickPickItem<T>[]>|null = null;
	private _done:(items:QuickPickItem<T>[])=>void;
	private _selected:Thenable<QuickPickItem<T>|undefined>;

	constructor(private readonly _placeHolder?:string)
	{
	}

	public clear()
	{
		this.items.length = 0;
	}
	
	public itemAlloc(label:string, onselect:()=>T):QuickPickItem<T>
	{
		const item = new QuickPickItem<T>();
		item.label = label;
		item.onselect = onselect;
		return item;
	}

	public item(label:string, onselect:()=>T):QuickPickItem<T>
	{
		const item = this.itemAlloc(label, onselect);
		this.items.push(item);
		if (this.items.length >= 2)
		{
			this._prepare();
		}
		return item;
	}

	private _prepare():void
	{
		if (this._itemsPromise) return;
		this._itemsPromise = new Promise<QuickPickItem<T>[]>(resolve=>{
			this._done = resolve;
		});
		this._selected = window.showQuickPick(this._itemsPromise, {placeHolder: this._placeHolder});
	}
	
	async open(options:{autoSelectLessThenTwo?:boolean}):Promise<T|undefined>
	{
		if (options.autoSelectLessThenTwo)
		{
			if (this.items.length === 0)
			{
				return await this.oncancel();
			}
			else if (this.items.length == 1)
			{
				return await this.items[0].onselect();
			}
		}
		
		this._prepare();
		this._done(this.items);
		const selected = await this._selected;
		if (selected === undefined)
		{
			return this.oncancel();
		}
		else
		{
			return selected.onselect();
		}
	}

}

export async function open(path:File, line?:number, column?:number):Promise<TextEditor>
{
	const doc = await workspace.openTextDocument(path.fsPath);
	const editor = await window.showTextDocument(doc);
	if (line !== undefined)
	{
		line --;
		if (column === undefined) column = 0;
		
		const pos = new Position(line, column);
		editor.selection = new Selection(pos, pos);
		editor.revealRange(new Range(pos, pos));		
	}
	return editor;
}

export async function openNew(content:string):Promise<TextDocument>
{
	const doc = await workspace.openTextDocument({content});
	window.showTextDocument(doc);
	return doc;
}
