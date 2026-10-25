FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8900
ENV DATA_FILE=/data/data.json
VOLUME ["/data"]
EXPOSE 8900
CMD ["node", "server.js"]
