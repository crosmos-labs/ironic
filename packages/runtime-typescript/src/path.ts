// ─── Path Template ───────────────────────────────────────────────────────────
// Tagged-template helper for safe URL-path building. Encodes interpolated
// values so characters like `/`, `?`, and `#` don't corrupt the URL.

/**
 * Safe URL-path builder. Use as a tagged template:
 *
 *     path`/files/${fileId}/content`
 *
 * Each interpolated value is encoded with `encodeURIComponent`.
 */
export function path(strings: TemplateStringsArray, ...values: string[]): string {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    out += encodeURIComponent(values[i]!) + strings[i + 1]!;
  }
  return out;
}
