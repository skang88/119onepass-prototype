# 1단계: 빌드 스테이지
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 2단계: 실행 스테이지 (Nginx)
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# 💡 이 부분이 핵심입니다! React 라우터가 작동하도록 Nginx 기본 설정을 덮어씁니다.
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]