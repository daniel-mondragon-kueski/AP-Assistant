import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { ZodError, type ZodType } from "zod";

import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  analyzeEmailsRequestSchema,
  auditChatRequestSchema,
  generateDraftRequestSchema,
} from "./src/schemas/api";
import { validateGeminiOrders } from "./src/schemas/orders";
import { allowListMode, isEmailAllowed, parseAllowList } from "./src/schemas/access";
import firebaseConfig from "./firebase-applet-config.json";

// Load .env.local first (local overrides, git-ignored) then .env.
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Single source of truth for the Gemini model used by every endpoint.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(express.json({ limit: "15mb" }));

// ---------------------------------------------------------------------------
// Access control for the AI endpoints.
//
// Cloud Run runs with public ingress because an authenticated service rejects
// a plain browser request (no bearer token is attached), so the page could not
// load at all. The restriction is enforced here instead: every /api call
// carries the caller's Firebase ID token, which is verified against Google's
// public keys and its email checked against ALLOWED_USERS.
// ---------------------------------------------------------------------------

const ALLOW_RULES = parseAllowList(process.env.ALLOWED_USERS);
const ACCESS_MODE = allowListMode(ALLOW_RULES, process.env.NODE_ENV);
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;

// Google's public keys for Firebase ID tokens. jose caches and refreshes these.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

/** Verifies a Firebase ID token and returns its verified email. */
async function verifyIdToken(token: string): Promise<string | undefined> {
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
    algorithms: ["RS256"],
  });

  // jose checks the signature, issuer, audience and expiry. Firebase also
  // requires a non-empty subject, and an unverified email is not an identity.
  if (!payload.sub) return undefined;
  if (payload.email_verified !== true) return undefined;
  return typeof payload.email === "string" ? payload.email : undefined;
}

async function requireAllowedUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (ACCESS_MODE === "open_dev") return next();

  if (ACCESS_MODE === "deny_all") {
    // Fails closed: a production deploy without ALLOWED_USERS must not expose
    // the tool, so this is a configuration error rather than an open door.
    return res.status(503).json({
      error:
        "El servicio no tiene lista de acceso configurada. Define ALLOWED_USERS con los correos autorizados y vuelve a desplegar.",
      code: "ACCESS_NOT_CONFIGURED",
    });
  }

  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return res.status(401).json({
      error: "Inicia sesión con tu cuenta de Google para usar el asistente.",
      code: "AUTH_REQUIRED",
    });
  }

  let email: string | undefined;
  try {
    email = await verifyIdToken(match[1]);
  } catch {
    return res.status(401).json({
      error: "Tu sesión de Google expiró o no es válida. Vuelve a iniciar sesión.",
      code: "AUTH_INVALID",
    });
  }

  if (!isEmailAllowed(email, ALLOW_RULES)) {
    // Worth logging for whoever administers the allowlist: it is the only
    // signal that someone with a Google account tried and was turned away.
    console.warn(`Acceso denegado para ${email || "(sin correo en el token)"}.`);
    return res.status(403).json({
      error:
        "Tu cuenta no está autorizada para usar este asistente. Solicita acceso al responsable de Cuentas por Pagar.",
      code: "ACCESS_DENIED",
    });
  }

  return next();
}

function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
}

// Thrown when no API key is configured, so routes can answer 503 instead of 500.
class MissingApiKeyError extends Error {
  constructor() {
    super(
      "Falta la clave de la API de Gemini. Define GEMINI_API_KEY en el archivo .env.local (ver .env.example) y reinicia el servidor."
    );
    this.name = "MissingApiKeyError";
  }
}

// Lazy Gemini client
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new MissingApiKeyError();
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

function sendError(res: express.Response, error: any, fallbackMessage: string) {
  if (error instanceof MissingApiKeyError) {
    return res.status(503).json({ error: error.message, code: "MISSING_API_KEY" });
  }
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "El cuerpo de la petición no tiene el formato esperado.",
      code: "INVALID_REQUEST",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return res.status(500).json({ error: error?.message || fallbackMessage });
}

/** Validates a request body, throwing a ZodError that sendError turns into a 400. */
function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body ?? {});
}

// Health / configuration probe used by the UI and for local diagnostics.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    geminiConfigured: Boolean(getApiKey()),
    model: GEMINI_MODEL,
  });
});

// 1. Analyze batch of emails with Gemini for PO, Template Match & Secondary Filtering
app.post("/api/analyze-emails", requireAllowedUser, async (req, res) => {
  try {
    const { emails, templates, filterOptions } = parseBody(
      analyzeEmailsRequestSchema,
      req.body
    );
    if (emails.length === 0) {
      return res.json({ orders: [], skipped: [], warnings: [] });
    }

    const ai = getGemini();

    const activeFilterMode = filterOptions?.filterMode || 'hybrid';
    const minTemplateScore = filterOptions?.minTemplateScore || 65;
    const secondaryFilter = filterOptions?.secondaryFilter || {
      enabled: true,
      includePaymentDates: true,
      includeDispersions: true,
      includeSpecificRequests: true,
      customKeywords: [],
    };

    const templatesPromptSection = Array.isArray(templates) && templates.length > 0
      ? templates.map((t: any) => `
Plantilla [${t.type === 'urgent' ? 'PAGO URGENTE' : 'ADELANTO / ANTICIPO'}]: "${t.name}"
Patrón Asunto: "${t.subjectTemplate}"
Campos Estructurales Esperados:
- Número de Orden de Compra (OC / PO / Folio)
- Proveedor o Beneficiario
- Monto y Divisa
- Fecha Límite o Fecha Requerida de Desembolso
- Factura / Folio
- Datos Bancarios / CLABE
- Área o Departamento Solicitante
- Justificación / Motivo o Porcentaje de Anticipo
`).join('\n')
      : `Plantillas de referencia estándar de Cuentas por Pagar (Solicitud de Pago Urgente y Solicitud de Anticipo/Adelanto de Pago).`;

    const prompt = `Actúa como el Asistente de Operaciones Financieras y Cuentas por Pagar (AP) de Kueski.
Tu tarea es auditar y clasificar correos corporativos de Gmail para alimentar el RADAR DE PAGOS.

EL FILTRO EXACTO DEL RADAR ESTÁ BASADO EN LAS DOS PLANTILLAS OFICIALES CONFIGURADAS EN LA APP:
1. Plantilla [PAGO URGENTE]:
   - Patrón de Asunto oficial: [PAGO URGENTE] - [NÚMERO_DE_ORDEN] [NOMBRE_PROVEEDOR]
   - Formato de cuerpo esperado:
     • Número de documento (SC/OC): [VALOR]
     • Proveedor: [VALOR]
     • Monto Total a Pagar: [VALOR] MXN
     • Fecha Solicitada de Pago: [VALOR]
     • Folio / Factura: [VALOR]
     • Datos Bancarios / CLABE: [VALOR]
     • Área: [VALOR]
     • Justificación de Urgencia: [VALOR]
     • Notas Adicionales / Impacto: [VALOR]

2. Plantilla [ADELANTO DE PAGO]:
   - Patrones de Asunto oficial aceptados:
     * Individual: [ADELANTO DE PAGO] - [NÚMERO_DE_ORDEN] [NOMBRE_PROVEEDOR]
     * Por Área / Solicitante / Lote: [ADELANTO DE PAGO] [ÁREA] ([SOLICITANTE])
       Ejemplo real: "[ADELANTO DE PAGO] Growth Marketing (Mariana Herrera)"
       (Aquí el área es "Growth Marketing" y el solicitante es "Mariana Herrera").
     * Variaciones: "[ANTICIPO DE PAGO]", "ADELANTO DE PAGO", "[ADELANTO PAGO]", etc.
   - Formatos de cuerpo esperados:
     A) Formato individual en viñetas:
        (Texto intro con área: "adelanto de pago correspondiente al [ÁREA]...")
        • Número de Documento (SC/OC): [VALOR]
        • Proveedor: [VALOR]
        • Monto Total a Pagar: [VALOR] MXN/USD
        • Fecha Requerida: [VALOR]
        • Cuenta Bancaria / Destino: [VALOR]
        • Justificación: [VALOR]
     B) Formato de TABLA o LISTA MULTI-ORDEN (Muy frecuente en Cuentas por Pagar):
        Encabezados típicos: "OC | PROVEEDOR | MONTO | MONEDA | PAGO SOLICITADO | COMENTARIO"
        Seguido de múltiples filas de órdenes de compra (OC).

=======================================================
REGLA RECTORA 1: PRIMER CRITERIO — ASUNTO DEL CORREO
=======================================================
Evalúa en primer lugar el ASUNTO del correo:
- Si el asunto contiene "[PAGO URGENTE]" o "[ADELANTO DE PAGO]" (o variaciones tolerantes):
  * Marca "subjectMatch: true"
  * Otorga inmediatamente la más alta prioridad en el radar (score base de 85 a 100 puntos).
  * Si el asunto incluye el área entre el tag y el solicitante (ej: "[ADELANTO DE PAGO] Growth Marketing (Mariana Herrera)"), extrae "Growth Marketing" como "area".
  * FLEXIBILIDAD EN EL ASUNTO: Sé tolerante a:
    - Sin corchetes o con otros delimitadores: "PAGO URGENTE", "ADELANTO DE PAGO", "(PAGO URGENTE)", "[ANTICIPO DE PAGO]", "ADELANTO PAGO".
    - Mayúsculas/minúsculas y tildes: "pago urgente", "adelanto de pago", "anticipo".
    - Errores de ortografía o de digitación (typos): "pago urgnete", "pago urgnte", "pagos urgentes", "adelatno de pago", "adelanto de pgo", "adeltanto de pago".

=======================================================
REGLA CRÍTICA Y OBLIGATORIA: TABLAS Y CORREOS MULTI-ORDEN (LOTES DE PAGO)
=======================================================
¡ATENCIÓN! Un solo correo electrónico puede contener MÚLTIPLES órdenes de compra / adelantos de pago.
Por ejemplo:
- Asunto: "[ADELANTO DE PAGO] Growth Marketing (Mariana Herrera)"
- En el cuerpo: Una tabla o desglose con columnas: "OC | PROVEEDOR | MONTO | MONEDA | PAGO SOLICITADO | COMENTARIO"
  * Fila 1: OC00015462 | RTB House | $2.689,95 | USD | 23 SEP | Sehizo corrección en la carga...
  * Fila 2: OC00015798 | Singular Labs Inc | $27.500,00 | USD | 23 SEP | La renovación de contrato...
  * Fila 3: OC00015221 | Todovien Marketing | $300.000,00 | MXN | 23 SEP | Nos reecordinamos para el registro...
  * Fila 4: OC00015747 | Todovien Marketing | $562.500,00 | MXN | 23 SEP | ...
  * Fila 5: OC00015767 | Todovien Marketing | $450.000,00 | MXN | 23 SEP | ...
  * Fila 6: OC00015198 | S Servicios de Música México S.A. de C.V | $146.654,52 | MXN | 23 SEP | ...

REGLA DE EXTRACCIÓN PARA TABLAS:
- DEBES CREAR UN OBJETO SEPARADO EN EL ARRAY "orders" POR CADA FILA U ORDEN DE COMPRA DE LA TABLA.
- NO agrupas todo en una sola orden ni descartes el correo. Si la tabla tiene 6 filas, debes retornar 6 objetos en el array "orders".
- Cada objeto debe contener:
  * orderNumber: El código OC/SC específico de la fila (ej. "OC00015462").
  * supplierName: El proveedor específico de esa fila (ej. "RTB House").
  * amount: El monto numérico limpio. ATENCIÓN AL FORMATO DECIMAL/MILES LATINO:
    "$2.689,95" -> 2689.95
    "$27.500,00" -> 27500.00
    "$300.000,00" -> 300000.00
    "$562.500,00" -> 562500.00
    "$146.654,52" -> 146654.52
  * currency: "USD" o "MXN" según la columna MONEDA.
  * area: "Growth Marketing" (heredado del asunto o cuerpo para todas las órdenes del correo).
  * rawPaymentDateText: Fecha de la fila (ej. "23 SEP").
  * paymentDueDate: Fecha estimada en formato YYYY-MM-DD (ej: "2026-09-23").
  * urgencyLevel: "advance" (si es adelanto de pago) o "urgent" (si es pago urgente).
  * summary: Resumen conciso (ej: "Adelanto de pago para RTB House - Growth Marketing").
  * riskNotes: El comentario de la columna COMENTARIO o motivo de la fila.
  * subjectMatch: true.
  * templateMatchScore: 95 a 100.
  * matchedTemplateName: "[ADELANTO DE PAGO]".
  * matchedFields: ["Asunto Oficial", "Área Solicitante", "Tabla de Órdenes", "OC", "Proveedor", "Monto", "Moneda", "Fecha Solicitada", "Comentario"].
  * emailId, emailSubject, emailSender, emailDate: Se asignan idénticos a los del correo analizado.

=======================================================
REGLA RECTORA 2: SEGUNDO CRITERIO — FORMATO Y CAMPOS DE LA PLANTILLA
=======================================================
Evalúa inteligentemente si el correo cumple con el formato estructurado de las plantillas:
- Detecta y extrae los campos clave:
  1. Número de documento (SC/OC): tolerar "SC", "OC", "PO", "Orden de Compra", "Doc", "Solicitud", "Pedido".
  2. Proveedor: tolerar "Provedor", "Beneficiario", "Empresa", "Razón Social".
  3. Monto Total a Pagar: tolerar "Monto", "Total", "Importe", "Costo", "$", "MXN", "USD".
  4. Fecha Solicitada / Requerida de Pago: tolerar "Fecha límite", "Vencimiento", "Fecha pago", "Para el día".
  5. Folio / Factura: tolerar "Factura", "Folio", "CFDI", "PDF", "Invoice".
  6. Datos Bancarios / CLABE: tolerar "CLABE", "Cuenta", "Banco", "Interbancaria", "Transferencia", "SPEI".
  7. Área: tolerar "Área", "Area", "Departamento", "Depto", "Área solicitante" (o en la frase de intro "correspondiente al área X").
  8. Justificación de Urgencia / Justificación del Anticipo: tolerar "Justificación", "Motivo", "Razón", "Riesgo".

FLEXIBILIDAD Y TOLERANCIA INTELIGENTE A ERRORES:
- Admite errores ortográficos y de escritura en las viñetas o texto (ejemplo: "provedor", "num sc/oc", "clabe interbancaria", "inporte", "fehca").
- Acepta viñetas de cualquier tipo (•, -, *, números) o texto corrido delimitado por dos puntos.
- Si el solicitante dejó algún campo vacío o completó con texto libre, extrae todo lo posible.
- Si el correo presenta al menos 3 campos de la plantilla, asígnalo como "detectionSource: template_match" y calcula el templateMatchScore (0 a 100) en base a cuántos campos coinciden y si el asunto coincidió.
- Si el asunto coincidió con [PAGO URGENTE] o [ADELANTO DE PAGO], el templateMatchScore debe ser de al menos 70 a 100.

=======================================================
CRITERIO SECUNDARIO (SOLO EN MODO HÍBRIDO / BROAD):
=======================================================
Para correos que NO tengan el asunto ni la estructura de las plantillas:
- Solo si activeFilterMode es "hybrid" o "broad": evalúa si menciona fechas de pago o dispersiones/SPEI. Si activeFilterMode es "strict_templates", DESCÁRTALOS por completo.

Modo activo actual: "${activeFilterMode}"
Umbral mínimo de score para plantilla: ${minTemplateScore}%
Criterio secundario configurado: ${JSON.stringify(secondaryFilter)}

=======================================================
PLANTILLAS CONFIGURADAS ACTUALMENTE EN LA APP:
=======================================================
${templatesPromptSection}

Lista de correos a analizar:
${JSON.stringify(
  emails.map((e: any) => ({
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    date: e.date,
    snippet: e.snippet,
    body: e.body ? e.body.slice(0, 6000) : "",
  })),
  null,
  2
)}

Extrae rigurosamente para cada correo que califique en el radar:
1. orderNumber: Número de Orden o SC/OC. Si no viene explícito, usa "SC/OC-PENDIENTE".
2. supplierName: Nombre del proveedor o beneficiario.
3. amount: Monto numérico solicitado (ej. 145000) o null.
4. currency: MXN (default) o USD.
5. area: Nombre del área o departamento solicitante (ej: "Operaciones", "IT", "Marketing", "Finanzas"). Si no se menciona, usa null.
6. rawPaymentDateText: Expresión textual de la fecha (ej: "23 de septiembre", "hoy").
7. paymentDueDate: Fecha estimada YYYY-MM-DD (si es ambigua, asignar próximo miércoles hábil).
8. paymentTerm: Término comercial o de pago.
9. invoiceNumber: Folio o factura si existe.
10. urgencyLevel: "urgent" si es [PAGO URGENTE] o motivo urgente; "advance" si es [ADELANTO DE PAGO] o anticipo; "normal" en otros casos.
11. isCompletedPayment: true si confirma que ya se pagó.
12. summary: Resumen conciso.
13. riskNotes: Alerta de riesgo o justificación de urgencia.
14. subjectMatch: true si el asunto coincide con [PAGO URGENTE] o [ADELANTO DE PAGO] (tolerando typos/sin corchetes), false de lo contrario.
15. detectionSource: "template_match" o "secondary_filter".
16. matchedTemplateName: "[PAGO URGENTE]" o "[ADELANTO DE PAGO]" (o null si es secondary_filter).
17. templateMatchScore: 0 a 100.
18. matchedFields: Array de campos detectados (ej: ["Asunto Oficial", "Número de Documento (SC/OC)", "Proveedor", "Monto", "Fecha Solicitada", "Área", "CLABE", "Justificación"]).
19. secondaryFilterTags: Array de tags si entró por 2º filtro.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            orders: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  orderNumber: { type: Type.STRING },
                  supplierName: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  currency: { type: Type.STRING },
                  area: { type: Type.STRING },
                  rawPaymentDateText: { type: Type.STRING },
                  paymentDueDate: { type: Type.STRING },
                  paymentTerm: { type: Type.STRING },
                  invoiceNumber: { type: Type.STRING },
                  urgencyLevel: { type: Type.STRING, enum: ["urgent", "advance", "normal"] },
                  isCompletedPayment: { type: Type.BOOLEAN },
                  summary: { type: Type.STRING },
                  emailId: { type: Type.STRING },
                  emailSubject: { type: Type.STRING },
                  emailSender: { type: Type.STRING },
                  emailDate: { type: Type.STRING },
                  riskNotes: { type: Type.STRING },
                  subjectMatch: { type: Type.BOOLEAN },
                  detectionSource: { type: Type.STRING, enum: ["template_match", "secondary_filter", "manual"] },
                  matchedTemplateName: { type: Type.STRING },
                  templateMatchScore: { type: Type.NUMBER },
                  matchedFields: { type: Type.ARRAY, items: { type: Type.STRING } },
                  secondaryFilterTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["orderNumber", "supplierName", "urgencyLevel", "summary", "emailId"],
              },
            },
          },
          required: ["orders"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const { orders, skipped, warnings } = validateGeminiOrders(parsed.orders);

    // Report rather than hide: a dropped order in an AP radar is a payment
    // nobody sees again, so the client surfaces these counts to the user.
    if (skipped.length || warnings.length) {
      console.warn(
        `analyze-emails: ${skipped.length} orden(es) descartada(s), ${warnings.length} con datos incompletos.`,
        { skipped, warnings }
      );
    }

    return res.json({ orders, skipped, warnings });
  } catch (error: any) {
    console.error("Error analyzing emails:", error);
    return sendError(res, error, "Failed to analyze emails");
  }
});

// 2. Draft generator assistant / customizer
app.post("/api/generate-draft-content", requireAllowedUser, async (req, res) => {
  try {
    const { type, orderNumber, supplierName, amount, currency, dueDate, bankDetails, reason, notes } =
      parseBody(generateDraftRequestSchema, req.body);
    const ai = getGemini();

    const prompt = `Actúa como un analista senior de Cuentas por Pagar (AP) y Finanzas.
Genera el contenido profesional para un correo formal solicitando procesar un pago.
Tipo de solicitud: ${type === "urgent" ? "PAGO URGENTE (Prioridad alta / Vencimiento inminente)" : "ADELANTO DE PAGO (Anticipo a proveedor)"}

Datos proporcionados:
- Número de Orden / PO: ${orderNumber || "[ORDEN_PENDIENTE]"}
- Proveedor / Beneficiario: ${supplierName || "[PROVEEDOR]"}
- Monto: ${amount ? `${amount} ${currency || "MXN"}` : "[MONTO_A_COMPLETAR]"}
- Fecha solicitada de pago: ${dueDate || "[FECHA_DE_PAGO]"}
- Datos bancarios / Clabe: ${bankDetails || "[DATOS_BANCARIOS]"}
- Motivo o justificación: ${reason || (type === "urgent" ? "Vencimiento crítico / Riesgo de corte de servicio" : "Requisito para liberación de producción / Embarque")}
- Notas adicionales: ${notes || "Ninguna"}

Devuelve un JSON con:
- subject: Asunto claro, profesional y estructurado (e.g. "[URGENTE] Solicitud de Pago - PO #1234 - Proveedor XYZ")
- bodyText: Cuerpo del correo en texto plano con saltos de línea claros, campos claramente delimitados con corchetes e instrucciones legibles.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            bodyText: { type: Type.STRING },
          },
          required: ["subject", "bodyText"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch (error: any) {
    console.error("Error generating draft content:", error);
    return sendError(res, error, "Failed to generate draft content");
  }
});

// 3. Interactive AP & Proposal Audit Chat Assistant
app.post("/api/audit-chat", requireAllowedUser, async (req, res) => {
  try {
    const { messages, radarOrders, analysisResult } = parseBody(
      auditChatRequestSchema,
      req.body
    );
    const ai = getGemini();

    const systemPrompt = `Eres el Asistente Experto de Cuentas por Pagar (AP) y Operaciones Financieras de Kueski.
Tu función principal es responder preguntas del usuario, auditar compromisos de pago y cruzar el archivo Excel de la propuesta semanal ("Propuesta de pago Semana X.xlsx") contra el "Radar de Pagos" extraído de correos de Gmail.

Tienes acceso completo a los siguientes datos en tiempo real:

=== 1. RADAR DE PAGOS DE GMAIL ===
${JSON.stringify(
  (radarOrders || []).map((o: any) => ({
    orderNumber: o.orderNumber,
    supplierName: o.supplierName,
    amount: o.amount,
    currency: o.currency,
    urgencyLevel: o.urgencyLevel,
    rawPaymentDateText: o.rawPaymentDateText,
    paymentDueDate: o.paymentDueDate,
    paymentTerm: o.paymentTerm,
    invoiceNumber: o.invoiceNumber,
    status: o.status,
    isCompletedPayment: o.isCompletedPayment,
    completedDate: o.completedDate,
    summary: o.summary,
    riskNotes: o.riskNotes,
    emailDate: o.emailDate,
  })),
  null,
  2
)}

=== 2. ESTADO DEL ARCHIVO EXCEL DE PROPUESTA SEMANAL ===
${
  analysisResult
    ? JSON.stringify(
        {
          fileName: analysisResult.fileName,
          targetFullDateLabel: analysisResult.targetFullDateLabel,
          totals: analysisResult.totals,
          sheetsSummary: Object.entries(analysisResult.sheets ?? {}).map(([sheet, data]) => ({
            sheet,
            displayName: data.displayName,
            total: data.total,
            itemsCount: data.items.length,
          })),
          criticalMissingCount: analysisResult.criticalMissing.length,
          criticalMissingItems: analysisResult.criticalMissing.map((m) => ({
            orderNumber: m.radarItem?.orderNumber,
            supplierName: m.radarItem?.supplierName,
            amount: m.radarItem?.amount,
            isUrgent: m.isUrgent,
            reason: m.reason,
          })),
          anomaliesCount: analysisResult.anomalies.length,
          anomalies: analysisResult.anomalies,
          matchesCount: analysisResult.matches.length,
        },
        null,
        2
      )
    : "NINGÚN ARCHIVO EXCEL HA SIDO CARGADO TODAVÍA."
}

INSTRUCCIONES CLAVE DE RESPUESTA:
- Pregunta: "¿Qué pagos debo considerar?" -> Resume las órdenes urgentes, los compromisos de la semana según el radar de Gmail, destacando qué está programado y qué montos vencen o requieren atención prioritaria.
- Pregunta: "¿Ya se pagó [proveedor / OC / factura]?" -> Revisa exhaustivamente el radar y el historial de pagos efectuados (aquellas órdenes con isCompletedPayment: true, status: 'paid', o con fecha de liquidación registrada). Responde con claridad si ya fue liquidado (y cuándo) o si sigue pendiente en el radar.
- Pregunta: "¿Qué pagos faltan en el Excel?" -> Señala claramente los faltantes críticos (especialmente OCs urgentes del radar que no fueron incluidas en SOFOM, INC o TECH).
- Pregunta sobre montos o totales -> Entrega las cifras exactas en formato de moneda ($XX,XXX.XX MXN) para SOFOM, INC, TECH y el Consolidado.
- Pregunta sobre anomalías -> Explica si hay montos negativos, celdas vacías o duplicados.
- Tono: Profesional, ejecutivo, sumamente claro y empático.
- Formato: Usa Markdown limpio con viñetas, negritas para cifras y nombres de proveedores, y tablas breves si ayuda a comparar.
- Responde siempre en español.`;

    // Format chat history for generateContent
    const contents: any[] = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      {
        role: "model",
        parts: [{ text: "Entendido. Estoy listo con la información del Radar de Gmail y la auditoría de la propuesta para responder cualquier duda de cuentas por pagar." }],
      },
    ];

    if (Array.isArray(messages)) {
      messages.forEach((m: any) => {
        contents.push({
          role: m.role === "assistant" || m.role === "model" ? "model" : "user",
          parts: [{ text: m.content }],
        });
      });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
    });

    return res.json({ reply: response.text || "No pude generar una respuesta en este momento." });
  } catch (error: any) {
    console.error("Error in audit chat:", error);
    return sendError(res, error, "Error processing chat message");
  }
});

// Vite or Static fallback
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Gemini model: ${GEMINI_MODEL}`);
    if (ACCESS_MODE === "enforce") {
      console.log(`Acceso restringido a ${ALLOW_RULES.length} regla(s) de ALLOWED_USERS.`);
    } else if (ACCESS_MODE === "deny_all") {
      console.error(
        "[error] ALLOWED_USERS no está definida en producción: los endpoints de IA responderán 503 hasta configurarla."
      );
    } else {
      console.warn(
        "[aviso] Sin ALLOWED_USERS fuera de producción: los endpoints de IA quedan abiertos (solo para desarrollo local)."
      );
    }
    if (!getApiKey()) {
      console.warn(
        "[aviso] GEMINI_API_KEY no está configurada. La UI y el radar cargan, pero los endpoints de IA responderán 503 hasta que la definas en .env.local."
      );
    }
  });
}

setupViteOrStatic().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
