import { describe, it, expect } from 'vitest';
import { plan } from '../src/index.js';
import type { IronicConfig, ParsedSpec } from '../src/index.js';

function makeConfig(overrides: Partial<IronicConfig> = {}): IronicConfig {
  return {
    version: 1,
    targets: { typescript: { package_name: 'multi-sdk', output_dir: './out' } },
    ...overrides,
  } as IronicConfig;
}

function makeSpec(): ParsedSpec {
  return {
    info: { title: 'Multi-opt API', version: '0.1.0' },
    servers: [],
    paths: {},
    schemas: {},
    schemaRegistry: new Map(),
    securitySchemes: {},
  };
}

describe('client_settings.opts → IR.meta.clientOpts', () => {
  it('flattens each opt onto meta.clientOpts in declaration order', () => {
    const config = makeConfig({
      client_settings: {
        opts: {
          api_key: {
            type: 'string',
            description: 'API key',
            auth: { security_scheme: 'HTTPBearer' },
            read_env: 'ACME_API_KEY',
          },
          workspace_id: {
            type: 'string',
            description: 'Active workspace',
            read_env: 'ACME_WORKSPACE_ID',
          },
          beta: {
            type: 'boolean',
            default: false,
          },
        },
      },
      security: [{ HTTPBearer: [] }],
      security_schemes: {
        HTTPBearer: { type: 'http', scheme: 'bearer' },
      },
    });

    const ir = plan(config, makeSpec());
    const opts = ir.meta.clientOpts!;
    expect(opts.map((o) => o.configName)).toEqual(['api_key', 'workspace_id', 'beta']);
    expect(opts.map((o) => o.tsName)).toEqual(['apiKey', 'workspaceId', 'beta']);

    expect(opts[0]!.auth?.securityScheme).toBe('HTTPBearer');
    expect(opts[0]!.readEnv).toBe('ACME_API_KEY');

    expect(opts[1]!.auth).toBeUndefined();
    expect(opts[1]!.readEnv).toBe('ACME_WORKSPACE_ID');

    expect(opts[2]!.type).toBe('boolean');
    expect(opts[2]!.default).toBe(false);
  });

  it('still infers bearer auth from the bound opt', () => {
    const config = makeConfig({
      client_settings: {
        opts: {
          api_key: {
            type: 'string',
            auth: { security_scheme: 'HTTPBearer' },
            read_env: 'MULTI_API_KEY',
          },
        },
      },
      security: [{ HTTPBearer: [] }],
      security_schemes: {
        HTTPBearer: { type: 'http', scheme: 'bearer' },
      },
    });

    const ir = plan(config, makeSpec());
    expect(ir.auth.type).toBe('bearer');
    expect(ir.auth.envVar).toBe('MULTI_API_KEY');
  });
});
