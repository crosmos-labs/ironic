// ─── Naming Utilities ────────────────────────────────────────────────────────
// Convert between naming conventions: camelCase, PascalCase, snake_case, kebab-case.

/** Split a string into words, handling camelCase, PascalCase, snake_case, kebab-case. */
function splitWords(input: string): string[] {
  return input
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // XMLParser → XML Parser
    .replace(/[-_]+/g, ' ')                    // snake_case/kebab-case → spaces
    .replace(/[^a-zA-Z0-9 ]/g, '')             // strip non-alphanumeric
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Convert to camelCase: "foo_bar" → "fooBar" */
export function camelCase(input: string): string {
  const words = splitWords(input);
  return words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');
}

/** Convert to PascalCase: "foo_bar" → "FooBar" */
export function pascalCase(input: string): string {
  const words = splitWords(input);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/** Convert to snake_case: "fooBar" → "foo_bar" */
export function snakeCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join('_');
}

/** Convert to kebab-case: "fooBar" → "foo-bar" */
export function kebabCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join('-');
}

/** Convert to UPPER_SNAKE_CASE: "fooBar" → "FOO_BAR" */
export function upperSnakeCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toUpperCase())
    .join('_');
}

/** Make a safe TypeScript identifier: strip invalid chars, ensure starts with letter. */
export function safeIdentifier(input: string): string {
  let result = input.replace(/[^a-zA-Z0-9_$]/g, '_');
  if (/^[0-9]/.test(result)) result = '_' + result;
  return result;
}

/** Singularize a word (naive — handles common English plurals). */
export function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Pluralize a word (naive). */
export function pluralize(word: string): string {
  if (word.endsWith('y') && !/[aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) return word + 'es';
  return word + 's';
}
