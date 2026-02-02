# MCP Tax Server Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3107

EXPOSE 3107

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3107/health || exit 1

CMD ["node", "dist/index.js"]
