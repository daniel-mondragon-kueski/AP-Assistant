// Shared Zod primitives for the boundaries where external data enters the app:
// Gemini responses, HTTP request bodies and localStorage.
import { z } from 'zod';

/**
 * Parses a monetary value that may arrive as a number or as a formatted string.
 *
 * Gemini is instructed to return clean numbers, but models do return strings,
 * and this is a payments tool: a silently dropped or misread amount is the
 * worst failure mode here. Both Latin ("$2.689,95") and US ("$2,689.95")
 * groupings appear in the source emails, so separators are disambiguated
 * instead of assumed.
 *
 * Returns null when the input carries no usable number, so callers can tell
 * "no amount given" apart from "amount was 0".
 */
export function parseMonetaryValue(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input !== 'string') return null;

  let text = input.trim();
  if (!text) return null;

  // Accounting notation for negatives: "(1,234.00)" means -1234.00
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Drop currency symbols, codes, spaces (incl. non-breaking) and stray text.
  text = text.replace(/[^\d.,+-]/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
  }
  text = text.replace(/[+-]/g, '');
  if (!text || !/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators present: the rightmost one is the decimal separator.
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    normalized =
      text.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const parts = text.split(sep);
    const decimals = parts[parts.length - 1];
    // Repeated separator can only be grouping ("1.234.567").
    // A single separator followed by exactly 3 digits is also grouping:
    // currency carries at most 2 decimals, so "2.689" is 2689, not 2.689.
    const isGrouping = parts.length > 2 || decimals.length === 3;
    normalized = isGrouping
      ? parts.join('')
      : `${parts.slice(0, -1).join('')}.${decimals}`;
  } else {
    normalized = text;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Monetary amount, tolerant of the formats above. Negatives pass through
 * on purpose — the proposal auditor reports them as anomalies, so rejecting
 * them here would hide the very rows it is meant to flag.
 */
export const amountSchema = z
  .unknown()
  .optional()
  .transform(parseMonetaryValue);

/** Currency code, normalized to upper case. Defaults to MXN when absent. */
export const currencySchema = z
  .unknown()
  .optional()
  .transform((value) => {
    if (typeof value !== 'string') return 'MXN';
    const code = value.trim().toUpperCase();
    return code || 'MXN';
  });

/** A string field that tolerates absence, nulls and non-string scalars. */
export function looseString(fallback = '') {
  return z.unknown().optional().transform((value) => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return fallback;
  });
}

/** Optional string: empty/absent becomes undefined rather than ''. */
export const optionalString = z.unknown().optional().transform((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
});

/** Array of strings, ignoring non-string entries. */
export const stringArraySchema = z.unknown().optional().transform((value) => {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length ? items : undefined;
});

/** Boolean that tolerates the string forms models and form inputs produce. */
export function looseBoolean() {
  return z.unknown().optional().transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === 'yes' || normalized === 'sí') return true;
      if (normalized === 'false' || normalized === 'no') return false;
    }
    return undefined;
  });
}

/**
 * Boolean with a concrete fallback, for fields typed as required `boolean`.
 * Plain `looseBoolean()` yields undefined when absent, which would clobber a
 * default once spread onto a defaults object.
 */
export function looseBooleanDefault(fallback: boolean) {
  return z.unknown().optional().transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === 'yes' || normalized === 'sí') return true;
      if (normalized === 'false' || normalized === 'no') return false;
    }
    return fallback;
  });
}

/** A score clamped to 0–100, or undefined when unusable. */
export const scoreSchema = z.unknown().optional().transform((value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(100, Math.max(0, parsed));
});

/**
 * Enum that falls back to a default instead of failing the whole object.
 * Used for model-supplied classifications, where an unexpected label should
 * not cost us the surrounding payment order.
 */
export function looseEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number]
) {
  return z.unknown().optional().transform((value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      const match = values.find((candidate) => candidate.toLowerCase() === normalized);
      if (match) return match as T[number];
    }
    return fallback;
  });
}

/** Date in YYYY-MM-DD form, or undefined when it is not a real calendar date. */
export const isoDateSchema = z.unknown().optional().transform((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  // Rejects overflow dates such as 2026-02-31, which Date would roll over.
  return date.toISOString().slice(0, 10) === trimmed ? trimmed : undefined;
});
