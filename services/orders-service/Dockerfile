FROM node:20-alpine
WORKDIR /usr/src/app/services/orders-service
COPY services/orders-service/package*.json ./
RUN npm install --production
WORKDIR /usr/src/app
COPY shared ./shared
COPY services/orders-service ./services/orders-service
WORKDIR /usr/src/app/services/orders-service
EXPOSE 3001
CMD ["node", "src/index.js"]
