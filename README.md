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
| `src/schemas/access.ts` | Lista de acceso: qué correos pueden usar los endpoints de IA. |

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

Los tres endpoints de IA (todos menos `/api/health`) exigen el ID token de
Firebase de quien llama y comprueban su correo contra `ALLOWED_USERS`; ver
[Modelo de acceso](#modelo-de-acceso). Responden **401** sin token válido,
**403** si el correo no está autorizado, **400** si el cuerpo está malformado y
**503** si falta `GEMINI_API_KEY`.

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
| `ALLOWED_USERS` | Sí en producción | — | Correos y/o dominios autorizados, separados por coma. Vacía en producción cierra los endpoints de IA; vacía en desarrollo los deja abiertos. |
| `FIREBASE_PROJECT_ID` | No | El de `firebase-applet-config.json` | Proyecto contra el que se validan los ID tokens. |
| `APP_URL` | No | — | URL pública donde se hospeda la app. |

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor Express + Vite con HMR en `http://localhost:3000`. |
| `npm run lint` | Chequeo de tipos con `tsc --noEmit`. |
| `npm test` | 75 pruebas de la lógica pura, los esquemas de validación y la lista de acceso (`node:test` vía `tsx`). |
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

## Despliegue (Cloud Run)

El `Dockerfile` es multi-stage: el stage de build compila con Vite y esbuild, y
el de runtime solo lleva Node, las dependencias de producción y `dist/`. Corre
como usuario sin privilegios y escucha en `$PORT` (Cloud Run inyecta `8080`).

Para probar la imagen en local:

```bash
docker build -t ap-assistant .
docker run --rm -p 8080:8080 \
  -e GEMINI_API_KEY=tu_clave \
  -e ALLOWED_USERS=tu.correo@kueski.com \
  ap-assistant
```

El despliegue lo hace `.github/workflows/deploy.yml`, **manual** desde la
pestaña Actions (`Run workflow`). Es manual a propósito: no hay entorno de
staging, así que cada despliegue va directo a quien use la herramienta. Para
desplegar en cada merge a `main`, el propio archivo indica qué añadir.

### Modelo de acceso

El servicio se despliega con `--allow-unauthenticated`, y eso **no es una
relajación de seguridad**: un servicio de Cloud Run que exige autenticación
rechaza la petición de un navegador, porque el browser no adjunta el token
bearer que Cloud Run espera. Con `--no-allow-unauthenticated` la página no
cargaría para nadie, y conceder `run.invoker` no lo cambia.

La restricción vive dentro de la app:

1. La UI exige inicio de sesión con Google (Firebase Auth).
2. Cada llamada a `/api/*` lleva el **ID token** de Firebase de quien la hace.
3. El servidor verifica ese token contra las claves públicas de Google
   (emisor, audiencia, expiración, firma y `email_verified`) y comprueba el
   correo contra `ALLOWED_USERS`.
4. Si no está en la lista: **403** con un mensaje claro, y queda registrado en
   los logs del servicio.

`ALLOWED_USERS` acepta correos completos (`persona@kueski.com`) y dominios
enteros (`@kueski.com`), separados por coma.

> **Falla cerrado:** si `ALLOWED_USERS` no está definida y `NODE_ENV` es
> `production`, los endpoints de IA responden 503 en lugar de quedar abiertos.
> Fuera de producción la lista vacía deja todo abierto, para que `npm run dev`
> no requiera configuración.

`/api/health` queda deliberadamente abierto: no expone secretos, el smoke test
de CI lo consulta y la UI lee de ahí el nombre del modelo.

### Preparación en GCP (una sola vez)

Hay un script idempotente que hace todo el trabajo:

```bash
./scripts/setup-gcp.sh
```

Por omisión usa el proyecto `gen-lang-client-0316877366` (el de
`firebase-applet-config.json`, donde ya viven Firebase Auth y el cliente
OAuth) y la región `us-central1`. Para cambiarlos:

```bash
PROJECT_ID=otro-proyecto REGION=us-east1 ./scripts/setup-gcp.sh
```

El script habilita las APIs, crea el repositorio de Artifact Registry y el
secreto de la clave de Gemini, crea **dos** cuentas de servicio (una para
desplegar y otra, con permisos mínimos, para ejecutar el contenedor), configura
Workload Identity Federation restringido a este repositorio, y al final imprime
los valores exactos que hay que pegar en GitHub. Es seguro volver a correrlo.

Requiere `gcloud` instalado y una sesión activa (`gcloud auth login`), y
comprueba por adelantado que el proyecto tenga facturación habilitada, porque
Cloud Run la exige y un proyecto de AI Studio puede no tenerla.

### Configuración en GitHub

En *Settings > Secrets and variables > Actions*, con los valores que imprime
el script:

| Nombre | Tipo | Contenido |
| --- | --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Secret | `projects/…/providers/github-oidc` |
| `GCP_SERVICE_ACCOUNT` | Secret | La cuenta que despliega |
| `GCP_PROJECT_ID` | Variable | El ID del proyecto |
| `GCP_REGION` | Variable | Por ejemplo `us-central1` |
| `CLOUD_RUN_SA` | Variable | La cuenta con la que corre el contenedor |
| `ALLOWED_USERS` | Variable | Correos autorizados, separados por coma |
| `GEMINI_MODEL` | Variable (opcional) | Por omisión `gemini-2.5-flash` |

Si falta alguno, el workflow falla en el primer paso indicando cuál, en vez de
a medias durante el despliegue. Para cambiar quién tiene acceso, edita
`ALLOWED_USERS` y vuelve a ejecutar el workflow.

### Después del primer despliegue

El inicio de sesión con Google **no funcionará** hasta que añadas el dominio de
la URL de Cloud Run a los dominios autorizados de Firebase Auth y a los
orígenes de JavaScript del cliente OAuth.

Ten en cuenta además que los scopes de Gmail (`gmail.readonly`,
`gmail.compose`) son restringidos por Google: para usarlos sin pasar por el
proceso de verificación, añade a cada persona del equipo como *test user* en la
pantalla de consentimiento de OAuth.

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request:
`npm ci`, `npm run lint`, `npm test`, `npm run build` y un **smoke test del
servidor de producción** (arranca `dist/server.cjs`, verifica que
`/api/health` responda con la forma esperada y que el frontend compilado se
sirva). Ese último paso existe porque lint, test y build pasaron una vez
mientras el servidor de producción estaba roto, así que compilar no es
evidencia de que arranque. No requiere `GEMINI_API_KEY`.

## Claude Code

`.claude/hooks/session-start.sh` se ejecuta al abrir una sesión de Claude Code en la web:
instala dependencias y crea `.env.local` a partir del ejemplo, de modo que `npm run dev`,
`npm run lint` y `npm test` funcionen de inmediato.
