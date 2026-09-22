// Thin helpers around the Express/Gemini backend exposed by server.ts.
//
// Every response is validated before it reaches React state: the payloads
// originate from a language model, so "the server returned 200" is not the
// same as "the body has the shape we expect".
import type { z } from 'zod';

import {
  analyzeEmailsResponseSchema,
  auditChatResponseSchema,
  generateDraftResponseSchema,
  healthResponseSchema,
  type AnalyzeEmailsResponse,
  type HealthResponse,
} from '../schemas/api';

export type BackendHealth = HealthResponse;
export type { AnalyzeEmailsResponse };

/** Turns the model id returned by the backend into a human label ("Gemini 2.5 Flash"). */
export function formatModelLabel(model: string): string {
  return model
    .split('-')
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * Reads the error message the backend sent (e.g. the missing-API-key notice)
 * instead of swallowing it behind a generic string. Validation problems the
 * server reports are appended so the user sees which field was rejected.
 */
export async function readApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = await res.json();
    if (data?.error) {
      const issues = Array.isArray(data.issues)
        ? data.issues
            .map((issue: unknown) => {
              if (!issue || typeof issue !== 'object') return null;
              const { path, message } = issue as { path?: unknown; message?: unknown };
              if (typeof message !== 'string') return null;
              return typeof path === 'string' && path ? `${path}: ${message}` : message;
            })
            .filter((entry: string | null): entry is string => Boolean(entry))
        : [];
      return new Error(issues.length ? `${data.error} (${issues.join('; ')})` : data.error);
    }
  } catch {
    // Response had no JSON body; fall through to the generic message.
  }
  return new Error(`${fallback} (HTTP ${res.status})`);
}

/**
 * Parses a response body against a schema, raising a clear error when the
 * backend answers 200 with something unusable.
 */
async function parseResponse<T>(
  res: Response,
  schema: z.ZodType<T>,
  context: string
): Promise<T> {
  const body = await res.json().catch(() => {
    throw new Error(`${context}: la respuesta del servidor no es JSON válido.`);
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || 'raíz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`${context}: la respuesta del servidor no tiene el formato esperado (${detail}).`);
  }
  return result.data;
}

export async function fetchBackendHealth(): Promise<BackendHealth | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return await parseResponse(res, healthResponseSchema, 'Health');
  } catch {
    // Health is advisory only — a failure here must not break the UI.
    return null;
  }
}

export async function postAnalyzeEmails(payload: unknown): Promise<AnalyzeEmailsResponse> {
  const res = await fetch('/api/analyze-emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await readApiError(res, 'Error en el servidor al analizar correos');
  }
  return parseResponse(res, analyzeEmailsResponseSchema, 'Análisis de correos');
}

export async function postGenerateDraft(payload: unknown) {
  const res = await fetch('/api/generate-draft-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await readApiError(res, 'Error al conectar con el asistente de IA');
  }
  return parseResponse(res, generateDraftResponseSchema, 'Generación de borrador');
}

export async function postAuditChat(payload: unknown) {
  const res = await fetch('/api/audit-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await readApiError(res, 'Error al consultar el asistente');
  }
  return parseResponse(res, auditChatResponseSchema, 'Chat de auditoría');
}
