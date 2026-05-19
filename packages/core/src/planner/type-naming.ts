// ─── Type Naming Heuristic ───────────────────────────────────────────────────
// Stainless-style renames applied to component-schema names *before* they
// reach the type collector. The result is a Map<originalName, renamedName>.
//
// Rules (in order — first match wins):
//   1. Verb-prefixed request bodies:
//        Create{Foo}Request   → {Foo}CreateParams
//        Update{Foo}Request   → {Foo}UpdateParams
//        Delete{Foo}Request   → {Foo}DeleteParams
//        List{Foo}Request     → {Foo}ListParams
//        Ingest{Foo}Request   → {Foo}IngestParams
//   2. Generic *Request                  → *Params
//   3. *Response (incl. *ListResponse)   → strip suffix (SpaceResponse → Space, SpaceListResponse → SpaceList)
//
// Collisions are detected: if a rename would create a duplicate name, we
// keep the original to avoid losing types silently.

import { pascalCase } from '../utils/naming.js';

const VERBS = ['Create', 'Update', 'Delete', 'List', 'Ingest', 'Search', 'Get', 'Retrieve'];

/**
 * Build a rename map for component schema names. The map is sparse — only
 * contains entries where the renamed name is *different* from the original.
 *
 * User overrides from `config.types.rename` always win.
 */
export function buildSchemaRenames(
  schemaNames: string[],
  userRenames: Record<string, string> = {},
  /** Additional names off-limits (e.g. resource class names). */
  reserved: readonly string[] = [],
): Record<string, string> {
  const renames: Record<string, string> = {};
  // Final names already in use — start from PascalCase originals, override with user renames.
  const taken = new Set<string>(reserved);
  for (const name of schemaNames) {
    taken.add(userRenames[name] ?? pascalCase(name));
  }

  for (const original of schemaNames) {
    if (userRenames[original]) {
      // Honor user override exactly.
      const override = userRenames[original];
      if (override !== pascalCase(original)) renames[original] = override;
      continue;
    }

    const proposed = proposeName(original);
    if (proposed === null) continue;

    // Don't rename if the new name is already taken by another schema (after
    // the user-rename pass). Keeps us deterministic and avoids silent loss.
    if (taken.has(proposed) && proposed !== pascalCase(original)) continue;

    renames[original] = proposed;
    // Reserve the new name and free the old slot.
    taken.add(proposed);
    taken.delete(pascalCase(original));
  }

  return renames;
}

/**
 * Propose a renamed identifier for a schema. Returns null if no rule applies
 * (caller should keep the PascalCase of the original).
 */
function proposeName(original: string): string | null {
  const pascal = pascalCase(original);

  // Rule 1: Verb{Foo}Request → {Foo}VerbParams
  for (const verb of VERBS) {
    if (pascal.startsWith(verb) && pascal.endsWith('Request') && pascal.length > verb.length + 'Request'.length) {
      const middle = pascal.slice(verb.length, -'Request'.length);
      return `${middle}${verb}Params`;
    }
  }

  // Rule 2: generic *Request → *Params
  if (pascal.endsWith('Request') && pascal !== 'Request') {
    return pascal.slice(0, -'Request'.length) + 'Params';
  }

  // Rule 3: *Response → strip suffix
  if (pascal.endsWith('Response') && pascal !== 'Response') {
    return pascal.slice(0, -'Response'.length);
  }

  return null;
}
