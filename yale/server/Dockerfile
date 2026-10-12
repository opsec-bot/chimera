FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY . .

# Non-root user
RUN useradd -r -s /bin/false appuser
USER appuser

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
