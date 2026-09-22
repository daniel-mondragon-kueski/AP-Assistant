// Google Identity Services (GIS) token client loader and Gmail API requester

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: any }) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export async function loadGapiScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(new Error('No se pudo cargar Google Identity Services: ' + err));
    document.head.appendChild(script);
  });
}

// In-memory token storage (per Google Workspace Integration guidelines)
let inMemoryAccessToken: string | null = null;

// Clean up any stale tokens from browser storage
try {
  sessionStorage.removeItem('gmail_access_token');
  localStorage.removeItem('gmail_access_token');
} catch {
  // Ignore storage access errors
}

export function setCachedToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getCachedToken(): string | null {
  return inMemoryAccessToken;
}

export function clearCachedToken() {
  inMemoryAccessToken = null;
  try {
    sessionStorage.removeItem('gmail_access_token');
    localStorage.removeItem('gmail_access_token');
  } catch {
    // Ignore storage errors
  }
}

export async function requestGmailToken(clientId: string): Promise<string> {
  await loadGapiScript();

  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services no está disponible.'));
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose',
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          return reject(new Error('Error de autenticación: ' + JSON.stringify(tokenResponse.error)));
        }
        if (tokenResponse.access_token) {
          setCachedToken(tokenResponse.access_token);
          resolve(tokenResponse.access_token);
        } else {
          reject(new Error('No se recibió access token de Google.'));
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export interface FetchedEmail {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  body: string;
}

function decodeBase64UrlUtf8(base64UrlStr: string): string {
  if (!base64UrlStr) return '';
  try {
    const base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try {
      return decodeURIComponent(escape(atob(base64UrlStr.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch {
      try {
        return atob(base64UrlStr.replace(/-/g, '+').replace(/_/g, '/'));
      } catch {
        return '';
      }
    }
  }
}

function convertHtmlToStructuredText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/td>[\s]*<td[^>]*>/gi, ' | ')
    .replace(/<\/th>[\s]*<th[^>]*>/gi, ' | ')
    .replace(/<td[^>]*>/gi, '')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<th[^>]*>/gi, '')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<br[\s/]*>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractFullMessageBody(payload: any, fallbackSnippet: string = ''): string {
  if (!payload) return fallbackSnippet;

  let plainText = '';
  let htmlText = '';

  function traverse(part: any) {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      const decoded = decodeBase64UrlUtf8(part.body.data);
      if (decoded) plainText += (plainText ? '\n' : '') + decoded;
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      const decoded = decodeBase64UrlUtf8(part.body.data);
      if (decoded) htmlText += (htmlText ? '\n' : '') + decoded;
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverse(subPart);
      }
    }
  }

  // 1. Check top-level payload body
  if (payload.body?.data) {
    const decoded = decodeBase64UrlUtf8(payload.body.data);
    if (payload.mimeType === 'text/html') {
      htmlText = decoded;
    } else {
      plainText = decoded;
    }
  }

  // 2. Traverse nested parts
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      traverse(part);
    }
  }

  // If HTML has tables, convert to preserve rows/columns
  if (htmlText && (htmlText.includes('<table') || htmlText.includes('<tr') || !plainText.trim())) {
    const converted = convertHtmlToStructuredText(htmlText);
    if (converted.length > plainText.length || htmlText.includes('<table')) {
      return converted || fallbackSnippet;
    }
  }

  return plainText.trim() || convertHtmlToStructuredText(htmlText).trim() || fallbackSnippet;
}

export interface FetchEmailsResult {
  emails: FetchedEmail[];
  rawCount: number;
  queryExecuted: string;
}

export async function fetchRecentEmailsDetailed(
  accessToken: string,
  query: string = 'subject:("ADELANTO DE PAGO" OR "PAGO URGENTE" OR "ANTICIPO DE PAGO" OR pago OR OC OR PO)',
  maxResults: number = 50,
  onlyInbox: boolean = true
): Promise<FetchEmailsResult> {
  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('AUTH_REQUIRED: No hay una sesión de Google activa. Por favor inicia sesión con tu cuenta de Google.');
  }

  // Construct query enforcing INBOX only and strictly excluding drafts
  let finalQuery = query.trim();
  if (onlyInbox) {
    // Strip accidental draft matching syntax if present
    finalQuery = finalQuery.replace(/\bin:drafts?\b/gi, '').replace(/\bis:draft\b/gi, '').trim();

    if (!/\bin:inbox\b/i.test(finalQuery)) {
      finalQuery = `in:inbox -in:drafts -is:draft ${finalQuery}`.trim();
    } else {
      if (!/\b-is:draft\b/i.test(finalQuery) && !/\b-in:drafts\b/i.test(finalQuery)) {
        finalQuery = `${finalQuery} -in:drafts -is:draft`.trim();
      }
    }
  }

  const labelParam = onlyInbox ? '&labelIds=INBOX' : '';
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(finalQuery)}${labelParam}&includeSpamTrash=false&maxResults=${maxResults}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearCachedToken();
      throw new Error('AUTH_EXPIRED: Las credenciales de Google expiraron o no son válidas. Por favor vuelve a conectar tu cuenta.');
    }
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error?.message || `Error al obtener correos (${res.status})`;
    if (message.toLowerCase().includes('invalid authentication credentials') || message.includes('UNAUTHENTICATED')) {
      clearCachedToken();
      throw new Error('AUTH_EXPIRED: Las credenciales de Google expiraron o no son válidas. Por favor vuelve a conectar tu cuenta.');
    }
    throw new Error(message);
  }

  const data = await res.json();
  const messages: Array<{ id: string; threadId: string }> = data.messages || [];
  const rawCount = messages.length;

  const detailedEmails: FetchedEmail[] = [];
  // Inspect up to 40 messages so batch emails from yesterday aren't excluded
  const targetMessages = messages.slice(0, 40);

  // Fetch in concurrent batches of 6 for speed and quota safety
  const BATCH_SIZE = 6;
  for (let i = 0; i < targetMessages.length; i += BATCH_SIZE) {
    const batch = targetMessages.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (msg) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (msgRes.status === 401) {
          clearCachedToken();
          throw new Error('AUTH_EXPIRED: Las credenciales de Google expiraron o no son válidas.');
        }
        if (!msgRes.ok) return null;
        const fullMsg = await msgRes.json();

        // Extra safeguard: Filter out any draft, trash, spam or non-inbox message
        const labels: string[] = Array.isArray(fullMsg.labelIds) ? fullMsg.labelIds : [];
        if (onlyInbox) {
          if (
            labels.includes('DRAFT') ||
            labels.includes('TRASH') ||
            labels.includes('SPAM') ||
            (labels.length > 0 && !labels.includes('INBOX'))
          ) {
            return null;
          }
        }

        const headers = fullMsg.payload?.headers || [];
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

        const bodyText = extractFullMessageBody(fullMsg.payload, fullMsg.snippet || '');

        return {
          id: fullMsg.id,
          threadId: fullMsg.threadId,
          subject: subjectHeader?.value || '(Sin asunto)',
          sender: fromHeader?.value || '(Remitente desconocido)',
          date: dateHeader?.value || '',
          snippet: fullMsg.snippet || '',
          body: bodyText,
        } as FetchedEmail;
      })
    );

    for (const resItem of results) {
      if (resItem.status === 'fulfilled' && resItem.value) {
        detailedEmails.push(resItem.value);
      } else if (resItem.status === 'rejected') {
        const err = resItem.reason;
        if (err?.message?.startsWith('AUTH_EXPIRED')) {
          throw err;
        }
      }
    }
  }

  return {
    emails: detailedEmails,
    rawCount,
    queryExecuted: finalQuery,
  };
}

export async function fetchRecentEmails(
  accessToken: string,
  query: string = 'subject:("ADELANTO DE PAGO" OR "PAGO URGENTE" OR "ANTICIPO DE PAGO" OR pago OR OC OR PO)',
  maxResults: number = 50
): Promise<FetchedEmail[]> {
  const result = await fetchRecentEmailsDetailed(accessToken, query, maxResults);
  return result.emails;
}

// Function to create a real draft in user's Gmail using Gmail API
export async function createGmailDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<{ draftId: string; messageId: string }> {
  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('AUTH_REQUIRED: No hay una sesión de Google activa. Por favor inicia sesión con tu cuenta de Google.');
  }

  // Construct RFC 2822 email message
  const emailLines = [
    to ? `To: ${to}` : '',
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].filter((line) => line !== '');

  const emailRaw = emailLines.join('\r\n');
  const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailRaw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        raw: base64EncodedEmail,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearCachedToken();
      throw new Error('AUTH_EXPIRED: Las credenciales de Google expiraron o no son válidas. Por favor reconecta tu cuenta.');
    }
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `Error al crear borrador en Gmail (${response.status})`;
    if (msg.toLowerCase().includes('invalid authentication credentials') || msg.includes('UNAUTHENTICATED')) {
      clearCachedToken();
      throw new Error('AUTH_EXPIRED: Las credenciales de Google expiraron o no son válidas. Por favor reconecta tu cuenta.');
    }
    throw new Error(msg);
  }

  const result = await response.json();
  return {
    draftId: result.id,
    messageId: result.message?.id,
  };
}

// Generates direct Gmail compose web link with pre-filled fields
export function generateGmailComposeUrl(params: {
  to?: string;
  subject: string;
  body: string;
}): string {
  const base = 'https://mail.google.com/mail/?view=cm&fs=1';
  const url = new URL(base);
  if (params.to) url.searchParams.set('to', params.to);
  url.searchParams.set('su', params.subject);
  url.searchParams.set('body', params.body);
  return url.toString();
}
