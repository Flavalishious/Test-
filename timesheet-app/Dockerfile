FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY lib ./lib
COPY public ./public
COPY server.js ./
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
# The live spreadsheet, backups and archived weeks live here - mount a volume.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
