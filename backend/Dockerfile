FROM node:22-alpine

RUN apk add --no-cache git
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p /app/deployments /tmp/deployforge-builds

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
