FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4008

CMD ["npm", "run", "start", "--workspace", "services/admin-service"]
