// Tests for the API allowlist. This is the only thing standing between a
// public Cloud Run URL and the tool, so its edge cases are enumerated.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allowListMode, isEmailAllowed, parseAllowList } from '../schemas/access';

describe('parseAllowList', () => {
  it('splits on commas, semicolons and whitespace', () => {
    assert.deepEqual(parseAllowList('a@x.com, b@x.com;c@x.com d@x.com'), [
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ]);
  });

  it('handles newlines and stray separators from a paste', () => {
    assert.deepEqual(parseAllowList('\n a@x.com ,,\n\n b@x.com \n'), ['a@x.com', 'b@x.com']);
  });

  it('lower-cases entries', () => {
    assert.deepEqual(parseAllowList('Daniel.Mondragon@Kueski.com'), ['daniel.mondragon@kueski.com']);
  });

  it('returns an empty list for absent or blank values', () => {
    assert.deepEqual(parseAllowList(undefined), []);
    assert.deepEqual(parseAllowList(''), []);
    assert.deepEqual(parseAllowList('   \n  '), []);
  });
});

describe('isEmailAllowed', () => {
  const rules = parseAllowList('daniel.mondragon@kueski.com, @kueski.com, otra-empresa.com');

  it('matches a full address exactly', () => {
    assert.equal(isEmailAllowed('daniel.mondragon@kueski.com', parseAllowList('daniel.mondragon@kueski.com')), true);
    assert.equal(isEmailAllowed('otro@kueski.com', parseAllowList('daniel.mondragon@kueski.com')), false);
  });

  it('is case-insensitive', () => {
    assert.equal(isEmailAllowed('Daniel.Mondragon@Kueski.COM', rules), true);
  });

  it('matches a domain rule with or without the leading @', () => {
    assert.equal(isEmailAllowed('cualquiera@kueski.com', rules), true);
    assert.equal(isEmailAllowed('alguien@otra-empresa.com', rules), true);
  });

  it('does not match a different domain', () => {
    assert.equal(isEmailAllowed('alguien@gmail.com', rules), false);
  });

  it('does not let a lookalike domain through', () => {
    // The classic bug: a suffix check would accept these.
    assert.equal(isEmailAllowed('atacante@notkueski.com', rules), false);
    assert.equal(isEmailAllowed('atacante@kueski.com.evil.com', rules), false);
    assert.equal(isEmailAllowed('atacante@evil.com?@kueski.com', rules), false);
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', '   ', 'sin-arroba', '@kueski.com', 'doble@@kueski.com', 'a@b@kueski.com', 'trailing@']) {
      assert.equal(isEmailAllowed(bad, rules), false, `aceptó ${JSON.stringify(bad)}`);
    }
  });

  it('rejects everything when the allowlist is empty', () => {
    assert.equal(isEmailAllowed('daniel.mondragon@kueski.com', []), false);
  });

  it('rejects an absent email', () => {
    assert.equal(isEmailAllowed(undefined, rules), false);
  });
});

describe('allowListMode', () => {
  it('enforces when rules are configured', () => {
    assert.equal(allowListMode(['a@x.com'], 'production'), 'enforce');
    assert.equal(allowListMode(['a@x.com'], undefined), 'enforce');
  });

  it('fails closed in production when nothing is configured', () => {
    // A misconfigured deploy must not expose the tool.
    assert.equal(allowListMode([], 'production'), 'deny_all');
  });

  it('stays open outside production so local dev needs no setup', () => {
    assert.equal(allowListMode([], undefined), 'open_dev');
    assert.equal(allowListMode([], 'development'), 'open_dev');
  });
});
