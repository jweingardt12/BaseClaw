# Stage 0: Build dashboard React app
FROM node:22-slim AS dashboard-build

WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ .
RUN npm run build

# Stage 1: Build TypeScript MCP server + UI apps
FROM node:22-slim AS build

WORKDIR /app/mcp-apps

COPY mcp-apps/package.json mcp-apps/package-lock.json ./
RUN npm ci

COPY mcp-apps/tsconfig.json mcp-apps/vite.config.ts mcp-apps/build-ui.js ./
COPY mcp-apps/src/ src/
COPY mcp-apps/ui/ ui/
COPY mcp-apps/server.ts mcp-apps/main.ts ./
COPY mcp-apps/assets/ assets/

RUN npm run build
RUN cp -r assets dist/assets

# Stage 2: Python runtime + Node.js for production
FROM python:3.11-slim

# Install Node.js 22
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright + Chromium for browser-based write operations
RUN playwright install --with-deps chromium

# Install Node production dependencies
COPY mcp-apps/package.json mcp-apps/package-lock.json /app/mcp-apps/
RUN cd /app/mcp-apps && npm ci --omit=dev

# Copy built Node artifacts
COPY --from=build /app/mcp-apps/dist /app/mcp-apps/dist

# Copy built dashboard
COPY --from=dashboard-build /app/dashboard/dist /app/dashboard/dist

# Copy Python scripts
COPY scripts/ /app/scripts/

# Create config and data dirs (contents provided via volume mounts at runtime)
RUN mkdir -p /app/config /app/data
COPY config/ /app/config/

RUN chmod +x /app/scripts/*.py

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 4951

ENTRYPOINT ["/app/entrypoint.sh"]
