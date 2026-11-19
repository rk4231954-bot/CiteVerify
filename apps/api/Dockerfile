# CiteVerify API — production image (Railway). Build context: the repo root.
#
#   docker build -f apps/api/Dockerfile -t citeverify-api .
#
# The whole Bun workspace is installed because the API imports the workspace
# packages (database, engines, shared) as TypeScript source at runtime.
FROM oven/bun:1.4.4

# Prisma's migration engine (used by the pre-deploy `migrate deploy`) needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Generate the PostgreSQL Prisma client (DATABASE_URL is not needed to build).
ENV DATABASE_PROVIDER=postgresql

COPY . .
RUN bun install --frozen-lockfile \
  && bun run --cwd packages/database db:generate \
  && bun run --cwd apps/api build

ENV NODE_ENV=production
# Railway injects PORT; the server listens on 0.0.0.0:$PORT.
EXPOSE 3001
CMD ["bun", "apps/api/dist/index.js"]
