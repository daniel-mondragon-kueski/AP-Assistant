// Access control for the AI endpoints.
//
// Cloud Run runs with public ingress so a browser can load the page at all
// (an authenticated Cloud Run service rejects a plain browser request, since
// no bearer token is attached). The restriction therefore lives here: every
// /api call must present a Firebase ID token whose verified email appears in
// the allowlist.

/** One allowlist entry: a full address, or `@domain` for a whole domain. */
export type AllowRule = string;

/**
 * Parses the ALLOWED_USERS value.
 *
 * Accepts commas, semicolons, whitespace and newlines as separators so the
 * value can be pasted from a spreadsheet or a chat message without surprises.
 * Entries are lower-cased; `example.com` and `@example.com` both mean the
 * whole domain.
 */
export function parseAllowList(raw: string | undefined): AllowRule[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether an email matches the allowlist.
 *
 * An entry containing `@` before any other character is a full address; an
 * entry that starts with `@`, or has no `@` at all, is a domain rule matching
 * every address in that domain. Comparison is case-insensitive.
 *
 * Returns false for an empty allowlist: the caller decides what "nothing
 * configured" means, because that answer differs between dev and production.
 */
export function isEmailAllowed(email: string | undefined, rules: AllowRule[]): boolean {
  if (!email || rules.length === 0) return false;

  const normalized = email.trim().toLowerCase();
  // A valid address has exactly one @ with text on both sides.
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf('@') || atIndex === normalized.length - 1) {
    return false;
  }
  const domain = normalized.slice(atIndex + 1);

  return rules.some((rule) => {
    if (rule.startsWith('@')) return domain === rule.slice(1);
    if (!rule.includes('@')) return domain === rule;
    return normalized === rule;
  });
}

/**
 * Resolves what an empty allowlist means.
 *
 * In production an unset ALLOWED_USERS denies everyone: a misconfigured
 * deployment must fail closed, not expose the tool. Outside production it
 * allows everyone, so `npm run dev` needs no setup.
 */
export function allowListMode(
  rules: AllowRule[],
  nodeEnv: string | undefined
): 'enforce' | 'deny_all' | 'open_dev' {
  if (rules.length > 0) return 'enforce';
  return nodeEnv === 'production' ? 'deny_all' : 'open_dev';
}
