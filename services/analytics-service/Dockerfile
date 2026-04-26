FROM node:20-alpine
WORKDIR /usr/src/app
COPY services/analytics-service/package*.json ./
RUN npm install --production
COPY shared ./shared
COPY services/analytics-service/. .
EXPOSE 3003
CMD ["node", "src/index.js"]