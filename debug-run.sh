#!/bin/sh

# Development startup: base images are intentionally NOT re-pulled on every run
# (debug-compose.yml uses pull_policy: build, and plain layer caching means a
# base image is only re-pulled when the cache actually needs it). Security
# scans of these local dev images can therefore show findings — that is
# acceptable; production freshness is handled by docker-run.sh (--pull).
export USER_ID=`id -u`
docker compose --progress=plain -f debug-compose.yml up