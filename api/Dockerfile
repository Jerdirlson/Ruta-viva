# Imagen del API de Ruta-viva.
#
# El contexto de build es la RAÍZ del repositorio (ver deploy/docker-compose.yml):
# la imagen necesita api/ y también web/, porque el API sirve la app desde el
# mismo origen. Dentro replicamos la disposición del repo (api/ y web/ hermanos
# bajo /app) para que server.js ubique web/ igual en local y en Docker.
FROM node:22-alpine

WORKDIR /app

# Dependencias primero: mientras package*.json no cambie, esta capa se reutiliza.
COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev && npm cache clean --force

COPY api/src ./api/src
COPY api/migrations ./api/migrations
COPY web ./web

WORKDIR /app/api

# Sin root dentro del contenedor: node:alpine trae el usuario `node`.
USER node

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
