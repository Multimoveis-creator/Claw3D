# Claw3D - 3D agent visualization for OpenClaw.
# Single-stage image intentionally used here to reduce temporary disk usage
# during builds on small Dokploy hosts and to keep TypeScript available at runtime
# for next.config.ts.

FROM node:22-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm cache clean --force

COPY . .

# Build-time gateway URL (overridden at runtime by CLAW3D_GATEWAY_URL).
ENV NEXT_PUBLIC_GATEWAY_URL=ws://127.0.0.1:18789
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/index.js"]
