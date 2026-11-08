FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY workers/connect-worker ./workers/connect-worker
COPY src/features/connect/server/*.mjs ./src/features/connect/server/
USER node
CMD ["node", "workers/connect-worker/index.mjs"]
