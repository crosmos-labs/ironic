/**
 * Request body for creating a pet.
 */

export interface CreatePetRequest {
  age?: number;
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'fish';
  tags?: string[];
}

/**
 * A pet owner.
 */

export interface Owner {
  email: string;
  id: string;
  name: string;
  /** List of pet IDs */
  pets?: string[];
}

/**
 * A pet in the store.
 */

export interface Pet {
  /** Age in years */
  age?: number;
  created_at: string;
  /** Unique identifier */
  id: string;
  /** The pet's name */
  name: string;
  /** Owner's ID (if adopted) */
  owner_id?: string | null;
  /** The species of the pet */
  species: 'dog' | 'cat' | 'bird' | 'fish';
  /** Current adoption status */
  status: 'available' | 'pending' | 'sold';
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Request body for updating a pet.
 */

export interface UpdatePetRequest {
  age?: number;
  name?: string;
  status?: 'available' | 'pending' | 'sold';
  tags?: string[];
}
