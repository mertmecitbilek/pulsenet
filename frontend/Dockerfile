# ============================================================
# Frontend Dockerfile — Next.js 14 (multi-stage)
# Stage 1 (deps):    Install only production dependencies
# Stage 2 (builder): Build the Next.js app
# Stage 3 (runner):  Minimal runtime image
# ============================================================

# --- Stage 1: dependency installer ---
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

# --- Stage 2: builder ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle during `next build`
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Build the Next.js standalone bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Stage 3: production runner ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy only the standalone output and static assets
COPY --from=builder /app/public            ./public
COPY --from=builder /app/.next/standalone  ./
COPY --from=builder /app/.next/static      ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
