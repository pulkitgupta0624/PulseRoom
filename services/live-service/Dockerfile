FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4007

CMD ["npm", "run", "start", "--workspace", "services/live-service"]
