// Schemas for localStorage rehydration.
//
// Stored state is external data: it was written by an older build of this app,
// can be hand-edited, and can be corrupt. The app already fell back to
// defaults on a JSON syntax error, but not on well-formed JSON of the wrong
// shape — which is the case that actually reaches React and breaks a render.
import { z } from 'zod';

import { looseBoolean, looseBooleanDefault, looseString, optionalString } from './primitives';
import { secondaryFilterSchema } from './api';

export const storedCriteriaSchema = z.object({
  searchQuery: looseString(),
  daysLookback: z.unknown().optional().transform((value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  }),
  dateFilterMode: z.unknown().optional().transform((value) =>
    value === 'specific_date' || value === 'lookback_days' ? value : undefined
  ),
  startDate: optionalString,
  endDate: optionalString,
  includeSpamTrash: looseBooleanDefault(false),
  minAmount: z.unknown().optional().transform((value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }),
  supplierFilter: optionalString,
  subjectKeywords: z.unknown().optional().transform((value) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
  ),
  senderFilter: optionalString,
  hasAttachment: looseBoolean(),
  excludeKeywords: z.unknown().optional().transform((value) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
  ),
  urgentDaysThreshold: z.unknown().optional().transform((value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }),
  onlyInbox: looseBoolean(),
  filterMode: z.unknown().optional().transform((value) =>
    value === 'strict_templates' || value === 'hybrid' || value === 'broad' ? value : undefined
  ),
  templateTolerance: z.unknown().optional().transform((value) =>
    value === 'flexible' || value === 'balanced' || value === 'strict' ? value : undefined
  ),
  minTemplateScore: z.unknown().optional().transform((value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : undefined;
  }),
  secondaryFilter: secondaryFilterSchema.optional(),
});

export const storedTemplateSchema = z.object({
  id: z.string().min(1),
  type: z.union([z.literal('urgent'), z.literal('advance')]),
  name: looseString(),
  description: looseString(),
  subjectTemplate: looseString(),
  bodyTemplate: looseString(),
});

export type StoredTemplate = z.infer<typeof storedTemplateSchema>;

/**
 * Drops keys whose value is undefined.
 *
 * The schemas above materialize every field, including the ones absent from
 * storage. Spreading that over a defaults object would overwrite real
 * defaults with undefined, so callers merging onto defaults strip first —
 * restoring the "only the keys actually stored" semantics of a raw spread.
 */
export function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

/**
 * Reads and validates a JSON value from localStorage.
 *
 * Returns null on a missing key, unreadable storage, invalid JSON or a shape
 * the schema rejects — the caller then uses its own default. Storage access
 * itself is wrapped because it throws in private-browsing modes.
 */
export function readValidated<T>(key: string, schema: z.ZodType<T>): T | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Validates a stored template list, keeping the usable entries. Returns null
 * when nothing usable survives, so the caller falls back to DEFAULT_TEMPLATES
 * instead of rendering an empty template picker.
 */
export function parseStoredTemplates(input: unknown): StoredTemplate[] | null {
  if (!Array.isArray(input)) return null;

  const templates = input.flatMap((raw) => {
    const result = storedTemplateSchema.safeParse(raw);
    return result.success ? [result.data] : [];
  });

  return templates.length ? templates : null;
}
