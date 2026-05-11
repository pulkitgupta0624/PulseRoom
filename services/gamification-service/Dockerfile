FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 4009

CMD ["npm", "run", "start", "--workspace", "services/gamification-service"]
