FROM node:20-alpine
WORKDIR /usr/src/app
COPY services/payments-service/package*.json ./
RUN npm install --production
COPY shared ./shared
COPY services/payments-service/. .
EXPOSE 3002
CMD ["node", "src/index.js"]