FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 8081

CMD ["npm", "run", "web", "--", "--host", "lan", "--port", "8081"]
