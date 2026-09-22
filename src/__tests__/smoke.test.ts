// Smoke tests for the pure logic behind the AP radar and the weekly-proposal audit.
// Run with `npm test` (node:test via tsx — no extra dependencies required).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeProposalExcel,
  createDemoWeeklyProposalBuffer,
  formatCurrencyMXN,
} from '../services/excelParser';
import { detectDuplicates, normalizeOrderNumber, getPaymentDueStatus } from '../utils/paymentMatcher';
import { SAMPLE_ORDERS } from '../data/sampleOrders';
import { formatModelLabel } from '../services/api';
import type { PaymentOrder } from '../types';

describe('formatCurrencyMXN', () => {
  it('formats with thousand separators and two decimals', () => {
    assert.equal(formatCurrencyMXN(2178600.5), '2,178,600.50');
    assert.equal(formatCurrencyMXN(0), '0.00');
  });
});

describe('normalizeOrderNumber', () => {
  it('strips separators and uppercases', () => {
    assert.equal(normalizeOrderNumber('oc-2024/8891'), 'OC20248891');
    assert.equal(normalizeOrderNumber('  po 9942 '), 'PO9942');
  });
});

describe('detectDuplicates', () => {
  const base: PaymentOrder = {
    ...SAMPLE_ORDERS[0],
    id: 'a',
    orderNumber: 'OC-1000',
    supplierName: 'Proveedor Demo',
    amount: 1000,
    currency: 'MXN',
    emailId: 'email-a',
  };

  it('flags a repeated order number', () => {
    const { alerts, enrichedOrders } = detectDuplicates([
      base,
      { ...base, id: 'b', orderNumber: 'oc/1000', emailId: 'email-b' },
    ]);
    assert.equal(alerts.length, 1);
    assert.equal(enrichedOrders[1].flaggedDuplicate, true);
    assert.equal(enrichedOrders[1].duplicateOfId, 'a');
  });

  it('flags same supplier + identical amount from a different email', () => {
    const { alerts } = detectDuplicates([
      base,
      { ...base, id: 'c', orderNumber: 'OC-2000', emailId: 'email-c' },
    ]);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].reason, /Monto idéntico/);
  });

  it('does not flag distinct orders', () => {
    const { alerts } = detectDuplicates([
      base,
      { ...base, id: 'd', orderNumber: 'OC-3000', amount: 2000, emailId: 'email-d' },
    ]);
    assert.equal(alerts.length, 0);
  });
});

describe('getPaymentDueStatus', () => {
  it('handles a missing date', () => {
    assert.equal(getPaymentDueStatus('').label, 'Sin fecha definida');
  });

  it('marks today as due today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const status = getPaymentDueStatus(today);
    assert.equal(status.isDueSoon, true);
    assert.equal(status.daysDiff, 0);
  });

  it('marks a past date as overdue', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    assert.equal(getPaymentDueStatus(past).isOverdue, true);
  });
});

describe('analyzeProposalExcel over the demo workbook', () => {
  const { buffer, fileName } = createDemoWeeklyProposalBuffer();
  const result = analyzeProposalExcel(buffer, fileName, SAMPLE_ORDERS);

  it('reads the SOFOM, INC and TECH sheets', () => {
    for (const key of ['SOFOM', 'INC', 'TECH']) {
      assert.ok(result.sheets[key], `missing sheet: ${key}`);
      assert.ok(result.sheets[key].items.length > 0, `empty sheet: ${key}`);
    }
  });

  it('totals per entity add up to the overall total', () => {
    const { sofom, inc, tech, overall } = result.totals;
    assert.ok(overall > 0);
    assert.ok(Math.abs(sofom + inc + tech - overall) < 0.01);
  });

  it('cross-checks the Gmail radar and reports critical missing orders', () => {
    assert.ok(result.matches.length > 0, 'expected at least one radar match');
    assert.ok(result.criticalMissing.length > 0, 'expected critical missing alerts');
    for (const missing of result.criticalMissing) {
      assert.ok(missing.radarItem.orderNumber);
      assert.ok(missing.reason);
    }
  });

  it('builds the approval email with the computed totals', () => {
    assert.ok(result.formattedApprovalEmail.includes('KUESKI SOFOM'));
    assert.ok(result.formattedApprovalEmail.includes(formatCurrencyMXN(result.totals.sofom)));
  });
});

describe('formatModelLabel', () => {
  it('turns a model id into a readable label', () => {
    assert.equal(formatModelLabel('gemini-2.5-flash'), 'Gemini 2.5 Flash');
  });
});
