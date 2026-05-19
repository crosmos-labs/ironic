import { BaseClient } from './core/api-client.js';
import type { ClientOptions } from './core/types.js';
import { Owners } from './resources/owners.js';
import { Pets } from './resources/pets.js';

export interface SdkClientOptions extends ClientOptions {
  /** API key. Defaults to `process.env['PETSTORE_API_KEY']`. */
  apiKey?: string;
}

/**
 * A sample Pet Store API for testing Ironic SDK generation.
 */
export class SdkClient extends BaseClient {
  owners: Owners;
  pets: Pets;

  constructor(options: SdkClientOptions = {}) {
    const opts = options as SdkClientOptions & { environment?: string };
    super({
      baseURL: options.baseURL ?? 'https://api.petstore.io/v1',
      apiKey: options.apiKey ?? process.env['PETSTORE_API_KEY'] ?? '',
      maxRetries: options.maxRetries ?? 2,
      timeout: options.timeout ?? 30000,
      ...options,
    });
    this.owners = new Owners(this);
    this.pets = new Pets(this);
  }
}
