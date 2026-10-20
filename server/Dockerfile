# Pin the Alpine flavor so builds don't silently switch OS versions (and their CVE sets)
FROM node:22-alpine3.24 AS base
# Define build-time arguments
ARG TZ
# Set environment variables
ENV TZ=${TZ}
WORKDIR /srv/app/server
COPY *.json ./
EXPOSE 8080
# Upgrade before adding packages so production/dev images carry the latest OS security fixes
RUN apk update && apk upgrade --no-cache && apk add --no-cache tzdata

FROM base AS production
ENV NODE_ENV=production
RUN npm ci
COPY --chown=node:node . /srv/app/server
#COPY . /srv/app/server
USER node
CMD ["npm", "run", "start"]

# Development version adds extra libraries for building
FROM base AS dev
ENV NODE_ENV=development
# These are needed for running in the linux-arm64 (Apple silicon etc.) environment
RUN apk --no-cache add --virtual builds-deps build-base python3
RUN npm install --include-dev
COPY . /srv/app/server
CMD ["npm", "run", "dev"]