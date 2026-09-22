#!/usr/bin/env bash
#
# One-time GCP setup for deploying AP Assistant to Cloud Run from GitHub Actions.
#
# Idempotent: every step checks for what it creates, so re-running it after a
# partial failure is safe.
#
# Usage:
#   ./scripts/setup-gcp.sh                       # uses the defaults below
#   PROJECT_ID=otro-proyecto ./scripts/setup-gcp.sh
#
# It does NOT deploy anything. It prepares the project and prints the values
# to paste into the repository's Actions secrets and variables.
set -euo pipefail

# --- Configuration -----------------------------------------------------------

# Defaults to the project in firebase-applet-config.json, where Firebase Auth
# and the OAuth client already live.
PROJECT_ID="${PROJECT_ID:-gen-lang-client-0316877366}"
REGION="${REGION:-us-central1}"
GITHUB_REPO="${GITHUB_REPO:-daniel-mondragon-kueski/AP-Assistant}"

REPOSITORY="${REPOSITORY:-ap-assistant}"          # Artifact Registry repo
SERVICE="${SERVICE:-ap-assistant}"                # Cloud Run service
SECRET_NAME="${SECRET_NAME:-gemini-api-key}"
DEPLOYER_SA="${DEPLOYER_SA:-ap-assistant-deployer}"
RUNTIME_SA="${RUNTIME_SA:-ap-assistant-run}"
POOL="${POOL:-github}"
PROVIDER="${PROVIDER:-github-oidc}"

DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# --- Helpers -----------------------------------------------------------------

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[31mError: %s\033[0m\n' "$1" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 || fail "gcloud no está instalado. Instálalo desde https://cloud.google.com/sdk/docs/install"

gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
  || fail "No hay una cuenta activa en gcloud. Ejecuta: gcloud auth login"

step "Configuración"
info "Proyecto:      ${PROJECT_ID}"
info "Región:        ${REGION}"
info "Repositorio:   ${GITHUB_REPO}"
info "Cuenta activa: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"

gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1 \
  || fail "No se puede acceder al proyecto ${PROJECT_ID}. Verifica el ID y tus permisos."

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
info "Número:        ${PROJECT_NUMBER}"

# Cloud Run requires billing. An AI Studio project may not have it attached,
# and without this check the failure surfaces much later and less clearly.
step "Verificando facturación"
if gcloud beta billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)' 2>/dev/null | grep -qi true; then
  info "Facturación habilitada."
else
  fail "El proyecto ${PROJECT_ID} no tiene facturación habilitada, y Cloud Run la requiere.
    Habilítala en: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
fi

# --- 1. APIs -----------------------------------------------------------------

step "Habilitando APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  cloudbuild.googleapis.com \
  --project "${PROJECT_ID}"
info "Listo."

# --- 2. Artifact Registry ----------------------------------------------------

step "Repositorio de imágenes (Artifact Registry)"
if gcloud artifacts repositories describe "${REPOSITORY}" \
    --location "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  info "Ya existe: ${REPOSITORY}"
else
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location "${REGION}" \
    --description "Imágenes de AP Assistant" \
    --project "${PROJECT_ID}"
  info "Creado: ${REPOSITORY}"
fi

# --- 3. Secret for the Gemini key -------------------------------------------

step "Secreto para GEMINI_API_KEY"
if gcloud secrets describe "${SECRET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  info "Ya existe el secreto ${SECRET_NAME}."
  info "Para rotar la clave: printf 'NUEVA_CLAVE' | gcloud secrets versions add ${SECRET_NAME} --data-file=- --project ${PROJECT_ID}"
else
  gcloud secrets create "${SECRET_NAME}" --replication-policy=automatic --project "${PROJECT_ID}"
  info "Secreto ${SECRET_NAME} creado, todavía sin versiones."
  info "Añade la clave con:"
  info "  printf 'TU_CLAVE_DE_GEMINI' | gcloud secrets versions add ${SECRET_NAME} --data-file=- --project ${PROJECT_ID}"
fi

if ! gcloud secrets versions list "${SECRET_NAME}" --project "${PROJECT_ID}" \
      --filter='state:ENABLED' --format='value(name)' 2>/dev/null | grep -q .; then
  MISSING_SECRET_VERSION=1
  info "AVISO: el secreto no tiene ninguna versión habilitada. El despliegue fallará hasta que añadas una."
fi

# --- 4. Service accounts -----------------------------------------------------

step "Cuenta de servicio del despliegue (la que usa GitHub Actions)"
if gcloud iam service-accounts describe "${DEPLOYER_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  info "Ya existe: ${DEPLOYER_EMAIL}"
else
  gcloud iam service-accounts create "${DEPLOYER_SA}" \
    --display-name "AP Assistant deployer (GitHub Actions)" \
    --project "${PROJECT_ID}"
  info "Creada: ${DEPLOYER_EMAIL}"
fi

for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${DEPLOYER_EMAIL}" \
    --role "${role}" \
    --condition=None --quiet >/dev/null
  info "Rol concedido: ${role}"
done

step "Cuenta de servicio de ejecución (la que corre el contenedor)"
# A dedicated runtime identity instead of the Compute Engine default service
# account, which in many projects carries project-wide Editor. This one can
# only read the Gemini secret.
if gcloud iam service-accounts describe "${RUNTIME_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  info "Ya existe: ${RUNTIME_EMAIL}"
else
  gcloud iam service-accounts create "${RUNTIME_SA}" \
    --display-name "AP Assistant runtime (Cloud Run)" \
    --project "${PROJECT_ID}"
  info "Creada: ${RUNTIME_EMAIL}"
fi

gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --member "serviceAccount:${RUNTIME_EMAIL}" \
  --role roles/secretmanager.secretAccessor \
  --project "${PROJECT_ID}" --quiet >/dev/null
info "La cuenta de ejecución puede leer ${SECRET_NAME}."

# The deployer must be able to set the runtime identity on the service.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_EMAIL}" \
  --member "serviceAccount:${DEPLOYER_EMAIL}" \
  --role roles/iam.serviceAccountUser \
  --project "${PROJECT_ID}" --quiet >/dev/null
info "La cuenta de despliegue puede actuar como la de ejecución."

# --- 5. Workload Identity Federation ----------------------------------------

step "Workload Identity (autenticación sin llaves)"
if gcloud iam workload-identity-pools describe "${POOL}" \
    --location global --project "${PROJECT_ID}" >/dev/null 2>&1; then
  info "Ya existe el pool ${POOL}."
else
  gcloud iam workload-identity-pools create "${POOL}" \
    --location global \
    --display-name "GitHub Actions" \
    --project "${PROJECT_ID}"
  info "Pool ${POOL} creado."
fi

# The attribute-condition is the security boundary: without it, ANY repository
# on GitHub could obtain a token for this provider.
if gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
    --location global --workload-identity-pool "${POOL}" \
    --project "${PROJECT_ID}" >/dev/null 2>&1; then
  info "Ya existe el proveedor ${PROVIDER}; actualizando su condición."
  gcloud iam workload-identity-pools providers update-oidc "${PROVIDER}" \
    --location global \
    --workload-identity-pool "${POOL}" \
    --project "${PROJECT_ID}" \
    --attribute-condition "assertion.repository == '${GITHUB_REPO}'" \
    --quiet
else
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
    --location global \
    --workload-identity-pool "${POOL}" \
    --project "${PROJECT_ID}" \
    --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '${GITHUB_REPO}'"
  info "Proveedor ${PROVIDER} creado, restringido a ${GITHUB_REPO}."
fi

# Only this repository may impersonate the deployer — belt and braces with the
# attribute condition above.
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_EMAIL}" \
  --project "${PROJECT_ID}" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" \
  --quiet >/dev/null
info "Solo ${GITHUB_REPO} puede suplantar la cuenta de despliegue."

WIP="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

# --- Summary -----------------------------------------------------------------

cat <<SUMMARY

$(printf '\033[1m')Configuración de GCP terminada.$(printf '\033[0m')

Pega estos valores en GitHub, en
  https://github.com/${GITHUB_REPO}/settings/secrets/actions

  Secrets:
    GCP_WORKLOAD_IDENTITY_PROVIDER = ${WIP}
    GCP_SERVICE_ACCOUNT            = ${DEPLOYER_EMAIL}

  Variables:
    GCP_PROJECT_ID   = ${PROJECT_ID}
    GCP_REGION       = ${REGION}
    CLOUD_RUN_SA     = ${RUNTIME_EMAIL}
    ALLOWED_USERS    = los correos autorizados, separados por coma
                       (por ejemplo: daniel.mondragon@kueski.com, otra.persona@kueski.com)
    GEMINI_MODEL     = gemini-2.5-flash   (opcional)

SUMMARY

if [ -n "${MISSING_SECRET_VERSION:-}" ]; then
  cat <<PENDING
$(printf '\033[33m')Pendiente antes de desplegar:$(printf '\033[0m') el secreto ${SECRET_NAME} no tiene versión.
  printf 'TU_CLAVE_DE_GEMINI' | gcloud secrets versions add ${SECRET_NAME} --data-file=- --project ${PROJECT_ID}

PENDING
fi

cat <<NEXT
Después del primer despliegue, el inicio de sesión con Google no funcionará
hasta que añadas el dominio de la URL de Cloud Run en:
  - Firebase Auth > Settings > Authorized domains
  - El cliente OAuth > Authorized JavaScript origins
    https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}

Recuerda también que los scopes de Gmail están restringidos por Google: añade a
cada persona del equipo como test user en la pantalla de consentimiento de OAuth
para no pasar por el proceso de verificación.
NEXT
