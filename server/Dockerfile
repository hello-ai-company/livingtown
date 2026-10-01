FROM node:22-alpine
ENV NODE_ENV=production
ENV ASSISTANT_PROVIDER=fake
WORKDIR /app
COPY --chown=node:node server/ ./server/
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
