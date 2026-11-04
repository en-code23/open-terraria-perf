# Open-Terraria — Web-Container (Spiel + Caddy). Gebaut von deploy/docker-compose.yml.
# Stufe 1: Spiel bauen (ohne Service Worker — der Server liefert alle Dateien direkt)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV VITE_NO_SW=1 \
    NODE_OPTIONS=--max-old-space-size=6144
RUN npx vite build --outDir /out --emptyOutDir --logLevel warn \
 && rm -f /out/sw.js /out/_headers /out/_redirects

# Stufe 2: Caddy liefert das Spiel aus (HTTPS automatisch, wenn SITE_ADDRESS eine Domain ist)
FROM caddy:2.8-alpine
COPY deploy/caddy/ /etc/caddy/
COPY --from=build /out /srv
