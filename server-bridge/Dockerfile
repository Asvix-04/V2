FROM node:18-alpine

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 5001

# Command to run Node server
CMD ["node", "src/app.js"]
