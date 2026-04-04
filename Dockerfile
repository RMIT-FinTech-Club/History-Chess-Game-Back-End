FROM node:20-alpine AS base

# Install dependencies and build
FROM base AS builder
WORKDIR /app

# Copy package and lock files
COPY package.json package-lock.json ./
# Install ALL dependencies, including dev (we need tsc and prisma)
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy the rest of the application
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the TypeScript application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production dependencies or reinstall them
COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps

# Copy generated Prisma files and build artifacts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist

# Expose backend port - adjust if your server uses a different port internally
EXPOSE 8080 
ENV PORT=8080

CMD ["node", "dist/server.js"]
