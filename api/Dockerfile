FROM node:20-alpine
WORKDIR /app

# Install deps eerst (cache)
COPY api/package*.json ./api/
RUN cd api && npm install --omit=dev

# Daarna de rest van de bank-code + GUI (server.js host de GUI mee)
COPY api ./api
COPY gui ./gui

WORKDIR /app/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
