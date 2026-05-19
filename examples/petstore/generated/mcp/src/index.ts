#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerExecuteCode } from './tools/execute-code.js';
import { registerSearchDocs } from './tools/search-docs.js';

const server = new McpServer({
  name: 'petstore-mcp',
  version: '1.0.0',
});

registerExecuteCode(server);
registerSearchDocs(server);

const transport = new StdioServerTransport();
await server.connect(transport);
