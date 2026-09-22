// Schemas for payment orders, at the two boundaries where they arrive from
// outside the app: Gemini's extraction output and localStorage rehydration.
//
// Every primitive here already tolerates a missing key, so fields are written
// without `.optional()`; see primitives.ts for why the order matters in Zod 4.
import { z } from 'zod';

import {
  amountSchema,
  currencySchema,
  isoDateSchema,
  looseBoolean,
  looseEnum,
  looseString,
  optionalString,
  parseMonetaryValue,
  scoreSchema,
  stringArraySchema,
} from './primitives';

const urgencyLevelSchema = looseEnum(['urgent', 'advance', 'normal'] as const, 'normal');
const detectionSourceSchema = looseEnum(
  ['template_match', 'secondary_filter', 'manual'] as const,
  'template_match'
);
const statusSchema = looseEnum(
  ['pending', 'scheduled', 'paid', 'duplicate_alert'] as const,
  'pending'
);

/** Fields shared by the model output and the stored form of an order. */
const orderFields = {
  supplierName: looseString(),
  amount: amountSchema,
  currency: currencySchema,
  area: optionalString,
  rawPaymentDateText: optionalString,
  paymentTerm: looseString('Contado'),
  invoiceNumber: optionalString,
  urgencyLevel: urgencyLevelSchema,
  isCompletedPayment: looseBoolean(),
  completedDate: optionalString,
  summary: looseString(),
  emailId: looseString(),
  emailThreadId: optionalString,
  emailSubject: looseString(),
  emailSender: looseString(),
  emailDate: looseString(),
  riskNotes: optionalString,
  subjectMatch: looseBoolean(),
  detectionSource: detectionSourceSchema,
  matchedTemplateName: optionalString,
  templateMatchScore: scoreSchema,
  matchedFields: stringArraySchema,
  secondaryFilterTags: stringArraySchema,
};

/**
 * One payment order as extracted by Gemini from an email.
 *
 * Deliberately forgiving on individual fields: an unexpected label or a
 * missing note must not cost us a payment commitment. The one hard
 * requirement is that the order be identifiable — an entry with neither an
 * order number nor a supplier cannot be acted on or deduplicated, so it is
 * reported as skipped rather than rendered as an empty row.
 *
 * `paymentDueDate` is validated as a real calendar date here and left
 * undefined otherwise, so a hallucinated "2026-02-31" does not reach the
 * due-date logic.
 */
export const geminiOrderSchema = z
  .object({
    ...orderFields,
    orderNumber: looseString(),
    paymentDueDate: isoDateSchema,
  })
  .superRefine((order, ctx) => {
    if (!order.orderNumber && !order.supplierName) {
      ctx.addIssue({
        code: 'custom',
        message: 'La orden no tiene número de orden ni proveedor, no es identificable.',
      });
    }
  });

export type GeminiOrder = z.infer<typeof geminiOrderSchema>;

export interface GeminiOrderIssue {
  index: number;
  reason: string;
}

export interface GeminiOrdersResult {
  orders: GeminiOrder[];
  /** Entries that could not be used at all. */
  skipped: GeminiOrderIssue[];
  /**
   * Entries that were kept but lost data on the way in. Amount warnings
   * matter most: the model sent something the app could not read as a figure,
   * so a human needs to check that order against the source email.
   */
  warnings: GeminiOrderIssue[];
}

/**
 * Validates the `orders` array of a Gemini extraction response.
 *
 * Invalid entries are reported instead of silently dropped: in an AP radar a
 * vanished order is a missed payment, so the caller surfaces the counts.
 */
export function validateGeminiOrders(input: unknown): GeminiOrdersResult {
  const orders: GeminiOrder[] = [];
  const skipped: GeminiOrderIssue[] = [];
  const warnings: GeminiOrderIssue[] = [];

  if (!Array.isArray(input)) {
    return { orders, skipped, warnings };
  }

  input.forEach((raw, index) => {
    const result = geminiOrderSchema.safeParse(raw);
    if (!result.success) {
      skipped.push({
        index,
        reason: result.error.issues.map((issue) => issue.message).join('; '),
      });
      return;
    }

    // An amount that was present but unreadable means a figure was lost.
    // The order is still worth keeping; the discrepancy is worth reporting.
    const rawAmount =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>).amount : undefined;
    if (
      rawAmount !== undefined &&
      rawAmount !== null &&
      rawAmount !== '' &&
      parseMonetaryValue(rawAmount) === null
    ) {
      warnings.push({
        index,
        reason: `Monto ilegible (${JSON.stringify(rawAmount)}) en ${
          result.data.orderNumber || result.data.supplierName
        }; verifica el correo original.`,
      });
    }

    orders.push(result.data);
  });

  return { orders, skipped, warnings };
}

/**
 * A fully-formed PaymentOrder as the app stores it in localStorage.
 *
 * Stricter than the Gemini schema: `id` and `orderNumber` back React keys and
 * the deduplication key, so a record without them is discarded on rehydration
 * rather than crashing the list. `paymentDueDate` stays a plain string here
 * because stored orders legitimately carry free-form dates from earlier runs.
 */
export const storedPaymentOrderSchema = z.object({
  ...orderFields,
  id: z.string().min(1),
  orderNumber: z.string().min(1),
  paymentDueDate: looseString(),
  isProgrammed: looseBoolean(),
  programmedDate: optionalString,
  status: statusSchema,
  flaggedDuplicate: looseBoolean(),
  duplicateOfId: optionalString,
  matchedTemplateId: optionalString,
});

export type StoredPaymentOrder = z.infer<typeof storedPaymentOrderSchema>;

/**
 * Rehydrates a stored order list, keeping the records that are still usable.
 * Returns null when the payload is not an array at all, so the caller can
 * fall back to its sample dataset.
 */
export function parseStoredOrders(
  input: unknown
): { orders: StoredPaymentOrder[]; discarded: number } | null {
  if (!Array.isArray(input)) return null;

  const orders: StoredPaymentOrder[] = [];
  let discarded = 0;

  for (const raw of input) {
    const result = storedPaymentOrderSchema.safeParse(raw);
    if (result.success) {
      orders.push(result.data);
    } else {
      discarded += 1;
    }
  }

  return { orders, discarded };
}
