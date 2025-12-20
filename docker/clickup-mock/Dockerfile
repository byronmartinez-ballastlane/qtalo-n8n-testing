FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install express body-parser

# Copy mock server code
COPY server.js ./

EXPOSE 3001

CMD ["node", "server.js"]
