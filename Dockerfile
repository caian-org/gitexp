FROM node:16-alpine AS base
RUN apk add --no-cache git

FROM base AS package
COPY package.json .
COPY package-lock.json .

FROM package AS prod-deps
RUN apk add --no-cache curl
RUN curl -sf https://gobinaries.com/tj/node-prune | sh
RUN NODE_ENV="production" npm i --only=production
RUN node-prune

FROM package AS dev-deps
RUN npm i

FROM dev-deps AS build
COPY src sc
COPY tsconfig.json .
RUN npm run build:js

FROM base AS run
COPY --from=prod-deps ["/node_modules", "node_modules"]
COPY --from=build ["/dist/gitexp.js", "."]
ENTRYPOINT ["node", "gitexp.js"]
