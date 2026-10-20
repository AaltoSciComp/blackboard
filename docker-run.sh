#!/bin/sh

export USER_ID=`id -u`
. ./.env
export NODE_PORT_PROD NGINX_PORT NGINX_HOST TZ
# --pull: always fetch the newest base images (node, nginx) so production gets
# the latest security fixes. Layer caching is still used for everything after
# the changed base, and the Dockerfiles run "apk upgrade" so cached layers
# cannot keep stale, vulnerable OS packages.
docker compose build --pull
docker stack deploy -c docker-compose.yml bb