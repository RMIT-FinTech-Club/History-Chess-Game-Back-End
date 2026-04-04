FROM node:20-alpine

WORKDIR /app

# Copy package and lock files
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev tools like tsx/ts-node required for runtime)
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy the rest of the application
COPY . .

# Generate Prisma client
RUN npx prisma generate

# We don't run a build step because tsconfig.json has 'noEmit: true' and 'allowImportingTsExtensions: true'.
# TypeScript refuses to output JS files when importing .ts extensions natively.
# Therefore, we run the app using tsx natively just like local development.

ENV NODE_ENV=production

# Expose backend port
EXPOSE 8080 
ENV PORT=8080

CMD ["npx", "tsx", "src/server.ts"]
