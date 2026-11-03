FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY api ./api
COPY web ./web
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "api/server.js"]
