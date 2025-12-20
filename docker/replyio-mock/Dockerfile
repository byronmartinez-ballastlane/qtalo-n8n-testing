FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install express body-parser

# Copy mock server code
COPY server.js ./

# Mount point for test data
VOLUME /app/test-data

EXPOSE 3002

CMD ["node", "server.js"]
