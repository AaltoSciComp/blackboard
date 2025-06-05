#!/bin/sh

export USER_ID=`id -u`
docker compose --progress=plain -f debug-compose.yml up