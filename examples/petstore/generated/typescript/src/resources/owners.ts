import { APIResource } from '../core/api-client.js';
import type { RequestOptions } from '../core/types.js';
import type { Owner, OwnerListOwnersParams } from '../types/index.js';

export class Owners extends APIResource {

  /**
   * Get an owner
   */

  async getOwner(ownerId: string, options?: RequestOptions): Promise<Owner> {
    return this._client.get(`/owners/${ownerId}`, { ...options });
  }

  /**
   * List all owners
   */

  async listOwners(query?: OwnerListOwnersParams, options?: RequestOptions): Promise<{
    data: Owner[];
    total: number;
  }> {
    return this._client.get('/owners', { ...options, query });
  }
}
