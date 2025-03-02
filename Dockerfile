# Dockerfile for SSR Application
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build SvelteKit app
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built assets and server code
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./
COPY --from=build /app/core-monitor.js ./
COPY --from=build /app/endpoints.js ./
COPY --from=build /app/backend ./backend

# Install production dependencies only
RUN npm ci --only=production

EXPOSE 3000
CMD ["node", "backend/server.js"]
