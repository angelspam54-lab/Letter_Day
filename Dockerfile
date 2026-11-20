# Single container: Node serves the API, share pages/images and the built PWA.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production PORT=8080 CLIENT_DIST=/app/client/dist
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/assets server/assets
COPY --from=build /app/server/src/data server/src/data
EXPOSE 8080
USER node
CMD ["node", "server/dist/server/src/index.js"]
