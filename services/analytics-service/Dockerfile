FROM node:20-alpine
WORKDIR /usr/src/app/services/analytics-service
COPY services/analytics-service/package*.json ./
RUN npm install --production
WORKDIR /usr/src/app
COPY shared ./shared
COPY services/analytics-service ./services/analytics-service
WORKDIR /usr/src/app/services/analytics-service
EXPOSE 3003
CMD ["node", "src/index.js"]
