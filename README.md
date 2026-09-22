# Asistente de Operaciones Financieras y Cuentas por Pagar (AP)

Agente de IA para operaciones de Cuentas por Pagar en Kueski:

- **Radar de Pagos Gmail** — lee solicitudes de pago del inbox (plantillas `[PAGO URGENTE]` y `[ADELANTO DE PAGO]`, incluyendo correos con tablas multi-orden) y las estructura con Gemini.
- **Auditoría de Propuestas Semanales** — cruza el archivo `Propuesta de pago Semana X.xlsx` (pestañas SOFOM, INC, TECH) contra el radar, detecta faltantes críticos, duplicados y anomalías, y calcula totales por entidad.
- **Redacción de correos** — genera el borrador formal de aprobación y puede crearlo directamente en Gmail.
- **Chat de auditoría** — preguntas en lenguaje natural sobre pagos pendientes, liquidados, totales y discrepancias.

## Arquitectura

| Pieza | Descripción |
| --- | --- |
| `server.ts` | Servidor Express. Sirve el frontend (Vite en middleware mode en dev, `dist/` en producción) y expone los endpoints de IA. |
| `src/` | Frontend React 19 + Tailwind 4. |
| `src/services/excelParser.ts` | Parseo y auditoría del Excel semanal (xlsx), sin dependencias de navegador. |
| `src/services/gmail.ts` | Cliente de la API de Gmail (lectura de correos y creación de borradores). |
| `src/services/firebaseAuth.ts` | Login con Google vía Firebase Auth para obtener el token de Gmail. |
| `src/utils/paymentMatcher.ts` | Detección de duplicados y estado de vencimiento. |
| `src/schemas/` | Validación con Zod en las fronteras de datos externos (ver abajo). |

## Validación de datos externos

`strict` de TypeScript solo cubre lo que el compilador puede ver. Los datos que
entran en runtime —respuestas de Gemini, cuerpos HTTP y `localStorage`— se
validan con Zod en `src/schemas/`:

| Frontera | Esquema | Comportamiento ante datos inválidos |
| --- | --- | --- |
| Respuestas de Gemini (`orders`) | `orders.ts` | Valida orden por orden. Las inservibles se **reportan** (`skipped`) y las que perdieron el monto se marcan (`warnings`); la UI muestra los conteos. Una orden desaparecida en un radar de pagos es un pago que nadie vuelve a ver. |
| Cuerpos de petición | `api.ts` | **400** con el campo y el motivo. Un correo malformado dentro del lote se descarta sin tumbar el escaneo completo. |
| Respuestas de la API en el navegador | `api.ts` | Error explícito antes de llegar al estado de React: HTTP 200 no garantiza la forma del cuerpo. |
| `localStorage` | `storage.ts` | Degrada a los valores por omisión. Los registros corruptos se descartan de forma individual para no perder el radar guardado completo. |

Detalles que valen la pena conocer:

- **`parseMonetaryValue`** desambigua el formato latino (`$2.689,95`) del
  estadounidense (`$2,689.95`) en lugar de asumir uno: el separador más a la
  derecha es el decimal. Un separador único seguido de exactamente 3 dígitos se
  trata como agrupación, porque una divisa lleva máximo 2 decimales
  (`2.689` → `2689`). Nunca devuelve `NaN`.
- Los montos **negativos pasan**, porque el auditor los reporta como anomalías;
  rechazarlos ahí escondería justo las filas que debe señalar.
- Las **filas del Excel no se validan con Zod** a propósito. El objetivo del
  auditor es *reportar* hojas sucias (montos negativos, celdas vacías), así que
  rechazar el archivo sería lo contrario de lo que se necesita; esa
  normalización vive en `excelParser.ts`.

### Endpoints del backend

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servidor, si hay clave de Gemini y qué modelo se usa. |
| `POST` | `/api/analyze-emails` | Clasifica y extrae órdenes de pago de un lote de correos. |
| `POST` | `/api/generate-draft-content` | Redacta asunto y cuerpo del correo de solicitud de pago. |
| `POST` | `/api/audit-chat` | Chat de auditoría con el radar y el Excel como contexto. |

Los tres endpoints de IA responden **503** con un mensaje explícito si no hay `GEMINI_API_KEY` configurada.

## Requisitos

- Node.js 20 o superior (probado con Node 22).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y coloca tu GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

La clave de Gemini se obtiene en https://aistudio.google.com/apikey.

> Sin `GEMINI_API_KEY` la app arranca igual: la UI, el radar de demo y la auditoría del Excel
> (incluida la demo "Semana 38") funcionan completos porque son lógica local. Solo los
> endpoints de IA quedan deshabilitados.

### Variables de entorno

Se leen de `.env.local` (prioridad) y luego de `.env`. Ambos están en `.gitignore`.

| Variable | Requerida | Por defecto | Descripción |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Sí, para IA | — | Clave de la API de Gemini. También se aceptan `GOOGLE_API_KEY` o `API_KEY`. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Modelo usado por todos los endpoints. |
| `PORT` | No | `3000` | Puerto del servidor Express. |
| `APP_URL` | No | — | URL pública donde se hospeda la app. |

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor Express + Vite con HMR en `http://localhost:3000`. |
| `npm run lint` | Chequeo de tipos con `tsc --noEmit`. |
| `npm test` | 60 pruebas de la lógica pura y de los esquemas de validación (`node:test` vía `tsx`). |
| `npm run build` | Compila el frontend a `dist/` y el servidor a `dist/server.cjs`. |
| `npm start` | Ejecuta el build de producción (usar con `NODE_ENV=production`). |
| `npm run clean` | Borra artefactos de build. |

Build y arranque en producción:

```bash
npm run build
NODE_ENV=production npm start
```

## Integración con Gmail

El login usa Firebase Auth con los scopes `gmail.readonly` y `gmail.compose`. La
configuración del proyecto vive en `firebase-applet-config.json`; el `oAuthClientId` se
puede sobrescribir desde la propia UI (se guarda en `localStorage`). El dominio desde el
que se sirve la app debe estar autorizado en la consola de Firebase para que el popup de
Google funcione.

## Claude Code

`.claude/hooks/session-start.sh` se ejecuta al abrir una sesión de Claude Code en la web:
instala dependencias y crea `.env.local` a partir del ejemplo, de modo que `npm run dev`,
`npm run lint` y `npm test` funcionen de inmediato.
