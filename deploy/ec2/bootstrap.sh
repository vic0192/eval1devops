#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Ejecuta este script con sudo: sudo bash bootstrap.sh" >&2
  exit 1
fi

deploy_user="${SUDO_USER:-}"
if [[ -z "$deploy_user" || "$deploy_user" == "root" ]]; then
  echo "Ejecuta el script con sudo desde la cuenta SSH que usará el pipeline." >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker container inspect api-proxy >/dev/null 2>&1; then
  echo "api-proxy ya existe; no se modificó la instalación para evitar interrumpir el tráfico." >&2
  exit 1
fi

apt-get update
apt-get install -y docker.io curl
systemctl enable --now docker
usermod -aG docker "$deploy_user"

install -d -m 0755 -o "$deploy_user" -g docker /opt/devops-api
install -d -m 0755 -o "$deploy_user" -g docker /opt/devops-api/nginx
install -m 0644 deploy/ec2/nginx.conf /opt/devops-api/nginx/api.conf

docker pull nginx:stable-alpine
docker run -d \
  --name api-proxy \
  --restart unless-stopped \
  --network host \
  --volume /opt/devops-api/nginx:/etc/nginx/conf.d:ro \
  nginx:stable-alpine

echo "Proxy Nginx activo en el puerto 80. Vuelve a iniciar sesión para aplicar el grupo docker."
