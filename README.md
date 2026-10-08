# Proyecto integrador: API REST y pipeline CI/CD

API REST de usuarios construida con Node.js 22 y Express. GitHub Actions ejecuta pruebas y cobertura en cada `push` o `pull_request` hacia `main`; solo publica y despliega después de un `push` válido a esa rama.

El panel web se sirve desde `/`. Permite crear, listar, editar y eliminar usuarios, buscar y filtrar el directorio, enviar mensajes entre usuarios y rechazar mensajes recibidos. En “Pruebas de la API”, el perfil de eliminación queda visible hasta pulsar “Hacer prueba de eliminaciones”. Las comprobaciones HTTP en vivo muestran sus resultados.

## API

| Método | Ruta | Resultado |
| --- | --- | --- |
| `GET` | `/api/health` | Estado de salud de la API |
| `POST` | `/api/users` | Crea un usuario; requiere `name` y `email` |
| `GET` | `/api/users` | Lista usuarios |
| `GET` | `/api/users/:id` | Consulta un usuario |
| `PUT` | `/api/users/:id` | Actualiza un usuario |
| `DELETE` | `/api/users/:id` | Elimina un usuario |
| `POST` | `/api/messages` | Envía un mensaje interno |
| `GET` | `/api/messages?userId=:id&folder=inbox` | Consulta la bandeja de entrada |
| `GET` | `/api/messages?userId=:id&folder=sent` | Consulta mensajes enviados |
| `PATCH` | `/api/messages/:id/reject` | El destinatario rechaza un mensaje |

Los usuarios y mensajes se guardan en memoria mientras la aplicación está activa. Se pierden al reiniciar o reemplazar el contenedor; esto satisface el alcance de la demostración, pero no ofrece persistencia. La mensajería es interna y no envía correo SMTP.

## Ejecutar localmente

Requisitos: Node.js 22 o superior y npm.

```bash
npm ci
npm test
npm start
```

`npm test` ejecuta pruebas de integración HTTP con Jest y Supertest. El pipeline falla si cualquiera de las métricas globales de cobertura —ramas, funciones, líneas o sentencias— queda por debajo del 70 %.

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/users `
  -H "Content-Type: application/json" `
  -d '{"name":"Ana Pérez","email":"ana@example.com"}'
curl http://localhost:3000/api/users
```

## Docker

```bash
docker build -t integrador-api-rest:local .
docker run --rm -p 3000:3000 integrador-api-rest:local
```

El `Dockerfile` instala solo dependencias de producción en la imagen final y ejecuta Node.js sin privilegios. `.dockerignore` excluye archivos locales, credenciales y artefactos de prueba.

## Arquitectura y despliegue

```text
Pull request o push a main
        |
        v
GitHub Actions: npm ci -> pruebas -> cobertura >= 70 %
        |
        +-- Pull request: termina tras validar
        |
        +-- Push a main: publica :latest y :<SHA completo> en Docker Hub
                                  |
                                  v
                       EC2 Ubuntu + Docker
                       Nginx :80 -> API azul :3001
                                  o API verde :3002
```

El despliegue inicia la API en el slot inactivo, espera su endpoint de salud y solo entonces cambia el upstream de Nginx. Si la nueva versión o la configuración de Nginx falla, conserva o restaura el backend activo. Blue-green reduce la interrupción al actualizar, pero no elimina el punto único de fallo de una instancia EC2.

## Configuración de GitHub y Docker Hub

1. Crea en Docker Hub el repositorio `integrador-api-rest` y un Access Token con permiso de escritura.
2. En **Settings → Secrets and variables → Actions**, configura:
   - `DOCKERHUB_USERNAME`: usuario de Docker Hub.
   - `DOCKERHUB_TOKEN`: Access Token.
   - `EC2_HOST`: IP pública o DNS de EC2.
   - `EC2_USER`: usuario Linux de la instancia, normalmente `ubuntu`.
   - `EC2_SSH_KEY`: clave privada SSH PEM/OpenSSH. Guárdala solo como secreto.
   - `EC2_KNOWN_HOSTS`: clave pública del host EC2 verificada por un canal confiable.
3. Protege `main` y exige que pase el trabajo de pruebas. Los pull requests no publican imágenes ni despliegan.
4. Si el repositorio Docker Hub es privado, el despliegue inicia sesión usando el token de Docker Hub por entrada estándar SSH; nunca lo escribe en el código.

## Preparar EC2 Ubuntu

1. Usa una instancia EC2 Ubuntu. En su Security Group permite TCP 22 solo desde las direcciones administrativas necesarias y TCP 80 desde los clientes previstos. No abras los puertos 3000, 3001 ni 3002 a Internet.
2. Conéctate por SSH con el usuario que usarás como `EC2_USER`. Copia el repositorio a la instancia y ejecuta desde su raíz:

   ```bash
   sudo bash deploy/ec2/bootstrap.sh
   ```

   El script instala Docker y configura Nginx en el puerto 80. Cierra y vuelve a abrir la sesión SSH para aplicar el grupo `docker`.
3. Verifica la clave del host EC2 desde una fuente confiable y guarda su línea en `EC2_KNOWN_HOSTS`; no desactives la verificación de host.
4. Configura los secretos requeridos y haz `push` a `main`. Tras la publicación y despliegue, valida `http://<IP-o-DNS-EC2>/api/health`.

El estado en memoria del proceso local no se transfiere a EC2. En la instancia remota, usuarios y mensajes se reinician al reemplazarse el contenedor durante un despliegue.

## Reporte académico

El borrador del reporte LaTeX está en [`report/reporte.tex`](report/reporte.tex). Personaliza la portada y añade capturas reales del pipeline, Docker Hub y EC2 antes de compilar el PDF en Overleaf.
