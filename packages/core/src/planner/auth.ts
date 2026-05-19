// ─── Auth Planner ────────────────────────────────────────────────────────────
// Determine authentication model from config + spec.

import type { IronicConfig } from '../parser/config.schema.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { AuthModel } from '../ir/types.js';
import { upperSnakeCase } from '../utils/naming.js';

/**
 * Resolve the auth model from config and spec.
 * Config takes precedence; if absent, infer from spec's securitySchemes.
 */
export function planAuth(config: IronicConfig, spec: ParsedSpec): AuthModel {
  // If config explicitly defines auth, use it
  if (config.auth) {
    const packageName = config.targets.typescript?.package_name ?? 'my-sdk';
    const baseName = packageName.replace(/^@[^/]+\//, '').replace(/-sdk$/, '');
    const defaultEnvVar = `${upperSnakeCase(baseName)}_API_KEY`;

    return {
      type: config.auth.type,
      envVar: config.auth.env_var ?? defaultEnvVar,
      headerName: config.auth.header_name,
      usernameEnv: config.auth.username_env,
      passwordEnv: config.auth.password_env,
    };
  }

  // Infer from spec's securitySchemes
  for (const [, scheme] of Object.entries(spec.securitySchemes)) {
    const s = scheme as Record<string, unknown>;
    if (s.type === 'http' && s.scheme === 'bearer') {
      return { type: 'bearer', envVar: 'API_KEY' };
    }
    if (s.type === 'apiKey') {
      return {
        type: 'api_key',
        envVar: 'API_KEY',
        headerName: s.name as string,
      };
    }
    if (s.type === 'http' && s.scheme === 'basic') {
      return {
        type: 'basic',
        envVar: 'API_KEY',
        usernameEnv: 'API_USERNAME',
        passwordEnv: 'API_PASSWORD',
      };
    }
  }

  // No auth
  return { type: 'none', envVar: '' };
}
