// File generated from your OpenAPI spec by Ironic. See https://ironic.dev for details.

import { BaseClient } from './core/api-client.js';
import type { ClientOptions } from './core/types.js';
import { readEnv } from './core/env.js';
import { Owners } from './resources/owners.js';
import { Pets } from './resources/pets.js';

export interface PetstoreClientOptions extends ClientOptions {
  /** API key. Defaults to the PETSTORE_API_KEY environment variable. */
  apiKey?: string;
}

/**
 * A sample Pet Store API for testing Ironic SDK generation.
 */
export class PetstoreClient extends BaseClient {
  owners: Owners;
  pets: Pets;

  constructor(options: PetstoreClientOptions = {}) {
    const opts = options as PetstoreClientOptions & { environment?: string };
    super({
      baseURL: options.baseURL ?? 'https://api.petstore.io/v1',
      apiKey: options.apiKey ?? readEnv('PETSTORE_API_KEY') ?? '',
      maxRetries: options.maxRetries ?? 2,
      timeout: options.timeout ?? 30000,
      ...options,
    });
    this.owners = new Owners(this);
    this.pets = new Pets(this);
  }
}
