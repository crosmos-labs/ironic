# Changelog

All notable changes are documented here. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added
- CI validation that builds and imports generated SDKs, compiles an MCP server, and invokes both MCP tools over stdio.
- Cursor + offset pagination integration in generated resource methods — `list` methods now return `CursorPage<T>` / `OffsetPage<T>` instead of `Promise<RawShape>`.
- `--dry-run` flag on `ironic generate`.
- Runtime smoke tests against the generated petstore SDK (pagination iteration, retries on 429, typed errors).
- Repo-level README, LICENSE (Apache-2.0), CHANGELOG.
- GitHub Actions CI (build + lint + unit/snapshot tests + runtime tests on Node 20 and 22).

### Fixed
- MCP `execute_code` now transpiles TypeScript and terminates timed-out asynchronous or looping calls in an isolated worker.
- Generated pagination now follows configured cursor, item, total, and page parameter names in TypeScript and Python, including numeric offsets.
- Generated TypeScript and Python clients now send basic credentials and API keys in the configured header, query parameter, or cookie; MCP servers inherit SDK credential resolution.
- `BaseClient.getAPIList` now preserves the concrete page subtype (`CursorPage<Pet>` instead of `AbstractPage<Pet>`), so paginated SDK methods type-check.
- Emitter indentation: closing brace of resource methods is now aligned with the method signature.

## [0.1.0] — 2026-05-18

Initial scaffold: CLI, core parser/planner, TypeScript + MCP emitters, runtime package.
