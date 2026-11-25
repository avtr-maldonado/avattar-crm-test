# syntax=docker/dockerfile:1
# Imagen de producción del CRM Avattar (decisiones §70; docs/OPERACION.md). Build standalone de
# Next.js; Prisma va dentro con su motor para Debian. Calcada de la de AVTR Tempo.
FROM node:22-bookworm-slim AS base
# openssl: Prisma lo usa para elegir y cargar su motor.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
# pnpm-workspace.yaml lleva `allowBuilds` y la cuarentena: sin él pnpm no corre los postinstall de
# Prisma ni de esbuild.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
# Next incrusta las NEXT_PUBLIC_* al construir.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `pnpm build` = prisma generate + next build. Ninguno de los dos se conecta a la base.
RUN pnpm build

# Para lo que se corre a mano contra la base: catálogos y administradores, y la prueba de «al día».
#   docker compose run --rm herramientas pnpm db:seed:catalogos --env /dev/null --dry-run --admin "…"
FROM build AS herramientas
ENV NODE_ENV=production
CMD ["sh"]

FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3132 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3132
CMD ["node", "server.js"]
