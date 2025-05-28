# 1. Escoge una imagen base de Node.js. Las versiones 'slim' son más pequeñas.
# Considera usar una imagen base de Playwright directamente si prefieres: mcr.microsoft.com/playwright/javascript:v1.X.Y-focal
FROM node:18-slim
# O una más reciente como node:20-slim

# Variables de entorno
ENV NODE_ENV=production
# El puerto que tu app usa internamente en el contenedor
ENV PORT=3000

# Crea el directorio de la aplicación
WORKDIR /usr/src/app

# Copia package.json y package-lock.json (o yarn.lock)
COPY package*.json ./

# Instala las dependencias de la aplicación (solo producción)
# Usar 'ci' es mejor para builds reproducibles si tienes package-lock.json
RUN npm ci --omit=dev
# Si no tienes lockfile o prefieres: RUN npm install --production

# Instala las dependencias de sistema para Playwright (Chromium en este caso)
# Esto puede variar un poco según la imagen base de Node.
# El comando `npx playwright install --with-deps chromium` intenta hacer esto,
# pero a veces es mejor ser explícito.
# Para Debian/Ubuntu (como las 'slim' de Node):
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    # Dependencias adicionales que a veces son necesarias
    xvfb \
    fonts-liberation \
    libu2f-udev \
    # Limpia la caché de apt para reducir el tamaño de la imagen
    && rm -rf /var/lib/apt/lists/*

# Ahora instala Playwright y sus navegadores.
# `--with-deps` intentará instalar dependencias, pero ya lo hicimos arriba para mayor control.
# Si confías en que la imagen base + --with-deps es suficiente, puedes omitir el RUN apt-get install...
RUN npx playwright install --with-deps chromium
# Si solo necesitas Chromium:
# RUN npx playwright install chromium

# Copia el resto del código de tu aplicación
COPY . .

# Expone el puerto que tu aplicación escucha DENTRO del contenedor
EXPOSE ${PORT}

# Comando para ejecutar tu aplicación
CMD [ "npm", "start" ]