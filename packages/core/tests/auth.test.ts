import { describe, it, expect } from 'vitest';
import { planAuth } from '../src/planner/auth.js';
import type { IronicConfig, ParsedSpec } from '../src/index.js';

describe('authentication planning', () => {
  const config = { targets: { python: { package_name: 'acme-sdk' } } } as IronicConfig;
  const spec = {
    raw: { security: [{ Basic: [] }] },
    securitySchemes: {
      Unused: { type: 'http', scheme: 'bearer' },
      Basic: { type: 'http', scheme: 'basic' },
    },
  } as unknown as ParsedSpec;

  it('uses the required spec scheme rather than the first definition', () => {
    expect(planAuth(config, spec)).toMatchObject({
      type: 'basic', usernameEnv: 'ACME_USERNAME', passwordEnv: 'ACME_PASSWORD',
    });
  });

  it('respects explicit anonymous security in config and spec', () => {
    expect(planAuth({ ...config, security: [] }, spec).type).toBe('none');
    expect(planAuth(config, { ...spec, raw: { ...spec.raw, security: [] } }).type).toBe('none');
  });

  it.each(['header', 'query', 'cookie'] as const)('preserves API-key %s placement', (location) => {
    const auth = planAuth({ ...config, security: [{ Key: [] }], security_schemes: {
      Key: { type: 'apiKey', name: 'custom_key', in: location },
    } }, spec);
    expect(auth).toMatchObject({ type: 'api_key', name: 'custom_key', in: location });
  });
});
