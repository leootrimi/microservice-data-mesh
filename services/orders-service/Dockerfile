FROM node:20-alpine
WORKDIR /usr/src/app
COPY services/orders-service/package*.json ./
RUN npm install --production
COPY shared ./shared
COPY services/orders-service/. .
EXPOSE 3001
CMD ["node", "src/index.js"]