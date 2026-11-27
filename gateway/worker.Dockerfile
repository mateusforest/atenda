FROM node:26-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* && npm ci --omit=dev && mkdir -p /var/lib/atenda && chown node:node /var/lib/atenda
COPY gateway ./gateway
COPY lib ./lib
COPY dist/agent-rules.mjs dist/agent-models.mjs ./dist/
USER node
ENV ATENDA_STATE_DIR=/var/lib/atenda ATENDA_MEDIA_DIR=/media/data/media WA_AKG_URL=http://gateway:3000 ATENDA_CLOUD_VOICE=1
CMD ["node","gateway/atendimento.mjs"]
