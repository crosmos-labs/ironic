import { APIResource } from '../core/api-client.js';
import type { Owner } from '../types/index.js';

export class Owners extends APIResource {

  /**
   * Get an owner
   */

  async getOwner(ownerId: string): Promise<Owner> {
    return this._client.get(`/owners/${ownerId}`);
    }

  /**
   * List all owners
   */

  async listOwners(query?: { limit?: number }): Promise<{
    data: Owner[];
    total: number;
  }> {
    return this._client.get('/owners', { query });
    }
}
