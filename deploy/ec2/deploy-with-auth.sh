#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 || ! "$1" =~ ^[a-z0-9._-]+$ ]]; then
  echo "Uso: deploy-with-auth.sh usuario-dockerhub usuario/repositorio:<SHA completo>" >&2
  exit 2
fi
username="$1"
image="$2"
if [[ ! "$image" =~ ^[a-z0-9._-]+/[a-z0-9][a-z0-9._-]*:[a-f0-9]{40}$ ]]; then
  echo "La imagen debe usar un repositorio Docker Hub y un SHA completo de 40 caracteres." >&2
  exit 2
fi

if ! IFS= read -r dockerhub_token; then
  echo "Se requiere el token de Docker Hub por entrada estándar." >&2
  exit 2
fi
if [[ -z "$dockerhub_token" ]]; then
  echo "El token de Docker Hub no tiene un formato válido." >&2
  exit 2
fi

docker_config="$(mktemp -d /tmp/devops-api-docker-config.XXXXXX)"
chmod 700 "$docker_config"
cleanup() {
  rm -rf -- "$docker_config"
}
trap cleanup EXIT

export DOCKER_CONFIG="$docker_config"
printf '%s' "$dockerhub_token" | docker login --username "$username" --password-stdin
unset dockerhub_token
bash /opt/devops-api/deploy.sh "$image"
