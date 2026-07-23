FROM node:18-alpine

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 5173

# Command to run React dev server
CMD ["npm", "run", "dev", "--", "--host"]
