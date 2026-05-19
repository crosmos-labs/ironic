// ─── Path Utilities ──────────────────────────────────────────────────────────
// Helpers for parsing OpenAPI path strings like /v1/chat/completions/{id}.

/**
 * Strip leading version prefix from a path.
 * /v1/chat/completions → /chat/completions
 * /v2/files → /files
 * /chat/completions → /chat/completions (no prefix)
 */
export function stripVersionPrefix(path: string): string {
  return path.replace(/^\/v\d+/, '');
}

/**
 * Split a path into its non-empty segments.
 * "/v1/chat/completions/{id}" → ["v1", "chat", "completions", "{id}"]
 */
export function splitPathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Check if a segment is a path parameter.
 * "{file_id}" → true
 * "files" → false
 */
export function isPathParam(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

/**
 * Extract the parameter name from a path parameter segment.
 * "{file_id}" → "file_id"
 */
export function extractParamName(segment: string): string {
  return segment.slice(1, -1);
}

/**
 * Get the resource segments from a path (non-param, non-version segments).
 * "/v1/files/{file_id}/content" → ["files", "content"]
 *
 * If `prefix` is supplied it is stripped first; otherwise the legacy
 * `/v{N}` heuristic applies.
 */
export function getResourceSegments(path: string, prefix?: string): string[] {
  const stripped = prefix ? stripPrefix(path, prefix) : stripVersionPrefix(path);
  return splitPathSegments(stripped).filter((s) => !isPathParam(s));
}

/**
 * Strip an explicit path prefix. Returns the path unchanged if it does not start with the prefix.
 * Always returns a leading-slash path.
 *   stripPrefix('/api/v1/spaces', '/api/v1') → '/spaces'
 *   stripPrefix('/health', '/api/v1') → '/health'
 */
export function stripPrefix(path: string, prefix: string): string {
  if (!prefix) return path;
  const normPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (path === normPrefix) return '/';
  if (path.startsWith(normPrefix + '/')) {
    return path.slice(normPrefix.length);
  }
  return path;
}

/**
 * Find the longest path prefix shared by every input path.
 * Only whole segments count; returns '' if no shared prefix exists,
 * or if the shared prefix would leave any path empty.
 *
 *   ['/api/v1/spaces', '/api/v1/orgs']             → '/api/v1'
 *   ['/api/v1/spaces', '/api/v1/orgs', '/health']  → ''
 *   ['/spaces', '/orgs']                            → ''
 */
export function findCommonPathPrefix(paths: string[]): string {
  if (paths.length < 2) return '';
  const splits = paths.map(splitPathSegments);
  const min = Math.min(...splits.map((s) => s.length));

  let common = 0;
  outer: for (let i = 0; i < min; i++) {
    const seg = splits[0]![i];
    if (isPathParam(seg!)) break;
    for (const s of splits) {
      if (s[i] !== seg) break outer;
    }
    common = i + 1;
  }

  // Require all paths to have at least one segment beyond the prefix —
  // otherwise we'd collapse a real endpoint into "/" which kills grouping.
  if (common === 0) return '';
  if (splits.some((s) => s.length === common)) return '';

  return '/' + splits[0]!.slice(0, common).join('/');
}

/**
 * Get the "group key" — the first resource segment after version.
 * "/v1/files/{id}" → "files"
 * "/v1/chat/completions" → "chat"
 */
export function getGroupKey(path: string): string {
  const segments = getResourceSegments(path);
  return segments[0] ?? '';
}

/**
 * Determine the HTTP method name from the verb + path pattern.
 * GET /files → list
 * POST /files → create
 * GET /files/{id} → retrieve
 * PATCH /files/{id} → update
 * DELETE /files/{id} → delete
 * POST /files/{id}/cancel → cancel
 */
export function inferMethodName(
  httpMethod: string,
  path: string,
  prefix?: string,
): string {
  const stripped = prefix ? stripPrefix(path, prefix) : stripVersionPrefix(path);
  const segments = splitPathSegments(stripped);
  const lastSegment = segments[segments.length - 1];
  const hasTrailingParam = lastSegment ? isPathParam(lastSegment) : false;

  // POST /resource/{id}/verb → verb
  if (
    httpMethod === 'post' &&
    segments.length >= 3 &&
    !isPathParam(lastSegment!)
  ) {
    return lastSegment!;
  }

  const method = httpMethod.toLowerCase();

  if (hasTrailingParam) {
    switch (method) {
      case 'get': return 'retrieve';
      case 'put': return 'update';
      case 'patch': return 'update';
      case 'delete': return 'delete';
      case 'post': return 'create';
    }
  } else {
    switch (method) {
      case 'get': return 'list';
      case 'post': return 'create';
      case 'put': return 'update';
      case 'patch': return 'update';
      case 'delete': return 'delete';
    }
  }

  return method;
}
