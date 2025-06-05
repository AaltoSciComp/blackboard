FROM node:20-alpine as build-deps
# Define build-time arguments
ARG TZ
# Set environment variables
ENV TZ=${TZ}
# This is a workaround for Node 17.x issue. Remove when no longer needed.
# See https://github.com/webpack/webpack/issues/14532
#ENV NODE_OPTIONS=--openssl-legacy-provider
WORKDIR /srv/app/client

ARG USE_NGINX

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apk add tzdata
# Bundle app source
RUN npm install

COPY . ./

# Copy external libraries from node_modules to public/js for the viewer to use
RUN mkdir -p public/js && \
    cp node_modules/konva/konva.min.js public/js/ && \
    cp node_modules/socket.io-client/dist/socket.io.min.js public/js/ && \
    cp node_modules/toastify-js/src/toastify.js public/js/ && \
    cp node_modules/lz-string/libs/lz-string.min.js public/js/

RUN if [ $USE_NGINX = "true" ] ; then npm run build ; fi

# nginx
FROM nginx:stable-alpine
COPY --from=build-deps /srv/app/client/build /usr/share/nginx/html
EXPOSE ${NGINX_PORT}

CMD ["nginx", "-g", "daemon off;"]