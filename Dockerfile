FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node src/lib/commissionPricing.js ./src/lib/commissionPricing.js
EXPOSE 10000
USER node
CMD ["node", "server/index.js"]
