// ─── Headers Utility ─────────────────────────────────────────────────────────
// Case-insensitive header merging. Later sources override earlier ones.
// Null/undefined values *delete* a header from the merged result — useful for
// the default-then-per-call layering pattern in BaseClient.

import type { HeadersInit } from './types.js';

/**
 * Merge any number of header sources into a Headers object.
 * Sources are applied left → right; later wins. A value of `null` or
 * `undefined` removes the header (handy when a user wants to suppress a
 * default like User-Agent).
 *
 *   buildHeaders({ Accept: 'application/json' }, { 'X-Trace': 'abc' })
 *   buildHeaders({ Accept: 'application/json' }, { Accept: null })  // strips Accept
 */
export function buildHeaders(
  ...sources: (HeadersInit | undefined | null)[]
): Headers {
  const out = new Headers();
  for (const src of sources) {
    if (!src) continue;
    forEachEntry(src, (key, value) => {
      if (value === null || value === undefined) {
        out.delete(key);
      } else {
        out.set(key, String(value));
      }
    });
  }
  return out;
}

function forEachEntry(
  src: HeadersInit,
  cb: (key: string, value: string | null | undefined) => void,
): void {
  if (src instanceof Headers) {
    src.forEach((value, key) => cb(key, value));
    return;
  }
  if (Array.isArray(src)) {
    for (const [k, v] of src) cb(k, v);
    return;
  }
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    cb(k, v as string | null | undefined);
  }
}

/**
 * Return true if `headers` contains a key case-insensitively.
 */
export function hasHeader(headers: HeadersInit | undefined, name: string): boolean {
  if (!headers) return false;
  const lower = name.toLowerCase();
  if (headers instanceof Headers) return headers.has(name);
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === lower);
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}
