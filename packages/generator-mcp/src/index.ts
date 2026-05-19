// ─── MCP Server Generator ────────────────────────────────────────────────────
// Stub — will be implemented in Phase 3.

import type { IR } from '@ironic/core';

export type FileTree = Map<string, string>;

/**
 * Generate an MCP server package from an IR.
 * TODO: Implement in Phase 3.
 */
export function emit(ir: IR): FileTree {
  const files: FileTree = new Map();

  files.set(
    'package.json',
    JSON.stringify(
      {
        name: ir.meta.packageName.replace(/sdk$/, 'mcp').replace(/@([^/]+)\/(.+)/, '@$1/$2-mcp'),
        version: ir.meta.version,
        description: `MCP server for ${ir.meta.prettyName}`,
        type: 'module',
        main: './src/index.ts',
        scripts: {
          start: 'tsx src/index.ts',
        },
        dependencies: {
          '@modelcontextprotocol/sdk': '^1.0.0',
          zod: '^3.23.0',
          [ir.meta.packageName]: '*',
        },
      },
      null,
      2,
    ) + '\n',
  );

  files.set(
    'src/index.ts',
    `// MCP Server for ${ir.meta.prettyName}
// TODO: Implement execute_code and search_docs tools
console.log('MCP server not yet implemented');
`,
  );

  return files;
}
