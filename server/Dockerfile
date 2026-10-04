FROM node:22-alpine
ENV NODE_ENV=production
ENV ASSISTANT_PROVIDER=fake
WORKDIR /app
COPY LICENSE ./LICENSE
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server/ ./server/
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
