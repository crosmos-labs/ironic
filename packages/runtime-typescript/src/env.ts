// ─── Env Reader ──────────────────────────────────────────────────────────────
// Cross-runtime environment variable access. The generated client constructor
// uses this so the same SDK works in Node, Bun, Deno, edge runtimes, and the
// browser (where it just returns undefined).

/**
 * Read an environment variable across runtimes.
 *   - Node / Bun: `process.env[name]`
 *   - Deno:       `Deno.env.get(name)`
 *   - Browser / Workers: returns `undefined`
 */
export function readEnv(name: string): string | undefined {
  const g = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
    Deno?: { env?: { get: (k: string) => string | undefined } };
  };

  // Node, Bun, most edge runtimes
  if (g.process?.env) {
    const v = g.process.env[name];
    if (typeof v === 'string') return v;
  }

  // Deno
  if (g.Deno?.env?.get) {
    return g.Deno.env.get(name);
  }

  return undefined;
}
