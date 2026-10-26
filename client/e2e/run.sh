#!/bin/sh
set -eu

client_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$client_dir/docker-compose.e2e.yml"
project_name=${E2E_COMPOSE_PROJECT_NAME:-blackboard-e2e-$$}

cleanup() {
    docker compose --project-name "$project_name" --file "$compose_file" down --volumes --remove-orphans
}

trap cleanup EXIT HUP INT TERM

docker compose --project-name "$project_name" --file "$compose_file" up \
    --build --detach --wait --wait-timeout 180
npm run test:e2e:run -- "$@"