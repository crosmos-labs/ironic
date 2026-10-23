# Ironic

Generate TypeScript and Python SDKs, MCP servers, and static API documentation from OpenAPI specs.

Ironic is an open-source SDK generator inspired by [Stainless](https://www.stainless.com). It takes an OpenAPI 3.x spec plus a small `ironic.yml` config, and emits:

- A **TypeScript SDK** with a resource tree, retries with backoff, pagination, streaming, and a typed error hierarchy.
- A **Python SDK** with matching resources, pagination, and authentication support.
- An **MCP server** with two tools (`execute_code`, `search_docs`) that exposes the SDK to coding agents.
- A **static API reference** with resource, endpoint, and type pages and local search.

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
npx ironic generate   # writes all configured targets
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
| Python target | ✅ |
| Docs site generator | ✅ |

To generate only documentation, add `docs` to your config and run:

```yaml
targets:
  docs:
    output_dir: ./generated/docs
    title: My API Reference # optional; defaults to the API name
```

```bash
npx ironic generate --target docs
# Open generated/docs/index.html directly, or serve generated/docs as static files.
```

The docs target can be used without a TypeScript or Python target. It writes standalone HTML, CSS, and JavaScript files; no site build or server runtime is needed.

## Repo layout

```
packages/
  cli/                    ← ironic CLI binary
  core/                   ← parser + planner + IR types
  generator-typescript/   ← TS SDK emitter
  generator-mcp/          ← MCP server emitter
  generator-python/       ← Python SDK emitter
  generator-docs/         ← static API reference emitter
  runtime-typescript/     ← copied into generated SDKs
  runtime-python/         ← copied into generated SDKs
examples/
  petstore/               ← test fixture
```

## Development

```bash
npm install
npm run build
npm test              # unit + snapshot
npm run test:runtime  # exercises the generated petstore SDK
npm run lint
```

## License

Apache-2.0
