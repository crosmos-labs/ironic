// File generated from your OpenAPI spec by Ironic. See https://ironic.dev for details.

import { APIResource } from '../core/api-client.js';
import type { RequestOptions } from '../core/types.js';
import { APIPromise } from '../core/api-promise.js';
import { path } from '../core/path.js';
import type { Owner, OwnerListOwnersParams } from '../types/index.js';

export class Owners extends APIResource {

  /**
   * Get an owner
   */

  getOwner(ownerId: string, options?: RequestOptions): APIPromise<Owner> {
    return this._client.get(path`/owners/${ownerId}`, { ...options });
  }

  /**
   * List all owners
   */

  listOwners(query?: OwnerListOwnersParams | null, options?: RequestOptions): APIPromise<{
    data: Owner[];
    total: number;
  }> {
    return this._client.get('/owners', { ...options, query });
  }
}

export declare namespace Owners {
  export {
    type Owner as Owner,
    type OwnerListOwnersParams as OwnerListOwnersParams,
  };
}
