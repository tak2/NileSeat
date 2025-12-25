# NileSeat – Hot Desk Booking (Next.js Option A)

This repository contains a minimal blueprint for the Option A stack: Next.js + NextAuth (Azure AD single-tenant) + PostgreSQL + Redis + Prisma + Nginx, packaged for Docker Compose on a VPS. It implements the three-screen MVP (Home, Booking Map, Admin) and enforces Microsoft 365 single-tenant SSO with email-based admin allowlisting.

## Features (MVP scope)
- **Home**: greeting, today’s booking, check-in button (when `status=Booked`), navigation to New Booking and Admin (admins only), optional cancel.
- **Booking (map-based)**: date picker (`today..today+3`), floor plan image with positioned desks (green available, red booked, gray unavailable), click to book if available.
- **Admin**: enable/disable desks, drag/update map coordinates, view/cancel bookings, mark no-shows, generate QR codes, book on behalf of any tenant user.
- **Rules**: one booking per desk/day; one booking per user/day; user can book up to 3 days in advance.

## Architecture
- **Frontend/UI**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + React Query.
- **API**: Next.js route handlers with Zod validation.
- **Auth**: NextAuth Azure AD provider with tenant lock (`AZURE_AD_TENANT_ID`); admin role from `Admins` table; session JWT stored in Redis.
- **Data**: PostgreSQL via Prisma (`Desks`, `Bookings`, `Admins`, `Tenants`, `AuditLog`).
- **Cache/Rate-limit**: Redis for session store, availability cache, rate limiting.
- **Reverse proxy**: Nginx (TLS termination, gzip/brotli, static caching).

## File map (key pieces)
- `docker-compose.yml` – web, nginx, postgres, redis services.
- `Dockerfile` – multi-stage build for Next.js.
- `deploy/nginx.conf` – TLS, proxy, static caching.
- `.env.example` – required environment variables.
- `prisma/schema.prisma` – data models and constraints.
- `prisma/seed.ts` – seed tenant/admin and sample desks.
- `app/api/auth/[...nextauth]/route.ts` – Azure AD single-tenant auth config.
- `app/lib/prisma.ts` – Prisma client singleton.

## Data model (Prisma)
- **Desks**: `deskCode` (PK), `status` (Available/Unavailable), `mapX`, `mapY`, `qrCodeValue`, `floorPlanId?`, timestamps.
- **Bookings**: `id` (cuid), `deskCode` FK, `bookedByEmail`, `bookedByName`, `bookingDate` (date), `status` (Booked/CheckedIn/CheckedOut/Cancelled/NoShow), `checkInTime?`, `checkOutTime?`, timestamps.
  - Uniqueness: one booking per desk/day; one booking per user/day.
- **Admins**: `email` (PK), `displayName?`, `addedBy?`, `addedAt`.
- **Tenants**: `tenantId` (PK), `domain` (unique), `displayName`, `active`.
- **AuditLog**: `actorEmail`, `action`, `entity`, `entityId`, `payload`, `timestamp`.

## AuthN/AuthZ flow
1. User hits app → NextAuth redirects to Azure AD (`https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/authorize`).
2. On callback, tenant ID claim (`tid`) must equal `AZURE_AD_TENANT_ID`.
3. Email resolved from `email` or `preferred_username`; must exist and match the tenant domain in the `Tenants` table.
4. Admin role assigned if email is present in `Admins` table; otherwise role = user.
5. Session is JWT-based, persisted in Redis; admin APIs re-check role server-side.

## API surface (MVP)
- `GET /api/me/today` → current user’s booking for today.
- `GET /api/desks?date=YYYY-MM-DD` → desks + availability for the date.
- `POST /api/bookings` → `{ deskCode, bookingDate }` (validates one per user/day, one per desk/day, ≤ today+3).
- `POST /api/bookings/:id/checkin` → marks CheckedIn for today bookings (QR or button driven).
- `POST /api/bookings/:id/cancel` → user or admin.
- **Admin**
  - `PATCH /api/admin/desks/:deskCode` → enable/disable or update coordinates.
  - `GET /api/admin/bookings?date=...` → list/filter bookings.
  - `POST /api/admin/bookings/on-behalf` → admin books for any user (tenant email check).
  - `POST /api/admin/bookings/:id/noshow` → mark no-show.
  - `POST /api/admin/qr/:deskCode` → generate/display QR.

## Quick start (local with Docker Compose)
1. Copy env vars: `cp .env.example .env` and fill values (`AZURE_AD_*`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NILESEAT_ADMIN_EMAIL`).
2. Install dependencies (optional locally): `npm install`.
3. Run migrations: `npx prisma migrate dev` (or `prisma migrate deploy` in CI).
4. Seed: `NILESEAT_ADMIN_EMAIL=you@example.com npx ts-node prisma/seed.ts`.
5. Start stack: `docker compose up --build`.
6. Browse: `https://your-domain.com` (Nginx proxies to `web:3000`).

## Deploying to a VPS (Docker Compose)
You can run the entire stack on a single VPS (Ubuntu/Debian or similar) with Docker and Docker Compose. Point your domain’s DNS (A/AAAA) to the VPS IP before starting so `NEXTAUTH_URL` and TLS termination work.

### Required environment variables
- `NEXTAUTH_URL` – public URL of the app (e.g., `https://desks.example.com`).
- `NEXTAUTH_SECRET` – 32+ char random string; generate with `openssl rand -base64 32`.
- `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` / `AZURE_AD_TENANT_ID` – Azure AD app credentials locked to your tenant.
- `DATABASE_URL` – Postgres connection string. The default (`postgresql://nileseat:nileseat@db:5432/nileseat`) points at the bundled container.
- `REDIS_URL` – Redis connection string (`redis://redis:6379` for the bundled container).
- `NODE_ENV` – `production`.
- `NILESEAT_ADMIN_EMAIL` – email to seed as the first admin (must belong to your tenant).

### One-time setup script (run on the VPS)
```bash
# install docker + compose plugin (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker

# pull code and create env file
git clone https://github.com/your-org/NileSeat.git
cd NileSeat
cp .env.example .env
```

Edit `.env` with the values above (including `NILESEAT_ADMIN_EMAIL`). Generate `NEXTAUTH_SECRET` if needed:
```bash
openssl rand -base64 32
```

### Deploy/start the stack
```bash
# build and start (detached)
docker compose --env-file .env up -d --build

# run migrations against the running Postgres
docker compose exec web npx prisma migrate deploy

# seed initial admin (uses NILESEAT_ADMIN_EMAIL from .env)
docker compose exec -e NILESEAT_ADMIN_EMAIL web npx ts-node prisma/seed.ts
```

### Update/redeploy script
```bash
cd /path/to/NileSeat
git pull
docker compose --env-file .env pull          # optional: refresh base images
docker compose --env-file .env up -d --build # rebuild app
docker compose exec web npx prisma migrate deploy
```

### Operational tips on a VPS
- Place TLS certificates where Nginx can read them and wire them into `deploy/nginx.conf` (or use `certbot` + a companion container).
- Backup volumes: Postgres (`db` service) and Redis (`redis` service) are volume-backed; snapshot those regularly.
- Monitor: tail app logs with `docker compose logs -f web nginx`; add metrics/alerting as needed.

## Operational notes
- Enforce HTTPS in Nginx; include HSTS and CSP headers for production.
- Rate limit auth and booking mutations via Nginx and Redis.
- Back up Postgres daily (`pg_dump`); enable Redis AOF persistence.
- Use object storage or `public/` for floor plan assets and QR exports.
- Observability: pino/structured logs, health endpoint, optional OTEL/Prometheus.

## Next steps to make it production-ready
- Add Zod validation to each route handler.
- Add rate limiter middleware (Redis-backed) for bookings/auth.
- Implement QR check-in redirect: `/qr?desk=<code>` → auth → server-side CheckedIn.
- Add Playwright smoke tests for the three screens; add `supertest` for API.
- Harden CSP/headers and add audit log writes on admin actions and mutations.
