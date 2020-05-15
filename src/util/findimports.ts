import fs = require('fs');
import esprima = require('esprima');
import path = require('path');
import ts = require('typescript');
import { Expression, SpreadElement, Directive, Statement, ModuleDeclaration, Comment, SourceLocation, Node } from 'estree';

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

export function findImports(filename:string, source:string):string[]
{
    const imports:string[] = [];

    function addImportTs(exp:ts.Node, file:ts.SourceFile):boolean
    {
        if (exp.kind !== ts.SyntaxKind.StringLiteral)
        {
            console.error(`module path is not string literal: ${exp.getFullText(file)}`);
            return false;
        }
        const expt = exp as ts.StringLiteral;
        imports.push(expt.text);
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
        imports.push(exp.value);
        return true;
    }


    if (filename.endsWith('.ts') || filename.endsWith('.tsx'))
    {
        const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest);
        findAllTsNode(file, node=>{
            switch (node.kind)
            {
            case ts.SyntaxKind.ImportDeclaration: {
                const nodet = node as ts.ImportDeclaration;
                return addImportTs(nodet.moduleSpecifier, file);
            }
            case ts.SyntaxKind.ExternalModuleReference: {
                const nodet = node as ts.ExternalModuleReference;
                return addImportTs(nodet.expression, file);
            }
            case ts.SyntaxKind.CallExpression: {
                const nodet = node as ts.CallExpression;
                if (nodet.expression.kind === ts.SyntaxKind.Identifier && 
                    (nodet.expression as ts.Identifier).text === 'require')
                {
                    if (nodet.arguments.length === 0)
                    {
                        console.error(`require with zero arguments: ${nodet.getFullText(file)}`);
                        return;
                    }
                    if (nodet.arguments.length >= 2)
                    {
                        addImportTs(nodet.arguments[0], file);
                        console.error(`require with multiple arguments: ${nodet.getFullText(file)}`);
                        return;
                    }
                    else
                    {
                        return addImportTs(nodet.arguments[0], file);
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

    return imports;
}

export async function resolveImports(filepaths:string[]):Promise<Record<string, string[]>>
{
    const out:Record<string, string[]> = {};

    for (let i=0;i<filepaths.length;i++)
    {
        filepaths[i] = path.resolve(filepaths[i]);
    }

    for (const filepath of filepaths)
    {
        if (filepath in out) continue;
        out[filepath] = [];
        
        const source = await fs.promises.readFile(filepath, 'utf-8');
        const list = out[filepath] = findImports(filepath, source);
        
        const dirname = path.dirname(filepath);
        for (let i=0;i<list.length;i++)
        {
            const item = list[i] = path.join(dirname, list[i]);
            filepaths.push(item);
        }
    }
    return out;
}