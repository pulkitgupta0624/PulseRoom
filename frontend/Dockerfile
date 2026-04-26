FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "frontend", "--", "--host", "0.0.0.0"]
