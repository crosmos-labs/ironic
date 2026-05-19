import { describe, it, expect } from 'vitest';
import {
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  upperSnakeCase,
  safeIdentifier,
  singularize,
  pluralize,
} from '../src/utils/naming.js';

describe('camelCase', () => {
  it('converts snake_case', () => {
    expect(camelCase('foo_bar')).toBe('fooBar');
    expect(camelCase('hello_world_test')).toBe('helloWorldTest');
  });

  it('converts kebab-case', () => {
    expect(camelCase('foo-bar')).toBe('fooBar');
  });

  it('converts PascalCase', () => {
    expect(camelCase('FooBar')).toBe('fooBar');
  });

  it('handles already camelCase', () => {
    expect(camelCase('fooBar')).toBe('fooBar');
  });

  it('handles single word', () => {
    expect(camelCase('hello')).toBe('hello');
  });

  it('handles acronyms', () => {
    expect(camelCase('XMLParser')).toBe('xmlParser');
    expect(camelCase('getHTTPSUrl')).toBe('getHttpsUrl');
  });
});

describe('pascalCase', () => {
  it('converts snake_case', () => {
    expect(pascalCase('foo_bar')).toBe('FooBar');
  });

  it('converts kebab-case', () => {
    expect(pascalCase('foo-bar')).toBe('FooBar');
  });

  it('converts camelCase', () => {
    expect(pascalCase('fooBar')).toBe('FooBar');
  });

  it('handles single word', () => {
    expect(pascalCase('hello')).toBe('Hello');
  });
});

describe('snakeCase', () => {
  it('converts camelCase', () => {
    expect(snakeCase('fooBar')).toBe('foo_bar');
  });

  it('converts PascalCase', () => {
    expect(snakeCase('FooBar')).toBe('foo_bar');
  });

  it('converts kebab-case', () => {
    expect(snakeCase('foo-bar')).toBe('foo_bar');
  });
});

describe('kebabCase', () => {
  it('converts camelCase', () => {
    expect(kebabCase('fooBar')).toBe('foo-bar');
  });

  it('converts snake_case', () => {
    expect(kebabCase('foo_bar')).toBe('foo-bar');
  });
});

describe('upperSnakeCase', () => {
  it('converts camelCase', () => {
    expect(upperSnakeCase('fooBar')).toBe('FOO_BAR');
  });

  it('converts kebab-case', () => {
    expect(upperSnakeCase('petstore-api')).toBe('PETSTORE_API');
  });
});

describe('safeIdentifier', () => {
  it('strips invalid chars', () => {
    expect(safeIdentifier('foo.bar')).toBe('foo_bar');
    expect(safeIdentifier('foo-bar')).toBe('foo_bar');
  });

  it('prefixes leading digits', () => {
    expect(safeIdentifier('123abc')).toBe('_123abc');
  });

  it('preserves valid identifiers', () => {
    expect(safeIdentifier('fooBar')).toBe('fooBar');
    expect(safeIdentifier('_private')).toBe('_private');
    expect(safeIdentifier('$scope')).toBe('$scope');
  });
});

describe('singularize', () => {
  it('handles -ies plurals', () => {
    expect(singularize('companies')).toBe('company');
  });

  it('handles -es plurals', () => {
    expect(singularize('boxes')).toBe('box');
  });

  it('handles regular -s plurals', () => {
    expect(singularize('pets')).toBe('pet');
    expect(singularize('files')).toBe('file');
  });

  it('does not strip -ss', () => {
    expect(singularize('class')).toBe('class');
  });
});

describe('pluralize', () => {
  it('handles -y words', () => {
    expect(pluralize('company')).toBe('companies');
  });

  it('handles -s/-x/-z words', () => {
    expect(pluralize('box')).toBe('boxes');
  });

  it('handles regular words', () => {
    expect(pluralize('pet')).toBe('pets');
  });
});
