import { describe, it, expect } from 'vitest';
import {
  stripVersionPrefix,
  splitPathSegments,
  isPathParam,
  extractParamName,
  getResourceSegments,
  getGroupKey,
  inferMethodName,
  stripPrefix,
  findCommonPathPrefix,
} from '../src/utils/paths.js';

describe('stripVersionPrefix', () => {
  it('strips /v1', () => {
    expect(stripVersionPrefix('/v1/chat/completions')).toBe('/chat/completions');
  });

  it('strips /v2', () => {
    expect(stripVersionPrefix('/v2/files')).toBe('/files');
  });

  it('leaves paths without version', () => {
    expect(stripVersionPrefix('/chat/completions')).toBe('/chat/completions');
  });
});

describe('splitPathSegments', () => {
  it('splits a basic path', () => {
    expect(splitPathSegments('/v1/chat/completions')).toEqual(['v1', 'chat', 'completions']);
  });

  it('handles path params', () => {
    expect(splitPathSegments('/files/{file_id}')).toEqual(['files', '{file_id}']);
  });
});

describe('isPathParam', () => {
  it('detects params', () => {
    expect(isPathParam('{file_id}')).toBe(true);
  });

  it('rejects non-params', () => {
    expect(isPathParam('files')).toBe(false);
  });
});

describe('extractParamName', () => {
  it('extracts the name', () => {
    expect(extractParamName('{file_id}')).toBe('file_id');
  });
});

describe('getResourceSegments', () => {
  it('gets non-param, non-version segments', () => {
    expect(getResourceSegments('/v1/files/{file_id}/content')).toEqual(['files', 'content']);
  });

  it('handles simple paths', () => {
    expect(getResourceSegments('/pets')).toEqual(['pets']);
  });
});

describe('getGroupKey', () => {
  it('gets the first resource segment', () => {
    expect(getGroupKey('/v1/files/{id}')).toBe('files');
    expect(getGroupKey('/v1/chat/completions')).toBe('chat');
  });
});

describe('inferMethodName', () => {
  it('infers list for GET /resources', () => {
    expect(inferMethodName('get', '/v1/files')).toBe('list');
  });

  it('infers create for POST /resources', () => {
    expect(inferMethodName('post', '/v1/files')).toBe('create');
  });

  it('infers retrieve for GET /resources/{id}', () => {
    expect(inferMethodName('get', '/v1/files/{file_id}')).toBe('retrieve');
  });

  it('infers update for PATCH /resources/{id}', () => {
    expect(inferMethodName('patch', '/v1/files/{file_id}')).toBe('update');
  });

  it('infers delete for DELETE /resources/{id}', () => {
    expect(inferMethodName('delete', '/v1/files/{file_id}')).toBe('delete');
  });

  it('infers verb for POST /resources/{id}/action', () => {
    expect(inferMethodName('post', '/v1/files/{file_id}/cancel')).toBe('cancel');
  });
});

describe('stripPrefix', () => {
  it('strips a multi-segment prefix', () => {
    expect(stripPrefix('/api/v1/spaces', '/api/v1')).toBe('/spaces');
  });

  it('strips a prefix with trailing slash', () => {
    expect(stripPrefix('/api/v1/spaces', '/api/v1/')).toBe('/spaces');
  });

  it('leaves paths that do not start with the prefix unchanged', () => {
    expect(stripPrefix('/health', '/api/v1')).toBe('/health');
  });

  it('returns "/" when path exactly matches prefix', () => {
    expect(stripPrefix('/api/v1', '/api/v1')).toBe('/');
  });

  it('does not partial-match a segment', () => {
    expect(stripPrefix('/api/v10/spaces', '/api/v1')).toBe('/api/v10/spaces');
  });

  it('returns path unchanged when prefix is empty', () => {
    expect(stripPrefix('/api/v1/x', '')).toBe('/api/v1/x');
  });
});

describe('findCommonPathPrefix', () => {
  it('finds /api/v1 across versioned paths', () => {
    expect(findCommonPathPrefix(['/api/v1/spaces', '/api/v1/orgs', '/api/v1/jobs/{id}'])).toBe('/api/v1');
  });

  it('returns "" when one path has no prefix', () => {
    expect(findCommonPathPrefix(['/api/v1/spaces', '/api/v1/orgs', '/health'])).toBe('');
  });

  it('returns "" when paths share no common segment', () => {
    expect(findCommonPathPrefix(['/spaces', '/orgs'])).toBe('');
  });

  it('returns "" for a single path (nothing to compare)', () => {
    expect(findCommonPathPrefix(['/api/v1/spaces'])).toBe('');
  });

  it('refuses to collapse a path entirely into the prefix', () => {
    // If "/api/v1" itself is an endpoint, we must not strip it away — that
    // would leave no segment to group on.
    expect(findCommonPathPrefix(['/api/v1', '/api/v1/spaces'])).toBe('');
  });

  it('stops at the first param segment', () => {
    expect(findCommonPathPrefix(['/api/{tenant}/spaces', '/api/{tenant}/orgs'])).toBe('/api');
  });
});

describe('inferMethodName with explicit prefix', () => {
  it('strips /api/v1 when given as prefix', () => {
    expect(inferMethodName('post', '/api/v1/spaces/{id}/archive', '/api/v1')).toBe('archive');
  });
});
