FROM node:24 AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.frontend.json vite.config.ts ./
COPY src ./src

RUN pnpm build

RUN rm -rf node_modules
RUN pnpm install --prod --frozen-lockfile

########################################

FROM node:24-slim AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
