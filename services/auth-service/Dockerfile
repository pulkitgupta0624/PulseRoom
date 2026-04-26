FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4001

CMD ["npm", "run", "start", "--workspace", "services/auth-service"]
