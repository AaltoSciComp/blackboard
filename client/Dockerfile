# Pin the Alpine flavor so builds don't silently switch OS versions (and their CVE sets)
FROM node:22-alpine3.24 AS build-deps
# Define build-time arguments
ARG TZ
# Set environment variables
ENV TZ=${TZ}
WORKDIR /srv/app/client

# NOTE: must be declared before the first instruction that uses it
ARG USE_NGINX

# In production builds (USE_NGINX=true), refresh the OS packages so the image
# carries the latest security fixes even if the base image layers are cached.
# Skipped for development builds to keep them fast with fewer pull attempts.
RUN if [ "$USE_NGINX" = "true" ] ; then apk update && apk upgrade --no-cache ; fi

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apk add --no-cache tzdata
# Bundle app source
RUN npm install

COPY . ./

# NOTE: The viewer page (viewer.html + src/viewer/*) used to load Konva,
# socket.io-client, Toastify and LZString as plain script tags copied into
# public/js. It is now bundled by Vite from node_modules like the presenter
# app, so no manual library copies are needed anymore.

RUN if [ $USE_NGINX = "true" ] ; then npm run build ; fi

# nginx
# This is the image that actually runs in production, so keep OS packages current
FROM nginx:stable-alpine
RUN apk update && apk upgrade --no-cache
COPY --from=build-deps /srv/app/client/build /usr/share/nginx/html
EXPOSE ${NGINX_PORT}

CMD ["nginx", "-g", "daemon off;"]