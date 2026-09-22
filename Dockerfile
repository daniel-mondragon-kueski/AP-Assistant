# No `# syntax=` directive on purpose: nothing here needs a BuildKit frontend
# feature, and requiring one means pulling an extra image before the build can
# even start, which fails behind a restricted registry proxy.

# Two stages so the build toolchain (Vite, esbuild, TypeScript) never ships in
# the final image: it only needs Node plus the runtime dependencies.

# ---------- Build ----------
FROM node:22-slim AS builder

WORKDIR /app

# Copy only the manifests first so `npm ci` is cached until they change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Produces dist/ (the Vite client bundle) and dist/server.cjs (the Express server).
RUN npm run build

# ---------- Runtime ----------
FROM node:22-slim AS runtime

# Selects the static-file branch in server.ts instead of the Vite dev
# middleware, and makes npm install only production dependencies below.
ENV NODE_ENV=production

# Cloud Run injects PORT; this default keeps the image runnable on its own.
ENV PORT=8080

WORKDIR /app

# `npm ci --omit=dev` rather than a hand-listed set of runtime packages: the
# server bundle is built with --packages=external, so its imports (express,
# @google/genai, dotenv, zod) resolve from node_modules at runtime. Listing
# them by hand would break at container start, not at build time, whenever a
# dependency is added. The cost is that a few build-only packages that live in
# `dependencies` also get installed.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist

# The node image ships an unprivileged `node` user; the app only reads its own
# files, so it needs no write access to /app.
USER node

EXPOSE 8080

CMD ["node", "dist/server.cjs"]
