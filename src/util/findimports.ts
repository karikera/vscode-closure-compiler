import fs = require('fs');
import esprima = require('esprima');
import path = require('path');
import ts = require('typescript');
import { Expression, SpreadElement, Directive, Statement, ModuleDeclaration, Comment, SourceLocation, Node } from 'estree';
import { File } from 'krfile';

type KeysOfUnion<T> = T extends any ? keyof T: never;
type ValuesOfUnion<T> = T extends any ? T[keyof T]: never;

function isBasicType(node:any):node is number|string|boolean|RegExp
{
    switch (typeof node)
    {
    case 'string':
    case 'boolean':
    case 'number': return true;
    }
    if (node instanceof RegExp) return true;
    return false;
}

type NonExpression = SourceLocation|{pattern:string, flags:string}|{cooked:string, raw:string};
function isNotExpression(node:NonExpression|Comment|Directive|Node):node is NonExpression
{
    if (!('type' in node)) return true;
    return false;
}
function isComment(node:Comment|Node):node is Comment
{
    switch (node.type)
    {
    case 'Block':
    case 'Line': return true;
    }
    return false;
}
function findAllExpression(node:Node, cb:(node:Node|Comment)=>boolean|void):void
{
    if (cb(node)) return;
    for (const key in node)
    {
        const prop:ValuesOfUnion<typeof node> = node[key];
        if (!prop) continue;
        if (isBasicType(prop)) continue;
        if (prop instanceof Array)
        {
            for (const inode of prop)
            {
                if (isBasicType(inode)) continue;
                if (isNotExpression(inode)) continue;
                if (isComment(inode))
                {
                    cb(inode);
                    continue;
                }
                findAllExpression(inode, cb);
            }
            continue;
        }
        if (isNotExpression(prop)) continue;
        findAllExpression(prop, cb);
    }
}

function findAllTsNode(node:ts.Node, cb:(node:ts.Node)=>boolean|void):void
{
    if (cb(node)) return;
    node.forEachChild(node=>{
        findAllTsNode(node, cb);
    });
}

interface ImportInfo
{
    file:File;
    line:number;
    column:number;
}

export function findImports(file:File, source:string):Promise<ImportInfo[]>
{
    const dir = file.parent();
    const proms:Promise<ImportInfo>[] = [];

    async function addImport(path:string, line:number, column:number):Promise<ImportInfo>
    {
        let file = dir.child(path);
        if (file.ext() === '')
        {
            file = file.sibling(file.filenameWithoutExt()+'.ts');
            if (!await file.exists())
            {
                file = file.sibling(file.filenameWithoutExt()+'.js');
            }
        }
        return {
            file,
            line,
            column
        };
    }

    function addImportTs(exp:ts.Node, sourceFile:ts.SourceFile):boolean
    {
        if (exp.kind !== ts.SyntaxKind.StringLiteral)
        {
            console.error(`module path is not string literal: ${exp.getFullText(sourceFile)}`);
            return false;
        }
        const expt = exp as ts.StringLiteral;
        
        const pos = sourceFile.getLineAndCharacterOfPosition(exp.getStart());
        proms.push(addImport(expt.text, pos.line, pos.character));
        return true;
    }

    function addImportJs(exp:Expression | SpreadElement):boolean
    {
        if (exp.type !== 'Literal')
        {
            console.error(`module path is not literal: ${exp.loc!.source}`);
            return false;
        }
        if (typeof exp.value !== 'string')
        {
            console.error(`module path is not string: ${exp.loc!.source}`);
            return false;
        }
        const loc = (exp.loc?.start) ?? {line:0, column: 0};
        proms.push(addImport(exp.value, loc.line, loc.column));
        return true;
    }


    const ext = file.ext();
    if (ext === '.ts' || ext === '.tsx')
    {
        const sourceFile = ts.createSourceFile(file.fsPath, source, ts.ScriptTarget.Latest);
        findAllTsNode(sourceFile, node=>{
            switch (node.kind)
            {
            case ts.SyntaxKind.ImportDeclaration: {
                const nodet = node as ts.ImportDeclaration;
                return addImportTs(nodet.moduleSpecifier, sourceFile);
            }
            case ts.SyntaxKind.ExternalModuleReference: {
                const nodet = node as ts.ExternalModuleReference;
                return addImportTs(nodet.expression, sourceFile);
            }
            case ts.SyntaxKind.CallExpression: {
                const nodet = node as ts.CallExpression;
                if (nodet.expression.kind === ts.SyntaxKind.Identifier && 
                    (nodet.expression as ts.Identifier).text === 'require')
                {
                    if (nodet.arguments.length === 0)
                    {
                        console.error(`require with zero arguments: ${nodet.getFullText(sourceFile)}`);
                        return;
                    }
                    if (nodet.arguments.length >= 2)
                    {
                        addImportTs(nodet.arguments[0], sourceFile);
                        console.error(`require with multiple arguments: ${nodet.getFullText(sourceFile)}`);
                        return;
                    }
                    else
                    {
                        return addImportTs(nodet.arguments[0], sourceFile);
                    }
                }
                break;
            }
            }
        });
    }
    else
    {
        const tree = esprima.parseModule(source);
        for (const directive of tree.body)
        {
            findAllExpression(directive, node=>{
                switch (node.type)
                {
                case 'CallExpression':
                    if (node.callee.type === 'Identifier' && 
                        node.callee.name === 'require')
                    {
                        if (node.arguments.length === 0)
                        {
                            console.error(`require with zero arguments: ${node.loc!.source}`);
                            return;
                        }
                        if (node.arguments.length >= 2)
                        {
                            addImportJs(node.arguments[0]);
                            console.error(`require with multiple arguments: ${node.loc!.source}`);
                            return;
                        }
                        else
                        {
                            return addImportJs(node.arguments[0]);
                        }
                    }
                    break;
                case 'ImportDeclaration':
                    addImportJs(node.source);
                    return true;
                }
            });
        }
    }

    return Promise.all(proms);
}

export async function resolveImports(files:File[]):Promise<Record<string, File[]>>
{
    const out:Record<string, File[]> = {};

    for (const file of files)
    {
        if (file.fsPath in out) continue;
        out[file.fsPath] = [];
        
        const source = await fs.promises.readFile(file.fsPath, 'utf-8');
        out[file.fsPath] = (await findImports(file, source)).map(info=>info.file);
    }
    return out;
}