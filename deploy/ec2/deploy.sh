#!/usr/bin/env bash
set -Eeuo pipefail

app_dir="/opt/devops-api"
nginx_config="$app_dir/nginx/api.conf"
state_file="$app_dir/active-slot"

if [[ $# -ne 1 || ! "$1" =~ ^[A-Za-z0-9._/-]+:[a-fA-F0-9]{40}$ ]]; then
  echo "Uso: deploy.sh usuario/repositorio:<SHA completo de 40 caracteres>" >&2
  exit 2
fi
image="$1"

exec 9>"$app_dir/deploy.lock"
if ! flock -n 9; then
  echo "Ya hay un despliegue en curso; no se aplicaron cambios." >&2
  exit 1
fi

if ! docker container inspect api-proxy >/dev/null 2>&1; then
  echo "No existe api-proxy. Ejecuta primero deploy/ec2/bootstrap.sh." >&2
  exit 1
fi
active=""
if [[ -f "$state_file" ]]; then
  active="$(<"$state_file")"
fi
case "$active" in
  "") target="blue"; target_port=3001 ;;
  blue) target="green"; target_port=3002 ;;
  green) target="blue"; target_port=3001 ;;
  *)
    echo "Estado de slot no válido en $state_file: $active" >&2
    exit 1
    ;;
esac

container="api-$target"
docker pull "$image"
if docker container inspect "$container" >/dev/null 2>&1; then
  if [[ "$(docker inspect -f '{{.State.Running}}' "$container")" == true ]]; then
    docker stop --time 110 "$container"
  fi
  docker rm "$container"
fi
docker run -d \
  --name "$container" \
  --restart unless-stopped \
  --label "com.integrador.image=$image" \
  --publish "127.0.0.1:${target_port}:3000" \
  "$image"

ready=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error \
    "http://127.0.0.1:${target_port}/api/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != true ]]; then
  echo "La nueva instancia no pasó su health check; se conserva el tráfico actual." >&2
  docker logs "$container" >&2
  docker rm -f "$container"
  exit 1
fi

if [[ -f "$nginx_config" ]]; then
  cp "$nginx_config" "$app_dir/api.conf.backup"
fi
sed "s/127\.0\.0\.1:[0-9]*/127.0.0.1:${target_port}/" \
  "$app_dir/nginx/api.conf" > "$app_dir/api.conf.next"
mv "$app_dir/api.conf.next" "$nginx_config"

if ! docker exec api-proxy nginx -t; then
  mv "$app_dir/api.conf.backup" "$nginx_config"
  docker rm -f "$container"
  echo "Nginx rechazó la nueva configuración; se restauró la versión anterior." >&2
  exit 1
fi
if ! docker exec api-proxy nginx -s reload; then
  mv "$app_dir/api.conf.backup" "$nginx_config"
  docker exec api-proxy nginx -s reload
  docker rm -f "$container"
  echo "Falló la recarga de Nginx; se revirtió al backend anterior." >&2
  exit 1
fi

printf '%s\n' "$target" > "$state_file"
rm -f "$app_dir/api.conf.backup"

echo "Despliegue completado: $image está activo en el slot $target (puerto $target_port); el slot anterior queda como reserva."
