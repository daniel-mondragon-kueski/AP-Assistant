// Tests for the validation boundaries: Gemini output, HTTP request bodies,
// API responses and localStorage rehydration.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeEmailsRequestSchema,
  analyzeEmailsResponseSchema,
  auditChatRequestSchema,
  generateDraftRequestSchema,
  healthResponseSchema,
} from '../schemas/api';
import { validateGeminiOrders, parseStoredOrders } from '../schemas/orders';
import {
  parseStoredTemplates,
  storedCriteriaSchema,
  stripUndefined,
} from '../schemas/storage';

describe('validateGeminiOrders', () => {
  it('keeps a well-formed order and normalizes its fields', () => {
    const { orders, skipped, warnings } = validateGeminiOrders([
      {
        orderNumber: 'OC00015462',
        supplierName: 'RTB House',
        amount: '$2.689,95',
        currency: 'usd',
        urgencyLevel: 'ADVANCE',
        paymentDueDate: '2026-09-23',
        templateMatchScore: 150,
      },
    ]);
    assert.equal(skipped.length, 0);
    assert.equal(warnings.length, 0);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].amount, 2689.95);
    assert.equal(orders[0].currency, 'USD');
    assert.equal(orders[0].urgencyLevel, 'advance');
    assert.equal(orders[0].templateMatchScore, 100);
  });

  it('skips entries that are not identifiable', () => {
    const { orders, skipped } = validateGeminiOrders([
      { riskNotes: 'sin orden ni proveedor' },
      'no soy un objeto',
      null,
    ]);
    assert.equal(orders.length, 0);
    assert.equal(skipped.length, 3);
    assert.match(skipped[0].reason, /no es identificable/);
  });

  it('accepts an order identified by supplier alone', () => {
    const { orders, skipped } = validateGeminiOrders([{ supplierName: 'Oracle' }]);
    assert.equal(skipped.length, 0);
    assert.equal(orders.length, 1);
  });

  it('warns when an amount was present but unreadable, without dropping the order', () => {
    const { orders, warnings } = validateGeminiOrders([
      { orderNumber: 'OC-9', amount: 'pendiente' },
    ]);
    assert.equal(orders.length, 1, 'the order must survive');
    assert.equal(orders[0].amount, null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].reason, /Monto ilegible/);
    assert.equal(warnings[0].index, 0);
  });

  it('does not warn when no amount was sent at all', () => {
    const { warnings } = validateGeminiOrders([{ orderNumber: 'OC-9' }]);
    assert.equal(warnings.length, 0);
  });

  it('drops a hallucinated calendar date', () => {
    const { orders } = validateGeminiOrders([
      { orderNumber: 'OC-1', paymentDueDate: '2026-02-31' },
    ]);
    assert.equal(orders[0].paymentDueDate, undefined);
  });

  it('returns empty results for a non-array payload', () => {
    const result = validateGeminiOrders({ orders: 'nope' });
    assert.deepEqual(result, { orders: [], skipped: [], warnings: [] });
  });
});

describe('analyzeEmailsRequestSchema', () => {
  it('drops malformed messages instead of failing the batch', () => {
    const parsed = analyzeEmailsRequestSchema.parse({
      emails: [{ id: '1', subject: 'a', sender: 'b', date: 'c', snippet: 'd', body: 'e' }, 42],
    });
    assert.equal(parsed.emails.length, 1);
    assert.equal(parsed.emails[0].id, '1');
  });

  it('defaults an absent body to empty collections', () => {
    const parsed = analyzeEmailsRequestSchema.parse({});
    assert.deepEqual(parsed.emails, []);
    assert.deepEqual(parsed.templates, []);
  });

  it('rejects a batch beyond the sanity cap', () => {
    const emails = Array.from({ length: 201 }, (_, i) => ({ id: String(i) }));
    assert.equal(analyzeEmailsRequestSchema.safeParse({ emails }).success, false);
  });

  it('coerces filter options', () => {
    const parsed = analyzeEmailsRequestSchema.parse({
      emails: [],
      filterOptions: { minTemplateScore: '900', secondaryFilter: {} },
    });
    assert.equal(parsed.filterOptions?.minTemplateScore, 100);
    // A missing flag must not silently widen the filter.
    assert.equal(parsed.filterOptions?.secondaryFilter?.enabled, false);
  });
});

describe('auditChatRequestSchema', () => {
  it('keeps only messages that carry content', () => {
    const parsed = auditChatRequestSchema.parse({
      messages: [{ role: 'user', content: 'hola' }, { role: 'user', content: '' }, null],
    });
    assert.equal(parsed.messages.length, 1);
  });

  it('degrades a malformed audit result to null rather than failing', () => {
    const parsed = auditChatRequestSchema.parse({ analysisResult: 'basura' });
    assert.equal(parsed.analysisResult, null);
  });

  it('keeps the audit fields the prompt reads', () => {
    const parsed = auditChatRequestSchema.parse({
      analysisResult: {
        fileName: 'Propuesta.xlsx',
        totals: { sofom: 1, inc: 2, tech: 3, overall: 6 },
        sheets: { SOFOM: { displayName: 'KUESKI SOFOM', total: 1, items: [{}, {}] } },
        criticalMissing: [{ radarItem: { orderNumber: 'OC-1' }, isUrgent: true, reason: 'falta' }],
      },
    });
    assert.equal(parsed.analysisResult?.fileName, 'Propuesta.xlsx');
    assert.equal(parsed.analysisResult?.sheets?.SOFOM.items.length, 2);
    assert.equal(parsed.analysisResult?.criticalMissing[0].radarItem?.orderNumber, 'OC-1');
  });
});

describe('generateDraftRequestSchema', () => {
  it('parses a formatted amount and leaves unusable ones null', () => {
    assert.equal(generateDraftRequestSchema.parse({ amount: '$1.500,50' }).amount, 1500.5);
    assert.equal(generateDraftRequestSchema.parse({}).amount, null);
  });
});

describe('response schemas', () => {
  it('accepts a valid health payload and rejects a broken one', () => {
    assert.equal(
      healthResponseSchema.safeParse({ status: 'ok', geminiConfigured: false, model: 'gemini-2.5-flash' })
        .success,
      true
    );
    assert.equal(healthResponseSchema.safeParse({ status: 'ok', geminiConfigured: false }).success, false);
  });

  it('tolerates a single bad order in an analyze response', () => {
    const parsed = analyzeEmailsResponseSchema.parse({
      orders: [{ orderNumber: 'OC-1' }, { riskNotes: 'sin identidad' }],
      skipped: [{ index: 9, reason: 'x' }, 'basura'],
    });
    assert.equal(parsed.orders.length, 1);
    assert.equal(parsed.skipped.length, 1);
    assert.deepEqual(parsed.warnings, []);
  });
});

describe('parseStoredOrders', () => {
  it('keeps a minimal valid record and fills defaults', () => {
    const result = parseStoredOrders([{ id: 'a', orderNumber: 'OC-1' }]);
    assert.equal(result?.discarded, 0);
    assert.equal(result?.orders.length, 1);
    assert.equal(result?.orders[0].currency, 'MXN');
    assert.equal(result?.orders[0].status, 'pending');
    assert.equal(result?.orders[0].amount, null);
  });

  it('discards records missing the keys the UI depends on', () => {
    const result = parseStoredOrders([{ orderNumber: 'sin id' }, { id: '', orderNumber: 'x' }]);
    assert.equal(result?.orders.length, 0);
    assert.equal(result?.discarded, 2);
  });

  it('keeps the good records alongside the bad ones', () => {
    const result = parseStoredOrders([{ id: 'a', orderNumber: 'OC-1' }, { nope: true }]);
    assert.equal(result?.orders.length, 1);
    assert.equal(result?.discarded, 1);
  });

  it('returns null when the payload is not an array', () => {
    assert.equal(parseStoredOrders('nope'), null);
    assert.equal(parseStoredOrders({ orders: [] }), null);
  });
});

describe('parseStoredTemplates', () => {
  const valid = {
    id: 't1',
    type: 'urgent',
    name: 'Pago urgente',
    description: 'd',
    subjectTemplate: 's',
    bodyTemplate: 'b',
  };

  it('keeps valid templates', () => {
    assert.equal(parseStoredTemplates([valid])?.length, 1);
  });

  it('returns null when nothing usable survives, so defaults apply', () => {
    assert.equal(parseStoredTemplates([{ id: 'x', type: 'otro' }]), null);
    assert.equal(parseStoredTemplates([]), null);
    assert.equal(parseStoredTemplates('nope'), null);
  });
});

describe('storedCriteriaSchema with stripUndefined', () => {
  it('does not clobber defaults with absent stored fields', () => {
    const defaults = {
      searchQuery: 'default query',
      templateTolerance: 'flexible' as const,
      filterMode: 'broad' as const,
      daysLookback: 7,
      includeSpamTrash: false,
    };
    const stored = storedCriteriaSchema.parse({ searchQuery: 'stored query' });
    const merged = { ...defaults, ...stripUndefined(stored) };

    assert.equal(merged.searchQuery, 'stored query', 'stored value wins');
    // This is the regression the helper exists for: without it, the schema's
    // materialized undefined would wipe these defaults.
    assert.equal(merged.templateTolerance, 'flexible');
    assert.equal(merged.filterMode, 'broad');
  });

  it('clamps and coerces stored numbers', () => {
    const parsed = storedCriteriaSchema.parse({ minTemplateScore: 500, daysLookback: -3 });
    assert.equal(parsed.minTemplateScore, 100);
    assert.equal(parsed.daysLookback, 7);
  });

  it('ignores invalid enum values', () => {
    const parsed = storedCriteriaSchema.parse({ filterMode: 'inventado' });
    assert.equal(parsed.filterMode, undefined);
  });
});
