FROM node as builder
WORKDIR /app
COPY package.json package.json
COPY package-lock.json package-lock.json
RUN npm ci
COPY . .
RUN npm run build

FROM nginx
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
