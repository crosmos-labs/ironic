// ─── Resource Emitter ────────────────────────────────────────────────────────
// Emit TypeScript resource classes from IR ResourceNodes. Stainless convention:
// the resource file owns the types declared in its `models:` block — they're
// emitted inline after the class body, then a `declare namespace` re-export
// surfaces them under `ResourceName.TypeName`.

import type { ResourceNode, MethodNode, ParamNode, TypeRef, TypeDef } from '@ironic/core';
import { camelCase } from '@ironic/core';
import { emitTypeRef, emitTypeDef } from './types.js';
import { indent, jsdoc, joinBlocks, fileHeader } from '../snippets/formatters.js';
import { collectResourceTypeRefs } from '../snippets/type-refs.js';

/**
 * Context the emitter needs to resolve type imports across resource files.
 */
export interface ResourceEmitContext {
  /** Types owned by this resource — emitted inline. */
  ownedTypes: TypeDef[];
  /** TypeName → owning resource name, for cross-resource imports. */
  typeOwners: Map<string, string>;
  /** Set of type names that live in `src/types/shared.ts`. */
  sharedTypeNames: Set<string>;
}

/**
 * Emit a single resource file.
 */
export function emitResourceFile(resource: ResourceNode, ctx?: ResourceEmitContext): string {
  const owned = ctx?.ownedTypes ?? [];
  const imports = buildImports(resource, ctx);
  const classBody = emitResourceClass(resource);
  const inlineTypes = owned.length > 0
    ? owned.map(emitTypeDef).join('\n\n')
    : '';
  const ns = emitNamespaceReExport(resource, owned.map((t) => t.name));

  return joinBlocks(fileHeader(), imports, classBody, inlineTypes, ns) + '\n';
}

/**
 * Emit a `declare namespace ResourceName` block that re-exports types owned by
 * this resource so callers can write `Spaces.Space`, `Spaces.SpaceList`, etc.
 * Stainless emits this for owned types only (not for external/shared refs).
 */
function emitNamespaceReExport(resource: ResourceNode, ownedNames: string[]): string {
  if (ownedNames.length === 0) return '';
  const reExports = ownedNames
    .slice()
    .sort()
    .map((t) => `    type ${t} as ${t},`)
    .join('\n');
  return `export declare namespace ${resource.className} {
  export {
${reExports}
  };
}`;
}

/**
 * Build import statements for a resource file. Type imports are split by owner:
 *   - Owned by this resource → skipped (emitted inline below the class)
 *   - Owned by another resource → imported from `./{otherResource}.js`
 *   - Shared (unowned) → imported from `../types/shared.js`
 */
function buildImports(resource: ResourceNode, ctx?: ResourceEmitContext): string {
  const lines: string[] = [
    `import { APIResource } from '../core/api-client.js';`,
    `import type { RequestOptions } from '../core/types.js';`,
  ];

  const needsAPIPromise = resource.methods.some((m) => !m.streaming && !m.pagination);
  if (needsAPIPromise) {
    lines.push(`import { APIPromise } from '../core/api-promise.js';`);
  }

  const needsPathTpl = resource.methods.some((m) => m.pathParams.length > 0);
  if (needsPathTpl) {
    lines.push(`import { path } from '../core/path.js';`);
  }

  // `delete` and other void-returning methods need to set Accept: */* so the
  // runtime doesn't try to parse an empty 204 body as JSON.
  const needsBuildHeaders = resource.methods.some((m) => m.httpMethod === 'delete');
  if (needsBuildHeaders) {
    lines.push(`import { buildHeaders } from '../core/headers.js';`);
  }

  for (const child of resource.children) {
    lines.push(
      `import { ${child.className} } from './${camelCase(child.name)}/index.js';`,
    );
  }

  const hasCursorPagination = resource.methods.some((m) => m.pagination === 'cursor');
  const hasOffsetPagination = resource.methods.some((m) => m.pagination === 'offset');
  if (hasCursorPagination || hasOffsetPagination) {
    const paginationImports: string[] = [];
    if (hasCursorPagination) paginationImports.push('CursorPage');
    if (hasOffsetPagination) paginationImports.push('OffsetPage');
    lines.push(`import { ${paginationImports.join(', ')} } from '../core/pagination.js';`);
  }

  const hasStreaming = resource.methods.some((m) => m.streaming);
  if (hasStreaming) {
    lines.push(`import { Stream } from '../core/streaming.js';`);
  }

  // ── Type imports (split by owner) ──
  const allRefs = collectResourceTypeRefs(resource);
  const ownedNames = new Set((ctx?.ownedTypes ?? []).map((t) => t.name));
  const ownerOf = ctx?.typeOwners ?? new Map<string, string>();
  const shared = ctx?.sharedTypeNames ?? new Set<string>();

  const fromOtherResource = new Map<string, string[]>(); // ownerResourceName → typeNames
  const fromShared: string[] = [];

  for (const ref of allRefs) {
    if (ownedNames.has(ref)) continue; // inlined locally
    const owner = ownerOf.get(ref);
    if (owner && owner !== resource.name) {
      const arr = fromOtherResource.get(owner) ?? [];
      arr.push(ref);
      fromOtherResource.set(owner, arr);
    } else if (shared.has(ref)) {
      fromShared.push(ref);
    }
  }

  // Stable, alphabetized
  for (const owner of [...fromOtherResource.keys()].sort()) {
    const names = fromOtherResource.get(owner)!.slice().sort();
    lines.push(`import type { ${names.join(', ')} } from './${owner}.js';`);
  }
  if (fromShared.length > 0) {
    lines.push(`import type { ${fromShared.slice().sort().join(', ')} } from '../types/shared.js';`);
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
 * Emit a single method on a resource. Stainless style: JSDoc immediately
 * adjacent to the signature (no blank line in between).
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

  // Glue the doc to the signature directly (no joinBlocks blank line).
  const docPart = doc ? `${indent(doc)}\n` : '';
  return `${docPart}${indent(`${sig} {\n${indent(body)}\n}`)}`;
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

  // Query params. Stainless ergonomics:
  //   - All optional → `query: T | null | undefined = {}`  (callable without args)
  //   - Some required → `query: T`                          (required positional)
  const hasRequiredQuery = method.queryParams.some((p) => p.required);
  if (method.queryParamsTypeName) {
    if (hasRequiredQuery) {
      params.push(`query: ${method.queryParamsTypeName}`);
    } else {
      params.push(`query: ${method.queryParamsTypeName} | null | undefined = {}`);
    }
  } else if (method.queryParams.length > 0) {
    const queryType = buildQueryParamsType(method.queryParams);
    if (hasRequiredQuery) {
      params.push(`query: ${queryType}`);
    } else {
      params.push(`query: ${queryType} | null | undefined = {}`);
    }
  }

  // Per-call request options (headers, timeout, signal, maxRetries).
  params.push(`options?: RequestOptions`);

  // Return type
  const returnType = buildReturnType(method);
  const deprecated = method.deprecated ? '/** @deprecated */\n  ' : '';

  // Streaming and pagination methods return their own promise wrappers
  // (Stream<T> / a Page subclass), so they stay `async` returning a Promise.
  // Everything else returns APIPromise<T> directly without async.
  const wrapper = method.streaming || method.pagination ? 'Promise' : 'APIPromise';
  const asyncKw = method.streaming || method.pagination ? 'async ' : '';

  return `${deprecated}${asyncKw}${method.name}(${params.join(', ')}): ${wrapper}<${returnType}>`;
}

/**
 * Build the method body — the actual HTTP call.
 */
function buildMethodBody(method: MethodNode): string {
  const pathExpr = buildPathExpression(method.path, method.pathParams);
  const httpMethod = method.httpMethod;
  const hasBody = !!method.requestBody;
  const hasQuery = method.queryParams.length > 0;

  // Stainless ordering: explicit fields BEFORE the options spread. When there's
  // no body and no query, pass `options` straight through instead of wrapping.
  const callTail = (() => {
    if (!hasBody && !hasQuery) return ', options';
    const parts: string[] = [];
    if (hasBody) parts.push('body');
    if (hasQuery) parts.push('query');
    parts.push('...options');
    return `, { ${parts.join(', ')} }`;
  })();

  if (method.streaming) {
    return `return this._client.stream(${pathExpr}${callTail});`;
  }

  if (method.pagination) {
    const pageClass = method.pagination === 'cursor' ? 'CursorPage' : 'OffsetPage';
    const itemType = emitTypeRef(extractPageItemType(method.responseType));
    return `return this._client.getAPIList<${itemType}, ${pageClass}<${itemType}>>(${pathExpr}, ${pageClass}${callTail});`;
  }

  switch (httpMethod) {
    case 'get':
      return `return this._client.get(${pathExpr}${callTail});`;
    case 'post':
      return `return this._client.post(${pathExpr}${callTail});`;
    case 'put':
      return `return this._client.put(${pathExpr}${callTail});`;
    case 'patch':
      return `return this._client.patch(${pathExpr}${callTail});`;
    case 'delete': {
      // Stainless: delete sends `Accept: */*` so 204 No Content doesn't trip
      // the JSON parser. Body content lives at +4 spaces relative to the
      // method body so the rendered output reads as natural object literal:
      //   return this._client.delete(path, {
      //     ...options,
      //     headers: buildHeaders([{ Accept: '*/*' }, options?.headers]),
      //   });
      const deleteParts: string[] = [];
      if (hasBody) deleteParts.push('body');
      if (hasQuery) deleteParts.push('query');
      deleteParts.push('...options');
      deleteParts.push(`headers: buildHeaders([{ Accept: '*/*' }, options?.headers])`);
      const indented = deleteParts.map((p) => `  ${p},`).join('\n');
      return `return this._client.delete(${pathExpr}, {\n${indented}\n});`;
    }
    default:
      return `return this._client.post(${pathExpr}${callTail});`;
  }
}

/**
 * Build a path expression, substituting path params. Uses the `path` tagged
 * template from the runtime so values get URI-encoded (otherwise a param
 * containing `/` or `?` would corrupt the URL).
 *
 *   "/files/{file_id}" with one param → path`/files/${fileId}`
 */
function buildPathExpression(specPath: string, pathParams: ParamNode[]): string {
  if (pathParams.length === 0) return `'${specPath}'`;

  let template = specPath;
  for (const param of pathParams) {
    template = template.replace(`{${param.name}}`, `\${${param.tsName}}`);
  }
  return `path\`${template}\``;
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

  // Paginated methods return a Page<ItemType>
  if (method.pagination) {
    const itemType = extractPageItemType(method.responseType);
    const pageClass = method.pagination === 'cursor' ? 'CursorPage' : 'OffsetPage';
    return `${pageClass}<${emitTypeRef(itemType)}>`;
  }

  return emitTypeRef(method.responseType);
}

/**
 * Extract the item type from a paginated response.
 * E.g. { data: Pet[], has_more: boolean } → Pet
 */
function extractPageItemType(responseType: TypeRef): TypeRef {
  if (responseType.kind === 'object') {
    const dataProp = responseType.properties['data'];
    if (dataProp && dataProp.type.kind === 'array') {
      return dataProp.type.items;
    }
  }
  // Fallback: return the response type itself
  return responseType;
}
