FROM node:24.21.0-bookworm-slim
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev
COPY api/src ./src
COPY demo /demo
COPY n8n/risk_engine.js /n8n/risk_engine.js
ENV PORT=8787 HOST=0.0.0.0 DATABASE_PATH=/data/sheshield.sqlite DEMO_PATH=/demo/kolkata_scenario.json
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "src/server.js"]
