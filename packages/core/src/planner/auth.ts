// ─── Auth Planner ────────────────────────────────────────────────────────────
// Determine authentication model from the Stainless-shaped config + spec.
//
// In Stainless, auth is described by three coordinated blocks:
//   security:           [{HTTPBearer: []}]                  ← which schemes are required
//   security_schemes:   HTTPBearer: {type: http, scheme: bearer}  ← scheme definitions (or spec)
//   client_settings.opts.api_key.{auth.security_scheme, read_env}  ← the credential opt
//
// We walk these three to reconstruct the AuthModel. If they're absent we fall
// back to inferring from spec.securitySchemes.

import type { IronicConfig } from '../parser/config.schema.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { AuthModel } from '../ir/types.js';
import { upperSnakeCase } from '../utils/naming.js';

export function planAuth(config: IronicConfig, spec: ParsedSpec): AuthModel {
  const packageName = config.targets.typescript?.package_name ?? 'my-sdk';
  const baseName = packageName.replace(/^@[^/]+\//, '').replace(/-sdk$/, '');
  const defaultEnvVar = `${upperSnakeCase(baseName)}_API_KEY`;

  // 1. Identify the active security scheme name.
  //    security is `[{SchemeName: []}, ...]`; we use the first key of the first entry.
  let activeSchemeName: string | undefined;
  if (config.security && config.security.length > 0) {
    activeSchemeName = Object.keys(config.security[0] ?? {})[0];
  }

  // 2. Resolve the scheme definition: config.security_schemes wins, then spec.securitySchemes.
  let schemeDef: Record<string, unknown> | undefined;
  if (activeSchemeName) {
    schemeDef =
      (config.security_schemes?.[activeSchemeName] as Record<string, unknown> | undefined) ??
      (spec.securitySchemes[activeSchemeName] as Record<string, unknown> | undefined);
  }
  if (!schemeDef) {
    // Fall back to the first scheme in the spec
    const first = Object.entries(spec.securitySchemes)[0];
    if (first) {
      activeSchemeName = first[0];
      schemeDef = first[1] as Record<string, unknown>;
    }
  }

  if (!schemeDef) return { type: 'none', envVar: '' };

  // 3. Find the opt that supplies this scheme's credential. Two roles map to env vars:
  //    - default `value` (for bearer / api-key)
  //    - `username` / `password` (for basic)
  const opts = config.client_settings?.opts ?? {};
  let valueEnv: string | undefined;
  let usernameEnv: string | undefined;
  let passwordEnv: string | undefined;
  for (const opt of Object.values(opts)) {
    if (!opt?.auth || opt.auth.security_scheme !== activeSchemeName) continue;
    const role = opt.auth.role ?? 'value';
    if (role === 'username') usernameEnv = opt.read_env;
    else if (role === 'password') passwordEnv = opt.read_env;
    else valueEnv = opt.read_env;
  }

  const type = schemeDef.type as string | undefined;
  const scheme = schemeDef.scheme as string | undefined;

  if (type === 'http' && scheme === 'bearer') {
    return { type: 'bearer', envVar: valueEnv ?? defaultEnvVar };
  }
  if (type === 'http' && scheme === 'basic') {
    return {
      type: 'basic',
      envVar: valueEnv ?? defaultEnvVar,
      usernameEnv: usernameEnv ?? `${upperSnakeCase(baseName)}_USERNAME`,
      passwordEnv: passwordEnv ?? `${upperSnakeCase(baseName)}_PASSWORD`,
    };
  }
  if (type === 'apiKey') {
    return {
      type: 'api_key',
      envVar: valueEnv ?? defaultEnvVar,
      headerName: schemeDef.name as string | undefined,
    };
  }

  return { type: 'none', envVar: '' };
}
