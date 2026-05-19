# Ironic

Generate idiomatic TypeScript SDKs and MCP servers from OpenAPI specs.

Ironic is an open-source SDK generator inspired by [Stainless](https://www.stainless.com). It takes an OpenAPI 3.x spec plus a small `ironic.yml` config, and emits:

- A **TypeScript SDK** with a resource tree, retries with backoff, pagination, streaming, and a typed error hierarchy.
- An **MCP server** with two tools (`execute_code`, `search_docs`) that exposes the SDK to coding agents.

## Quick start

```bash
git clone https://github.com/ironic-sdk/ironic
cd ironic
npm install
npm run build

# Generate from the petstore example
cd examples/petstore
npx tsx ../../packages/cli/src/index.ts generate
```

The generated TypeScript SDK lands in `examples/petstore/generated/typescript`. From a fresh project:

```bash
npx ironic init       # writes a starter ironic.yml
npx ironic validate   # checks spec + config
npx ironic plan       # prints the resource tree
npx ironic generate   # writes SDK + MCP server
```

## What's in the box

| Feature | Status |
|---|---|
| TypeScript SDK target | ✅ |
| MCP server target | ✅ |
| Cursor + offset pagination | ✅ |
| SSE streaming | ✅ |
| Retries with exponential backoff | ✅ |
| Bearer / API-key / basic auth | ✅ |
| Auto-inference of resources from paths | ✅ |
| Python target | ⏳ (planned) |
| Docs site generator | ⏳ (planned) |

## Repo layout

```
packages/
  cli/                    ← ironic CLI binary
  core/                   ← parser + planner + IR types
  generator-typescript/   ← TS SDK emitter
  generator-mcp/          ← MCP server emitter
  runtime-typescript/     ← copied into generated SDKs
examples/
  petstore/               ← test fixture
docs/                     ← design docs
```

## Development

```bash
npm install
npm run build
npm test              # unit + snapshot
npm run test:runtime  # exercises the generated petstore SDK
npm run lint
```

See `docs/` for architecture, planner design, testing strategy, and roadmap.

## License

Apache-2.0
