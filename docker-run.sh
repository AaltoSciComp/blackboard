#!/bin/sh

export USER_ID=`id -u`
. ./.env
export NODE_PORT_PROD NGINX_PORT NGINX_HOST TZ
docker compose build
docker stack deploy -c docker-compose.yml bb