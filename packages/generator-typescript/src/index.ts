// ─── TypeScript Generator ────────────────────────────────────────────────────
// Main entry point: takes an IR, produces a FileTree (Map<path, contents>).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IR, ResourceNode, TypeDef } from '@ironic/core';
import { emitClientFile } from './emitters/client.js';
import { emitResourceFile } from './emitters/resource.js';
import { emitTypesFile, emitTypeDef } from './emitters/types.js';
import { emitPackageJson, emitTsConfig, emitReadme } from './emitters/package-json.js';
import { fileHeader } from './snippets/formatters.js';

/** Map from relative file path → file contents */
export type FileTree = Map<string, string>;

export interface EmitOptions {
  /** Absolute path to the runtime-typescript package src/ directory */
  runtimeSrcDir?: string;
}

/**
 * Generate a complete TypeScript SDK from an IR.
 * Returns a FileTree — the caller writes it to disk.
 */
export function emit(ir: IR, options: EmitOptions = {}): FileTree {
  const files: FileTree = new Map();

  // 1. Package scaffolding
  files.set('package.json', emitPackageJson(ir));
  files.set('tsconfig.json', emitTsConfig());
  files.set('README.md', emitReadme(ir));

  // 2. Copy runtime files into src/core/
  copyRuntimeFiles(files, options.runtimeSrcDir);

  // 3. Emit the main client
  files.set('src/client.ts', emitClientFile(ir));

  // 4. Emit resource files
  for (const resource of ir.resources) {
    emitResourceTree(files, resource, 'src/resources');
  }

  // 5. Emit type files
  emitTypes(files, ir.types);

  // 6. Emit index.ts (barrel export)
  files.set('src/index.ts', emitIndexFile(ir));

  return files;
}

/**
 * Copy runtime TypeScript files into the generated SDK's src/core/ directory.
 */
function copyRuntimeFiles(files: FileTree, runtimeSrcDir?: string): void {
  const runtimeDir = runtimeSrcDir ?? resolveRuntimeDir();

  const runtimeFiles = [
    'api-client.ts',
    'api-promise.ts',
    'errors.ts',
    'pagination.ts',
    'path.ts',
    'streaming.ts',
    'uploads.ts',
    'types.ts',
  ];

  for (const file of runtimeFiles) {
    try {
      const content = readFileSync(resolve(runtimeDir, file), 'utf-8');
      files.set(`src/core/${file}`, content);
    } catch {
      // If runtime file doesn't exist, emit a placeholder
      files.set(`src/core/${file}`, `// TODO: Runtime file ${file} not found\n`);
    }
  }

  // Core index
  files.set(
    'src/core/index.ts',
    `export { BaseClient, APIResource } from './api-client.js';
export { APIPromise } from './api-promise.js';
export { path } from './path.js';
export * from './errors.js';
export * from './pagination.js';
export * from './streaming.js';
export * from './uploads.js';
export type * from './types.js';
`,
  );
}

/**
 * Resolve the runtime source directory.
 */
function resolveRuntimeDir(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Go from generator-typescript/src/ → runtime-typescript/src/
    return resolve(__dirname, '../../runtime-typescript/src');
  } catch {
    return resolve(process.cwd(), 'packages/runtime-typescript/src');
  }
}

/**
 * Recursively emit resource files for a resource tree.
 */
function emitResourceTree(
  files: FileTree,
  resource: ResourceNode,
  basePath: string,
): void {
  if (resource.children.length > 0) {
    // Nested resource: create a directory with index.ts
    const dirPath = `${basePath}/${resource.name}`;
    files.set(`${dirPath}/index.ts`, emitResourceFile(resource));

    for (const child of resource.children) {
      emitResourceTree(files, child, dirPath);
    }
  } else {
    // Flat resource: single file
    files.set(`${basePath}/${resource.name}.ts`, emitResourceFile(resource));
  }
}

/**
 * Emit type definition files, grouped by resource.
 */
function emitTypes(files: FileTree, types: TypeDef[]): void {
  if (types.length === 0) return;

  // Group types by resource
  const groups = new Map<string, TypeDef[]>();
  const ungrouped: TypeDef[] = [];

  for (const type of types) {
    if (type.resourceName) {
      const key = type.resourceName.split('.')[0] ?? 'shared';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(type);
    } else {
      ungrouped.push(type);
    }
  }

  // Emit grouped files
  for (const [group, defs] of groups) {
    files.set(`src/types/${group}.ts`, emitTypesFile(defs));
  }

  // Emit ungrouped as shared
  if (ungrouped.length > 0) {
    files.set('src/types/shared.ts', emitTypesFile(ungrouped));
  }

  // Types barrel
  const typeFiles = [...groups.keys(), ...(ungrouped.length > 0 ? ['shared'] : [])].sort();
  const typeBarrel = typeFiles.map((f) => `export * from './${f}.js';`).join('\n') + '\n';
  files.set('src/types/index.ts', typeBarrel);
}

/**
 * Emit the main index.ts barrel export.
 */
function emitIndexFile(ir: IR): string {
  const lines: string[] = [
    fileHeader(),
    ``,
    `export { ${ir.meta.prettyName}Client } from './client.js';`,
    `export type { ${ir.meta.prettyName}ClientOptions } from './client.js';`,
    ``,
    `// Core`,
    `export { APIError, BadRequestError, AuthenticationError, PermissionDeniedError, NotFoundError, ConflictError, UnprocessableEntityError, RateLimitError, InternalServerError, APIConnectionError, APITimeoutError } from './core/errors.js';`,
    `export { APIPromise } from './core/api-promise.js';`,
    `export type { RequestOptions, ClientOptions } from './core/types.js';`,
  ];

  // Export resource classes
  if (ir.resources.length > 0) {
    lines.push('');
    lines.push('// Resources');
    for (const resource of ir.resources) {
      if (resource.children.length > 0) {
        lines.push(`export { ${resource.className} } from './resources/${resource.name}/index.js';`);
      } else {
        lines.push(`export { ${resource.className} } from './resources/${resource.name}.js';`);
      }
    }
  }

  // Export types
  lines.push('');
  lines.push('// Types');
  lines.push(`export * from './types/index.js';`);

  return lines.join('\n') + '\n';
}
