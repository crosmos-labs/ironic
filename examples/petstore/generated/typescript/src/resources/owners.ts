import { APIResource } from '../core/api-client.js';

export class Owners extends APIResource {

  /**
   * Get an owner
   */

  async getOwner(ownerId: string): Promise<{
    email: string;
    id: string;
    name: string;
    pets?: string[];
  }> {
    return this._client.get(`/owners/${ownerId}`);
    }

  /**
   * List all owners
   */

  async listOwners(query?: { limit?: number }): Promise<{
    data: {
    email: string;
    id: string;
    name: string;
    pets?: string[];
  }[];
    total: number;
  }> {
    return this._client.get('/owners', { query });
    }
}
