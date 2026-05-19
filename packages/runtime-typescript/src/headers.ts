// ─── Headers Utility ─────────────────────────────────────────────────────────
// Case-insensitive header merging. Later sources override earlier ones.
// Null/undefined values *delete* a header from the merged result — useful for
// the default-then-per-call layering pattern in BaseClient.

import type { HeadersInit } from './types.js';

type HeaderSource = HeadersInit | undefined | null;

/**
 * Merge any number of header sources into a Headers object.
 * Sources are applied left → right; later wins. A value of `null` or
 * `undefined` removes the header.
 *
 * Accepts both forms (matches Stainless's signature for migration parity):
 *   buildHeaders({ Accept: 'application/json' }, { 'X-Trace': 'abc' })
 *   buildHeaders([{ Accept: 'application/json' }, { 'X-Trace': 'abc' }])
 */
export function buildHeaders(...args: (HeaderSource | HeaderSource[])[]): Headers {
  // Stainless calls `buildHeaders([{...}, options?.headers])` — a single array.
  // Flatten one level so both call shapes work.
  const sources: HeaderSource[] = [];
  for (const arg of args) {
    if (Array.isArray(arg) && !isHeaderTuple(arg)) {
      for (const inner of arg as HeaderSource[]) sources.push(inner);
    } else {
      sources.push(arg as HeaderSource);
    }
  }

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

/**
 * HeadersInit allows `[string, string][]` (an array of tuples). Distinguish
 * that case from our outer "array of header sources" form.
 */
function isHeaderTuple(arr: unknown[]): boolean {
  return (
    arr.length > 0 &&
    Array.isArray(arr[0]) &&
    (arr[0] as unknown[]).length === 2 &&
    typeof (arr[0] as unknown[])[0] === 'string'
  );
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
