# DoCC MERL — Redis caching sidecar
FROM node:20-alpine

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Application code.
COPY store.js app.js server.js ./

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

# Lightweight health check hitting the /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
