// Schemas for the HTTP boundary: request bodies the server accepts, and
// response shapes the browser trusts.
import { z } from 'zod';

import {
  amountSchema,
  looseBoolean,
  looseBooleanDefault,
  looseString,
  optionalString,
} from './primitives';
import { geminiOrderSchema } from './orders';

// Sanity bounds. The UI sends at most 40 emails and a short chat history;
// these caps keep a malformed or hostile client from driving an unbounded
// prompt (and its cost) rather than reflecting any product limit.
const MAX_EMAILS = 200;
const MAX_CHAT_MESSAGES = 200;

/** One Gmail message as the browser hands it to the analyzer. */
export const emailInputSchema = z.object({
  id: looseString(),
  subject: looseString(),
  sender: looseString(),
  date: looseString(),
  snippet: looseString(),
  body: looseString(),
});

/** A draft template as configured in the UI. */
export const templateInputSchema = z.object({
  id: optionalString,
  type: looseString(),
  name: looseString(),
  subjectTemplate: looseString(),
  bodyTemplate: looseString(),
  description: optionalString,
});

// Booleans default to false rather than undefined: this shape is typed as
// fully-required SecondaryFilterConfig, and a missing flag must not silently
// widen the filter.
export const secondaryFilterSchema = z.object({
  enabled: looseBooleanDefault(false),
  includePaymentDates: looseBooleanDefault(false),
  includeDispersions: looseBooleanDefault(false),
  includeSpecificRequests: looseBooleanDefault(false),
  customKeywords: z.unknown().optional().transform((value) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  ),
});

export const filterOptionsSchema = z.object({
  filterMode: looseString('hybrid'),
  templateTolerance: looseString('flexible'),
  minTemplateScore: z.unknown().optional().transform((value) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 65;
  }),
  secondaryFilter: secondaryFilterSchema.optional(),
});

/** POST /api/analyze-emails */
export const analyzeEmailsRequestSchema = z.object({
  emails: z.array(z.unknown()).max(MAX_EMAILS).optional().transform((value) => {
    if (!Array.isArray(value)) return [];
    // Individual malformed messages are dropped rather than failing the batch:
    // one bad message should not block the whole inbox scan.
    return value.flatMap((raw) => {
      const result = emailInputSchema.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  }),
  templates: z.array(z.unknown()).optional().transform((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
      const result = templateInputSchema.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  }),
  filterOptions: filterOptionsSchema.optional(),
});

/** POST /api/generate-draft-content */
export const generateDraftRequestSchema = z.object({
  type: looseString('advance'),
  orderNumber: optionalString,
  supplierName: optionalString,
  amount: amountSchema,
  currency: optionalString,
  dueDate: optionalString,
  bankDetails: optionalString,
  reason: optionalString,
  notes: optionalString,
});

export const chatMessageSchema = z.object({
  role: looseString('user'),
  content: looseString(),
});

const looseNumber = z.unknown().optional().transform((value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
});

/**
 * The slice of the Excel audit result that the chat prompt actually reads.
 *
 * Every field is optional and coerced: the audit state is produced locally by
 * this same app, so the goal here is to keep the prompt builder from throwing
 * on a partial result, not to gatekeep the payload. Unlisted fields are
 * dropped, which also keeps the prompt from ballooning with data it ignores.
 */
export const auditAnalysisSchema = z.object({
  fileName: looseString(),
  targetFullDateLabel: looseString(),
  totals: z
    .object({
      sofom: looseNumber,
      inc: looseNumber,
      tech: looseNumber,
      overall: looseNumber,
    })
    .optional(),
  sheets: z
    .record(
      z.string(),
      z.object({
        displayName: looseString(),
        total: looseNumber,
        items: z.array(z.unknown()).optional().transform((value) => value ?? []),
      })
    )
    .optional(),
  criticalMissing: z
    .array(
      z.object({
        radarItem: z
          .object({
            orderNumber: looseString(),
            supplierName: looseString(),
            amount: amountSchema,
          })
          .optional(),
        isUrgent: looseBoolean(),
        reason: looseString(),
      })
    )
    .optional()
    .transform((value) => value ?? []),
  anomalies: z.array(z.unknown()).optional().transform((value) => value ?? []),
  matches: z.array(z.unknown()).optional().transform((value) => value ?? []),
});

/**
 * POST /api/audit-chat
 *
 * `radarOrders` stays a loose array because it is only serialized into the
 * prompt field by field; `analysisResult` is shaped by auditAnalysisSchema
 * because the prompt builder reads into it.
 */
export const auditChatRequestSchema = z.object({
  messages: z.array(z.unknown()).max(MAX_CHAT_MESSAGES).optional().transform((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
      const result = chatMessageSchema.safeParse(raw);
      return result.success && result.data.content ? [result.data] : [];
    });
  }),
  radarOrders: z.array(z.unknown()).optional().transform((value) => value ?? []),
  // A malformed audit result degrades to "no file loaded" instead of failing
  // the chat request, which is the more useful behavior for the user.
  analysisResult: z.unknown().optional().transform((value) => {
    if (value === null || value === undefined) return null;
    const result = auditAnalysisSchema.safeParse(value);
    return result.success ? result.data : null;
  }),
});

// ---------------------------------------------------------------------------
// Responses, validated in the browser before they reach React state.
// ---------------------------------------------------------------------------

export const healthResponseSchema = z.object({
  status: looseString(),
  geminiConfigured: z.boolean(),
  model: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Per-entry problems the server reports alongside the orders it extracted. */
export const orderIssueSchema = z.object({
  index: z.number(),
  reason: looseString(),
});

export const analyzeEmailsResponseSchema = z.object({
  // Per-order tolerance, matching the server: one unusable entry must not
  // discard a whole inbox scan's worth of payment commitments.
  orders: z.array(z.unknown()).optional().transform((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
      const result = geminiOrderSchema.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  }),
  skipped: z.array(z.unknown()).optional().transform((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
      const result = orderIssueSchema.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  }),
  warnings: z.array(z.unknown()).optional().transform((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
      const result = orderIssueSchema.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  }),
});

export type AnalyzeEmailsResponse = z.infer<typeof analyzeEmailsResponseSchema>;

export const generateDraftResponseSchema = z.object({
  subject: z.string().min(1),
  bodyText: z.string().min(1),
});

export const auditChatResponseSchema = z.object({
  reply: z.string().min(1),
});
