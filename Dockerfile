FROM node:24 AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

########################################

FROM node:24-slim AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY templates ./templates
RUN mkdir -p /app/data

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
