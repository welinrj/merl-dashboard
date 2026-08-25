# DoCC MERL — record translation worker
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY protect.js provider.js worker.js server.js ./

ENV NODE_ENV=production \
    PORT=8081

EXPOSE 8081

HEALTHCHECK --interval=60s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
