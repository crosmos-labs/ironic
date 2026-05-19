// ─── Resource Emitter ────────────────────────────────────────────────────────
// Emit TypeScript resource classes from IR ResourceNodes.

import type { ResourceNode, MethodNode, ParamNode, TypeRef } from '@ironic/core';
import { camelCase } from '@ironic/core';
import { emitTypeRef } from './types.js';
import { indent, jsdoc, joinBlocks } from '../snippets/formatters.js';

/**
 * Emit a single resource file.
 */
export function emitResourceFile(resource: ResourceNode): string {
  const imports = buildImports(resource);
  const classBody = emitResourceClass(resource);

  return joinBlocks(imports, classBody) + '\n';
}

/**
 * Build import statements for a resource file.
 */
function buildImports(resource: ResourceNode): string {
  const lines: string[] = [
    `import { APIResource } from '../core/api-client.js';`,
  ];

  // Import child resource classes
  for (const child of resource.children) {
    lines.push(
      `import { ${child.className} } from './${camelCase(child.name)}/index.js';`,
    );
  }

  // Check if we need pagination imports
  const hasPagination = resource.methods.some((m) => m.pagination);
  if (hasPagination) {
    lines.push(`import { CursorPage, OffsetPage } from '../core/pagination.js';`);
  }

  // Check if we need streaming imports
  const hasStreaming = resource.methods.some((m) => m.streaming);
  if (hasStreaming) {
    lines.push(`import { Stream } from '../core/streaming.js';`);
  }

  return lines.join('\n');
}

/**
 * Emit a resource class.
 */
function emitResourceClass(resource: ResourceNode): string {
  const childProperties = resource.children.map(
    (child) => `  ${child.name}: ${child.className};`,
  );

  const childInit = resource.children.map(
    (child) => `    this.${child.name} = new ${child.className}(this._client);`,
  );

  const constructor = resource.children.length > 0
    ? `
  constructor(client: ConstructorParameters<typeof APIResource>[0]) {
    super(client);
${childInit.join('\n')}
  }`
    : '';

  const methods = resource.methods.map(emitMethod).join('\n\n');

  return `export class ${resource.className} extends APIResource {
${childProperties.join('\n')}${childProperties.length > 0 ? '\n' : ''}${constructor}${constructor ? '\n' : ''}
${methods}
}`;
}

/**
 * Emit a single method on a resource.
 */
function emitMethod(method: MethodNode): string {
  const doc = jsdoc(
    method.description,
    [
      ...method.pathParams.map((p) => ({ name: p.tsName, description: p.description ?? '' })),
      ...(method.requestBody ? [{ name: 'body', description: 'Request body' }] : []),
    ].filter((p) => p.description),
  );

  const sig = buildMethodSignature(method);
  const body = buildMethodBody(method);

  return joinBlocks(indent(doc), indent(`${sig} {\n${indent(body)}\n  }`));
}

/**
 * Build the method signature.
 */
function buildMethodSignature(method: MethodNode): string {
  const params: string[] = [];

  // Path params first
  for (const param of method.pathParams) {
    params.push(`${param.tsName}: ${emitTypeRef(param.type)}`);
  }

  // Request body
  if (method.requestBody) {
    const bodyType = emitTypeRef(method.requestBody);
    params.push(`body: ${bodyType}`);
  }

  // Query params as options object
  if (method.queryParams.length > 0) {
    const queryType = buildQueryParamsType(method.queryParams);
    params.push(`query?: ${queryType}`);
  }

  // Return type
  const returnType = buildReturnType(method);
  const deprecated = method.deprecated ? '/** @deprecated */\n  ' : '';

  return `${deprecated}async ${method.name}(${params.join(', ')}): Promise<${returnType}>`;
}

/**
 * Build the method body — the actual HTTP call.
 */
function buildMethodBody(method: MethodNode): string {
  const pathExpr = buildPathExpression(method.path, method.pathParams);
  const httpMethod = method.httpMethod;

  const options: string[] = [];

  if (method.requestBody) {
    options.push(`body`);
  }

  if (method.queryParams.length > 0) {
    options.push(`query`);
  }

  const optionsStr = options.length > 0
    ? `, { ${options.join(', ')} }`
    : '';

  if (method.streaming) {
    return `return this._client.stream(${pathExpr}${optionsStr});`;
  }

  switch (httpMethod) {
    case 'get':
      return `return this._client.get(${pathExpr}${optionsStr});`;
    case 'post':
      return `return this._client.post(${pathExpr}${optionsStr});`;
    case 'put':
      return `return this._client.put(${pathExpr}${optionsStr});`;
    case 'patch':
      return `return this._client.patch(${pathExpr}${optionsStr});`;
    case 'delete':
      return `return this._client.delete(${pathExpr}${optionsStr});`;
    default:
      return `return this._client.post(${pathExpr}${optionsStr});`;
  }
}

/**
 * Build a path expression, substituting path params.
 * "/files/{file_id}" → `\`/files/${fileId}\``
 */
function buildPathExpression(path: string, pathParams: ParamNode[]): string {
  if (pathParams.length === 0) return `'${path}'`;

  let template = path;
  for (const param of pathParams) {
    template = template.replace(`{${param.name}}`, `\${${param.tsName}}`);
  }
  return `\`${template}\``;
}

/**
 * Build the query params type as an inline object type.
 */
function buildQueryParamsType(params: ParamNode[]): string {
  const props = params
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const opt = p.required ? '' : '?';
      return `${p.tsName}${opt}: ${emitTypeRef(p.type)}`;
    });

  return `{ ${props.join('; ')} }`;
}

/**
 * Build the return type for a method.
 */
function buildReturnType(method: MethodNode): string {
  if (method.streaming) {
    return `Stream<${emitTypeRef(method.responseType)}>`;
  }
  return emitTypeRef(method.responseType);
}
