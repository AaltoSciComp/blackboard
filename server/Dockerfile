FROM node:20-alpine as base
# Define build-time arguments
ARG TZ
# Set environment variables
ENV TZ=${TZ}
WORKDIR /srv/app/server
COPY *.json ./
EXPOSE 8080
RUN apk add tzdata

FROM base as production
ENV NODE_ENV production
RUN npm ci
COPY --chown=node:node . /srv/app/server
#COPY . /srv/app/server
USER node
CMD ["npm", "run", "start"]

# Development version adds extra libraries for building
FROM base as dev
ENV NODE_ENV=development
# These are needed for running in the linux-arm64 (Apple silicon etc.) environment
RUN apk --no-cache add --virtual builds-deps build-base python3
RUN npm install --include-dev
COPY . /srv/app/server
CMD ["npm", "run", "dev"]