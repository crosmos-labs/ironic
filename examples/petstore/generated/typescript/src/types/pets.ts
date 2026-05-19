export interface CreatePetParams {
  age?: number;
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'fish';
  tags?: string[];
}

export interface CreatePetResponse {
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

export interface GetPetResponse {
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

export interface ListPetsResponse {
  data: ({
  age?: number;
  created_at: string;
  id: string;
  name: string;
  owner_id?: string | null;
  species: 'dog' | 'cat' | 'bird' | 'fish';
  status: 'available' | 'pending' | 'sold';
  tags?: string[];
})[];
  has_more: boolean;
}

export interface UpdatePetParams {
  age?: number;
  name?: string;
  status?: 'available' | 'pending' | 'sold';
  tags?: string[];
}

export interface UpdatePetResponse {
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
