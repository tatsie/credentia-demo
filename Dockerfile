FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 STORAGE_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000
# Seeds once (no-op if the database already has users), then starts the server.
CMD ["sh", "-c", "node src/seed.js ${SEED_MODE:+--$SEED_MODE} && node src/index.js"]
