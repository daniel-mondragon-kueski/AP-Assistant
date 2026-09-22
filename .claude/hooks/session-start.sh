#!/bin/bash
# SessionStart hook: prepares the AP Assistant workspace for Claude Code on the web.
# Installs npm dependencies so `npm run lint`, `npm run build` and `npm run dev`
# work immediately, and seeds a .env.local so the Express server boots.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Idempotent: npm install is a no-op when node_modules already matches package.json.
npm install --no-audit --no-fund

# Seed .env.local (git-ignored) from the example so the server starts without
# manual setup. The Gemini endpoints answer 503 until a real key is filled in.
if [ ! -f .env.local ]; then
  {
    echo "# Generado por .claude/hooks/session-start.sh"
    echo "# Sustituye el placeholder por una clave real de https://aistudio.google.com/apikey"
    echo "GEMINI_API_KEY="
    echo "GEMINI_MODEL=gemini-2.5-flash"
    echo "PORT=3000"
  } > .env.local
fi

echo "Entorno listo: npm run dev (servidor + Vite en http://localhost:3000)"
