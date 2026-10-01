# Stage 1: build the React client (skipped gracefully if client/ isn't there yet)
FROM node:24-slim AS client
WORKDIR /app
COPY . .
RUN if [ -f client/package.json ]; then \
      cd client && npm ci && npm run build; \
    else \
      mkdir -p client/dist; \
    fi

# Stage 2: API server that also serves client/dist
FROM node:24-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=client /app/client/dist /app/client/dist
VOLUME /app/server/data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.js"]
