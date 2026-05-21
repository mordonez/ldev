FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY local-nginx/nginx.conf /etc/nginx/nginx.conf
COPY local-nginx/default.conf /etc/nginx/ldev/default.conf
COPY local-nginx/docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/bin/sh", "/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
