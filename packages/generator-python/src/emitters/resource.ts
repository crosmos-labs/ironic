import type { ResourceNode, MethodNode, ParamNode, TypeRef } from '@ironic/core';
import { emitPythonTypeRef, collectResourceTypeRefs } from '../snippets/type-refs.js';
import { fileHeader } from '../snippets/formatters.js';
import { snakeCase as toSnake } from '../snippets/formatters.js';

export function emitResourceFile(resource: ResourceNode): string {
  const imports = buildImports(resource);
  const syncClass = emitResourceClass(resource, 'sync');
  const asyncClass = emitResourceClass(resource, 'async');

  return [fileHeader(), '', imports, '', '', syncClass, '', '', asyncClass, ''].join('\n');
}

function buildImports(resource: ResourceNode): string {
  const lines: string[] = [
    'from __future__ import annotations',
    '',
    'from typing import Any, Dict, List, Optional, Union',
    '',
    'import httpx',
    '',
  ];

  const coreImports: string[] = ['SyncAPIResource', 'AsyncAPIResource'];

  const hasStreaming = resource.methods.some((m) => m.streaming);
  if (hasStreaming) {
    coreImports.push('Stream', 'AsyncStream');
  }

  const hasCursor = resource.methods.some((m) => m.pagination === 'cursor');
  const hasOffset = resource.methods.some((m) => m.pagination === 'offset');
  if (hasCursor) coreImports.push('SyncCursorPage', 'AsyncCursorPage');
  if (hasOffset) coreImports.push('SyncOffsetPage', 'AsyncOffsetPage');

  lines.push(`from .._core import ${coreImports.join(', ')}`);

  // All type refs come from ..types (one file per type, Stainless convention)
  const typeRefs = collectResourceTypeRefs(resource);
  if (typeRefs.size > 0) {
    for (const ref of [...typeRefs].sort()) {
      const refFile = toSnake(ref);
      lines.push(`from ..types.${refFile} import ${ref}`);
    }
  }

  // Import child resources
  for (const child of resource.children) {
    const childSnake = toSnake(child.name);
    lines.push(
      `from .${childSnake} import ${child.className}, Async${child.className}`,
    );
  }

  return lines.join('\n');
}

function emitResourceClass(resource: ResourceNode, mode: 'sync' | 'async'): string {
  const isAsync = mode === 'async';
  const prefix = isAsync ? 'Async' : '';
  const baseClass = isAsync ? 'AsyncAPIResource' : 'SyncAPIResource';
  const className = `${prefix}${resource.className}`;

  const lines: string[] = [];
  lines.push(`class ${className}(${baseClass}):`);

  if (resource.children.length > 0) {
    for (const child of resource.children) {
      const childType = isAsync ? `Async${child.className}` : child.className;
      lines.push(`    ${toSnake(child.name)}: ${childType}`);
    }
    lines.push('');

    lines.push(`    def __init__(self, client):`);
    lines.push(`        super().__init__(client)`);
    for (const child of resource.children) {
      const childType = isAsync ? `Async${child.className}` : child.className;
      lines.push(`        self.${toSnake(child.name)} = ${childType}(client)`);
    }
    lines.push('');
  }

  for (const method of resource.methods) {
    lines.push(emitMethod(method, isAsync));
    lines.push('');
  }

  if (lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}

function emitMethod(method: MethodNode, isAsync: boolean): string {
  const defKw = isAsync ? 'async def' : 'def';
  const pyName = toSnake(method.name);
  const sig = buildMethodSignature(method, isAsync);
  const body = buildMethodBody(method, isAsync);
  const doc = method.description ? `        """${method.description}"""` : '';

  const lines: string[] = [];
  lines.push(`    ${defKw} ${pyName}(${sig}) -> ${buildReturnType(method, isAsync)}:`);
  if (doc) lines.push(doc);
  lines.push(`        ${body}`);

  return lines.join('\n');
}

function buildMethodSignature(method: MethodNode, isAsync: boolean): string {
  const params: string[] = ['self'];

  for (const param of method.pathParams) {
    params.push(`${toSnake(param.tsName)}: ${emitPythonTypeRef(param.type)}`);
  }

  if (method.requestBody) {
    params.push(`body: ${emitPythonTypeRef(method.requestBody)}`);
  }

  if (method.queryParamsTypeName) {
    params.push(`query: Optional[${method.queryParamsTypeName}] = None`);
  } else if (method.queryParams.length > 0) {
    for (const param of method.queryParams) {
      const pyName = toSnake(param.tsName);
      const typeStr = emitPythonTypeRef(param.type);
      if (param.required) {
        params.push(`${pyName}: ${typeStr}`);
      } else {
        params.push(`${pyName}: Optional[${typeStr}] = None`);
      }
    }
  }

  params.push('**kwargs: Any');

  return params.join(',\n        ');
}

function buildMethodBody(method: MethodNode, isAsync: boolean): string {
  const pathExpr = buildPathExpression(method.path, method.pathParams);
  const httpMethod = method.httpMethod;

  const callArgs: string[] = [`${pathExpr}`];
  const kwargParts: string[] = [];

  if (method.requestBody) {
    kwargParts.push('body=body');
  }

  if (method.queryParamsTypeName) {
    kwargParts.push('query=query');
  } else if (method.queryParams.length > 0) {
    const queryDict = method.queryParams
      .map((p) => `"${p.name}": ${toSnake(p.tsName)}`)
      .join(', ');
    kwargParts.push(`query={${queryDict}}`);
  }

  kwargParts.push('**kwargs');
  const argsStr = `${callArgs.join(', ')}, ${kwargParts.join(', ')}`;

  if (method.streaming) {
    if (isAsync) {
      return `return await self._client._stream("${httpMethod.toUpperCase()}", ${argsStr})`;
    }
    return `return self._client._stream("${httpMethod.toUpperCase()}", ${argsStr})`;
  }

  if (method.pagination) {
    const pageClass = method.pagination === 'cursor'
      ? (isAsync ? 'AsyncCursorPage' : 'SyncCursorPage')
      : (isAsync ? 'AsyncOffsetPage' : 'SyncOffsetPage');
    if (isAsync) {
      return `return await self._client._get_page(${pageClass}, ${argsStr})`;
    }
    return `return self._client._get_page(${pageClass}, ${argsStr})`;
  }

  const isVoid = method.responseType.kind === 'primitive' && (method.responseType.type === 'void' || method.responseType.type === 'null');

  if (isVoid) {
    if (isAsync) {
      return `await self._client.${httpMethod}(${argsStr})`;
    }
    return `self._client.${httpMethod}(${argsStr})`;
  }

  if (isAsync) {
    return `response = await self._client.${httpMethod}(${argsStr})\n        return response.json()`;
  }
  return `return self._client.${httpMethod}(${argsStr}).json()`;
}

function buildPathExpression(specPath: string, pathParams: ParamNode[]): string {
  if (pathParams.length === 0) return `"${specPath}"`;

  let template = specPath;
  for (const param of pathParams) {
    template = template.replace(`{${param.name}}`, `{${toSnake(param.tsName)}}`);
  }
  return `f"${template}"`;
}

function buildReturnType(method: MethodNode, isAsync: boolean): string {
  if (method.streaming) {
    const streamClass = isAsync ? 'AsyncStream' : 'Stream';
    return `${streamClass}[${emitPythonTypeRef(method.responseType)}]`;
  }

  if (method.pagination) {
    const itemType = extractPageItemType(method.responseType);
    const pageClass = method.pagination === 'cursor'
      ? (isAsync ? 'AsyncCursorPage' : 'SyncCursorPage')
      : (isAsync ? 'AsyncOffsetPage' : 'SyncOffsetPage');
    return `${pageClass}[${emitPythonTypeRef(itemType)}]`;
  }

  return emitPythonTypeRef(method.responseType);
}

function extractPageItemType(responseType: TypeRef): TypeRef {
  if (responseType.kind === 'object') {
    const dataProp = responseType.properties['data'];
    if (dataProp && dataProp.type.kind === 'array') {
      return dataProp.type.items;
    }
  }
  return responseType;
}
