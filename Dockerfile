# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package manifest and install dependencies
COPY package.json ./
RUN npm install

# Stage 2: Static Export Builder
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Static File Runner
FROM nginx:alpine AS runner

COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
