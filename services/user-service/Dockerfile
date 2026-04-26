FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4002

CMD ["npm", "run", "start", "--workspace", "services/user-service"]
