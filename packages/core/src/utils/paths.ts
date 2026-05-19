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
 */
export function getResourceSegments(path: string): string[] {
  const stripped = stripVersionPrefix(path);
  return splitPathSegments(stripped).filter((s) => !isPathParam(s));
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
): string {
  const stripped = stripVersionPrefix(path);
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
