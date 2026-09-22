// Tests for the validation primitives. parseMonetaryValue carries the most
// risk in this codebase: a misread separator silently changes a payment amount
// by three orders of magnitude, so its cases are enumerated explicitly.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseMonetaryValue,
  amountSchema,
  currencySchema,
  isoDateSchema,
  looseEnum,
  scoreSchema,
  stringArraySchema,
} from '../schemas/primitives';

describe('parseMonetaryValue', () => {
  it('passes finite numbers through', () => {
    assert.equal(parseMonetaryValue(2689.95), 2689.95);
    assert.equal(parseMonetaryValue(0), 0);
    assert.equal(parseMonetaryValue(-500), -500);
  });

  it('rejects non-finite numbers', () => {
    assert.equal(parseMonetaryValue(NaN), null);
    assert.equal(parseMonetaryValue(Infinity), null);
  });

  it('parses the Latin format from the source emails', () => {
    // These are the exact strings the analyze-emails prompt documents.
    assert.equal(parseMonetaryValue('$2.689,95'), 2689.95);
    assert.equal(parseMonetaryValue('$27.500,00'), 27500);
    assert.equal(parseMonetaryValue('$300.000,00'), 300000);
    assert.equal(parseMonetaryValue('$562.500,00'), 562500);
    assert.equal(parseMonetaryValue('$146.654,52'), 146654.52);
  });

  it('parses the US format', () => {
    assert.equal(parseMonetaryValue('$2,689.95'), 2689.95);
    assert.equal(parseMonetaryValue('27,500.00'), 27500);
    assert.equal(parseMonetaryValue('1,234,567.89'), 1234567.89);
  });

  it('parses plain decimal strings', () => {
    assert.equal(parseMonetaryValue('146654.52'), 146654.52);
    assert.equal(parseMonetaryValue('2689'), 2689);
    assert.equal(parseMonetaryValue('2.5'), 2.5);
    assert.equal(parseMonetaryValue('2,52'), 2.52);
  });

  it('treats a lone separator before three digits as grouping, not decimals', () => {
    // Currency carries at most two decimals, so "2.689" is 2689 pesos.
    assert.equal(parseMonetaryValue('2.689'), 2689);
    assert.equal(parseMonetaryValue('2,689'), 2689);
    assert.equal(parseMonetaryValue('1.234.567'), 1234567);
  });

  it('keeps four-plus digit tails as decimals', () => {
    assert.equal(parseMonetaryValue('2.6895'), 2.6895);
  });

  it('strips currency symbols, codes and spacing', () => {
    assert.equal(parseMonetaryValue('  MXN 410,000.00  '), 410000);
    assert.equal(parseMonetaryValue('USD $1.500,50'), 1500.5);
    assert.equal(parseMonetaryValue('410 000.00'), 410000);
  });

  it('handles negatives, including accounting parentheses', () => {
    assert.equal(parseMonetaryValue('-1,234.00'), -1234);
    assert.equal(parseMonetaryValue('(1,234.00)'), -1234);
    assert.equal(parseMonetaryValue('($1.234,00)'), -1234);
  });

  it('returns null for input with no usable number', () => {
    assert.equal(parseMonetaryValue(''), null);
    assert.equal(parseMonetaryValue('   '), null);
    assert.equal(parseMonetaryValue('pendiente'), null);
    assert.equal(parseMonetaryValue('N/A'), null);
    assert.equal(parseMonetaryValue(null), null);
    assert.equal(parseMonetaryValue(undefined), null);
    assert.equal(parseMonetaryValue({}), null);
    assert.equal(parseMonetaryValue([]), null);
  });

  it('never returns NaN', () => {
    const inputs = ['', '.', ',', '-', '-.', '$', 'abc', '1.2.3,4,5', '..', null, {}, []];
    for (const input of inputs) {
      const result = parseMonetaryValue(input);
      assert.ok(result === null || Number.isFinite(result), `NaN leaked for ${JSON.stringify(input)}`);
    }
  });
});

describe('amountSchema', () => {
  it('yields a number or null, never NaN', () => {
    assert.equal(amountSchema.parse('$1.500,50'), 1500.5);
    assert.equal(amountSchema.parse('sin monto'), null);
    assert.equal(amountSchema.parse(undefined), null);
  });
});

describe('currencySchema', () => {
  it('normalizes to upper case and defaults to MXN', () => {
    assert.equal(currencySchema.parse('usd'), 'USD');
    assert.equal(currencySchema.parse('  mxn '), 'MXN');
    assert.equal(currencySchema.parse(undefined), 'MXN');
    assert.equal(currencySchema.parse(''), 'MXN');
    assert.equal(currencySchema.parse(42), 'MXN');
  });
});

describe('isoDateSchema', () => {
  it('accepts real calendar dates', () => {
    assert.equal(isoDateSchema.parse('2026-09-23'), '2026-09-23');
  });

  it('rejects malformed and overflow dates', () => {
    assert.equal(isoDateSchema.parse('2026-02-31'), undefined);
    assert.equal(isoDateSchema.parse('23/09/2026'), undefined);
    assert.equal(isoDateSchema.parse('hoy'), undefined);
    assert.equal(isoDateSchema.parse(''), undefined);
    assert.equal(isoDateSchema.parse(undefined), undefined);
  });
});

describe('looseEnum', () => {
  const urgency = looseEnum(['urgent', 'advance', 'normal'] as const, 'normal');

  it('matches case-insensitively', () => {
    assert.equal(urgency.parse('URGENT'), 'urgent');
    assert.equal(urgency.parse('advance'), 'advance');
  });

  it('falls back instead of failing on an unknown label', () => {
    assert.equal(urgency.parse('urgentísimo'), 'normal');
    assert.equal(urgency.parse(undefined), 'normal');
  });
});

describe('scoreSchema', () => {
  it('clamps to 0-100', () => {
    assert.equal(scoreSchema.parse(150), 100);
    assert.equal(scoreSchema.parse(-5), 0);
    assert.equal(scoreSchema.parse('88'), 88);
  });

  it('returns undefined when unusable', () => {
    assert.equal(scoreSchema.parse('alto'), undefined);
    assert.equal(scoreSchema.parse(undefined), undefined);
  });
});

describe('stringArraySchema', () => {
  it('keeps only string entries', () => {
    assert.deepEqual(stringArraySchema.parse(['a', 1, null, 'b']), ['a', 'b']);
  });

  it('returns undefined for non-arrays and empty results', () => {
    assert.equal(stringArraySchema.parse('a'), undefined);
    assert.equal(stringArraySchema.parse([1, 2]), undefined);
    assert.equal(stringArraySchema.parse(undefined), undefined);
  });
});
