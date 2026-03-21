# backend/Dockerfile
FROM node:20-alpine
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Ensure logs directory exists for winston file transport
RUN mkdir -p ./logs

ENV NODE_ENV=production
EXPOSE 5000

CMD ["npm", "start"]
