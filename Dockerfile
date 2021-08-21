FROM node:14.17.0-stretch AS base
MAINTAINER Caian R. Ertl <hi@caian.org>

FROM base AS package
COPY package.json .
COPY package-lock.json .
RUN apt-get install -y git

FROM package AS prod-deps
RUN npm i --only=production
RUN apt-get install -y libgssapi-krb5-2

FROM package AS dev-deps
RUN npm i

FROM dev-deps AS build
COPY src sc
COPY tsconfig.json .
RUN npm run build:js:release

FROM prod-deps AS run
COPY --from=build ["/lib/gitexp.js", "."]
CMD ["node", "gitexp.js"]
