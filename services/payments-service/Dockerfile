FROM node:20-alpine
WORKDIR /usr/src/app/services/payments-service
COPY services/payments-service/package*.json ./
RUN npm install --production
WORKDIR /usr/src/app
COPY shared ./shared
COPY services/payments-service ./services/payments-service
WORKDIR /usr/src/app/services/payments-service
EXPOSE 3002
CMD ["node", "src/index.js"]
