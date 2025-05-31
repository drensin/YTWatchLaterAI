# Use an official Node.js 20 runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 8080 

# Define the command to run your app
CMD [ "node", "server.js" ]
