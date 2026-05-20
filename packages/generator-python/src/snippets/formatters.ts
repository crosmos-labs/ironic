export function indent(code: string, spaces = 4): string {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : ''))
    .join('\n');
}

export function joinLines(...lines: (string | undefined | null | false)[]): string {
  return lines.filter(Boolean).join('\n');
}

export function joinBlocks(...blocks: (string | undefined | null | false)[]): string {
  return blocks.filter(Boolean).join('\n\n');
}

export function docstring(description?: string): string {
  if (!description) return '';
  const lines = description.split('\n');
  if (lines.length === 1) return `"""${lines[0]}"""`;
  return `"""\n${lines.join('\n')}\n"""`;
}

export function fileHeader(): string {
  return '# File generated from your OpenAPI spec by Ironic. See https://ironic.dev for details.';
}

export function snakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .replace(/__+/g, '_')
    .toLowerCase();
}
