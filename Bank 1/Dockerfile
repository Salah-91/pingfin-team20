FROM node:20-alpine
WORKDIR /app

# Install deps eerst (cache)
COPY package*.json ./
RUN npm install --omit=dev

# Daarna de rest van de bank-code (incl. ./public voor GUI)
COPY . .

ENV NODE_ENV=production
EXPOSE 8089
CMD ["node", "server.js"]
