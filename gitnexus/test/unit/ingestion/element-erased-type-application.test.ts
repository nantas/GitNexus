/**
 * Coverage for `elementErasedTypeApplication` — the element-argument twin of
 * `erasedTypeApplication`. A provider that flattens a single-argument
 * collection binding to its ELEMENT (`List<User>` → rawName `User`) leaves the
 * written spelling in `declaredSpelling`; this function recognizes exactly
 * that shape and rebuilds the container application the receiver gate can
 * ground. Everything else must decline so callers keep their existing
 * behavior.
 */
import { describe, it, expect } from 'vitest';
import type { TypeRef } from 'gitnexus-shared';
import {
  elementErasedTypeApplication,
  erasedTypeApplication,
} from '../../../src/core/ingestion/utils/template-arguments.js';

const SCOPE = 1 as TypeRef['declaredAtScope'];

function ref(rawName: string, declaredSpelling: string | undefined): TypeRef {
  return declaredSpelling === undefined
    ? { rawName, declaredAtScope: SCOPE, source: 'parameter-annotation' }
    : { rawName, declaredSpelling, declaredAtScope: SCOPE, source: 'parameter-annotation' };
}

describe('elementErasedTypeApplication — element-flattened container spellings', () => {
  it('rebuilds a plain single-arg container spelling', () => {
    expect(elementErasedTypeApplication(ref('User', 'List<User>'))).toBe('List<User>');
    expect(elementErasedTypeApplication(ref('User', 'HashSet<User>'))).toBe('HashSet<User>');
  });

  it('rebuilds a qualified container spelling with the reduced element', () => {
    expect(elementErasedTypeApplication(ref('User', 'System.Collections.Generic.List<User>'))).toBe(
      'System.Collections.Generic.List<User>',
    );
  });

  it('accepts a qualified element the capture layer stripped (`List<Ns.User>`)', () => {
    expect(elementErasedTypeApplication(ref('User', 'List<Ns.User>'))).toBe('List<User>');
  });

  it('declines when the sole argument is not the reduced name', () => {
    expect(elementErasedTypeApplication(ref('User', 'Task<Func<User, int>>'))).toBeUndefined();
    expect(elementErasedTypeApplication(ref('User', 'List<List<User>>'))).toBeUndefined();
  });

  it('declines a two-argument container (element semantics ambiguous)', () => {
    expect(
      elementErasedTypeApplication(ref('User', 'Dictionary<string, User>')),
    ).toBeUndefined();
  });

  it('declines bracket punctuation, empty lists, and array suffixes', () => {
    expect(elementErasedTypeApplication(ref('User', 'List[User]'))).toBeUndefined();
    expect(elementErasedTypeApplication(ref('User', 'User[]'))).toBeUndefined();
    expect(elementErasedTypeApplication(ref('User', 'List<>'))).toBeUndefined();
  });

  it('declines trailing decoration the provider did not normalize', () => {
    expect(elementErasedTypeApplication(ref('User', 'List<User>?'))).toBeUndefined();
  });

  it('declines absent spellings', () => {
    expect(elementErasedTypeApplication(ref('User', undefined))).toBeUndefined();
  });

  it('never answers the base-name shape owned by erasedTypeApplication', () => {
    // `vector<Item>` with rawName `vector` is the C++-style reduction the
    // original function owns; the twin must not double-claim it.
    const cxx = ref('vector', 'vector<Item>');
    expect(elementErasedTypeApplication(cxx)).toBeUndefined();
    expect(erasedTypeApplication(cxx)).toBe('vector<Item>');
  });
});
