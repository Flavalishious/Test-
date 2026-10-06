FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY lib ./lib
COPY public ./public
COPY server.js ./
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
# The live spreadsheet, backups and archived weeks live here - mount a volume.
# Runs as root inside the container because hosted volumes (e.g. Railway) are
# mounted root-owned and a non-root user couldn't write the spreadsheet.
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
