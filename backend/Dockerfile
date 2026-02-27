# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências (incluindo devDependencies para compilar TypeScript)
COPY package*.json ./
RUN npm ci

# Copia código fonte e compila
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Apenas dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o JS compilado do stage anterior
COPY --from=builder /app/dist ./dist

# Porta exposta (Railway injeta $PORT automaticamente)
EXPOSE 3001

# Inicia o servidor compilado
CMD ["node", "dist/index.js"]
