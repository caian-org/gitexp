FROM node:14.17.0-alpine AS base
MAINTAINER Caian R. Ertl <hi@caian.org>

RUN addgroup -S turing && adduser -S turing -G turing
RUN mkdir -p /home/turing
RUN chown turing:turing /home/turing
USER turing
WORKDIR /home/turing

FROM base AS package
USER root
COPY package.json .
COPY package-lock.json .
RUN apk add --virtual .vdeps git

FROM package AS prod-deps
RUN npm i --only=production
RUN chown -R turing:turing node_modules package.json package-lock.json
RUN apk del .vdeps

FROM package AS dev-deps
RUN npm i

FROM dev-deps AS build
COPY gitexp.ts .
COPY tsconfig.json .
RUN npm run build:js:release
RUN chown -R turing:turing lib

FROM prod-deps AS run
USER turing
COPY --from=build ["/home/turing/lib", "./lib"]
CMD ["node", "lib/gitexp.js"]
