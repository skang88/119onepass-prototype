# 1단계: 빌드 스테이지
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 2단계: 실행 스테이지 (Nginx)
FROM nginx:alpine
# React 빌드 결과물인 dist(또는 build) 폴더를 Nginx 웹 루트로 복사
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]