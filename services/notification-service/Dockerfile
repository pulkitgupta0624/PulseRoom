FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4006

CMD ["npm", "run", "start", "--workspace", "services/notification-service"]
