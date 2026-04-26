FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4005

CMD ["npm", "run", "start", "--workspace", "services/chat-service"]
