# Multi-stage Next.js build for NileSeat
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
  elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  else npm install; fi

FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build || true

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
