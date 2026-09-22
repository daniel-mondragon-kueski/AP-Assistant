// Thin helpers around the Express/Gemini backend exposed by server.ts.

export interface BackendHealth {
  status: string;
  geminiConfigured: boolean;
  model: string;
}

/** Turns the model id returned by the backend into a human label ("Gemini 2.5 Flash"). */
export function formatModelLabel(model: string): string {
  return model
    .split('-')
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

export async function fetchBackendHealth(): Promise<BackendHealth | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return (await res.json()) as BackendHealth;
  } catch {
    return null;
  }
}

/**
 * Reads the error message the backend sent (e.g. the missing-API-key notice)
 * instead of swallowing it behind a generic string.
 */
export async function readApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = await res.json();
    if (data?.error) return new Error(data.error);
  } catch {
    // Response had no JSON body; fall through to the generic message.
  }
  return new Error(`${fallback} (HTTP ${res.status})`);
}
