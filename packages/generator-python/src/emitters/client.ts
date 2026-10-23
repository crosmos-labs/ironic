import type { IR, ResourceNode } from '@ironic/core';
import { fileHeader, joinBlocks } from '../snippets/formatters.js';
import { snakeCase } from '../snippets/formatters.js';

export function emitClientFile(ir: IR): string {
  const imports = buildImports(ir);
  const syncClient = buildClientClass(ir, 'sync');
  const asyncClient = buildClientClass(ir, 'async');

  return [fileHeader(), '', imports, '', '', syncClient, '', '', asyncClient, ''].join('\n');
}

function buildImports(ir: IR): string {
  const lines: string[] = [
    'from __future__ import annotations',
    '',
    'import os',
    'from typing import Optional',
    '',
    'from ._core import SyncAPIClient, AsyncAPIClient',
  ];

  // Import resource classes
  for (const resource of ir.resources) {
    const modName = snakeCase(resource.name);
    if (resource.children.length > 0) {
      lines.push(
        `from .resources.${modName} import ${resource.className}, Async${resource.className}`,
      );
    } else {
      lines.push(
        `from .resources.${modName} import ${resource.className}, Async${resource.className}`,
      );
    }
  }

  return lines.join('\n');
}

function buildClientClass(ir: IR, mode: 'sync' | 'async'): string {
  const isAsync = mode === 'async';
  const prefix = isAsync ? 'Async' : '';
  const baseClass = isAsync ? 'AsyncAPIClient' : 'SyncAPIClient';
  const className = `${prefix}${ir.meta.prettyName}`;

  const resourceDecls = ir.resources
    .map((r) => {
      const pyName = snakeCase(r.name);
      const rClassName = isAsync ? `Async${r.className}` : r.className;
      return `    ${pyName}: ${rClassName}`;
    })
    .join('\n');

  const resourceInits = ir.resources
    .map((r) => {
      const pyName = snakeCase(r.name);
      const rClassName = isAsync ? `Async${r.className}` : r.className;
      return `        self.${pyName} = ${rClassName}(self)`;
    })
    .join('\n');

  const apiKeyDefault = ir.auth.type !== 'none' && ir.auth.type !== 'basic'
    ? `api_key if api_key is not None else os.environ.get(${JSON.stringify(ir.auth.envVar)}, "")`
    : `api_key if api_key is not None else ""`;
  const auth = {
    type: ir.auth.type === 'custom' ? 'none' : ir.auth.type,
    ...(ir.auth.type === 'api_key' ? { name: ir.auth.name ?? ir.auth.headerName, in: ir.auth.in ?? 'header' } : {}),
  };

  const baseURLDefault = ir.meta.baseURL
    ? `base_url or "${ir.meta.baseURL}"`
    : `base_url or ""`;

  // Environment resolution
  let envBlock = '';
  if (Object.keys(ir.meta.environments).length > 0) {
    const envMap = Object.entries(ir.meta.environments)
      .map(([key, url]) => `            "${key}": "${url}",`)
      .join('\n');
    envBlock = `
        environments = {
${envMap}
        }
        if environment is not None:
            resolved_base_url = environments.get(environment, "${ir.meta.baseURL}")
        else:
            resolved_base_url = ${baseURLDefault}`;
  }

  const envParam = Object.keys(ir.meta.environments).length > 0
    ? `\n        environment: Optional[str] = ${ir.meta.defaultEnvironment ? `"${ir.meta.defaultEnvironment}"` : 'None'},`
    : '';

  const resolvedBaseURL = envBlock ? 'resolved_base_url' : baseURLDefault;

  const lines: string[] = [];
  lines.push(`class ${className}(${baseClass}):`);
  lines.push(`    """${ir.meta.description}"""`);
  lines.push('');
  lines.push(resourceDecls);
  lines.push('');
  lines.push(`    def __init__(`);
  lines.push(`        self,`);
  lines.push(`        *,`);
  lines.push(`        api_key: Optional[str] = None,`);
  if (ir.auth.type === 'basic') {
    lines.push(`        username: Optional[str] = None,`);
    lines.push(`        password: Optional[str] = None,`);
  }
  lines.push(`        base_url: Optional[str] = None,${envParam}`);
  lines.push(`        timeout: float = ${ir.meta.timeoutMs / 1000},`);
  lines.push(`        max_retries: int = ${ir.meta.maxRetries},`);
  lines.push(`    ) -> None:`);

  if (envBlock) {
    lines.push(envBlock);
  }

  lines.push(`        super().__init__(`);
  lines.push(`            base_url=${resolvedBaseURL},`);
  lines.push(`            api_key=${apiKeyDefault},`);
  lines.push(`            auth=${JSON.stringify(auth)},`);
  if (ir.auth.type === 'basic') {
    lines.push(`            username=username if username is not None else os.environ.get(${JSON.stringify(ir.auth.usernameEnv)}, ""),`);
    lines.push(`            password=password if password is not None else os.environ.get(${JSON.stringify(ir.auth.passwordEnv)}, ""),`);
  }
  lines.push(`            timeout=timeout,`);
  lines.push(`            max_retries=max_retries,`);
  lines.push(`        )`);
  lines.push(resourceInits);

  return lines.join('\n');
}
