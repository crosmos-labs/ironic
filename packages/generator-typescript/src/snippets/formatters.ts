// ─── Formatters ──────────────────────────────────────────────────────────────
// String formatting helpers for code generation.

/** Indent each line by a given number of spaces. */
export function indent(code: string, spaces = 2): string {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : ''))
    .join('\n');
}

/** Join non-empty strings with newlines. */
export function joinLines(...lines: (string | undefined | null | false)[]): string {
  return lines.filter(Boolean).join('\n');
}

/** Join non-empty strings with double newlines. */
export function joinBlocks(...blocks: (string | undefined | null | false)[]): string {
  return blocks.filter(Boolean).join('\n\n');
}

/** Wrap in a JSDoc comment. */
export function jsdoc(description?: string, params?: { name: string; description: string }[]): string {
  if (!description && (!params || params.length === 0)) return '';

  const lines: string[] = ['/**'];
  if (description) {
    for (const line of description.split('\n')) {
      lines.push(` * ${line}`);
    }
  }
  if (params && params.length > 0) {
    if (description) lines.push(' *');
    for (const param of params) {
      lines.push(` * @param ${param.name} ${param.description}`);
    }
  }
  lines.push(' */');
  return lines.join('\n');
}
