# نسخة ناوي كحاوية: نفس ملفات الموقع المنشورة على GitHub Pages، بتتقدّم من nginx.
# هدفها أمان النقل: لو الاستضافة اتغيّرت، `docker build` و`docker run` كفاية. التطبيق نفسه ما بيحتاجش أي سيرفر.
#
#   docker build -t nawy .
#   docker run --rm -p 8080:80 nawy        # http://localhost:8080
#
# ملحوظة: الـ service worker والتثبيت كتطبيق بيحتاجوا HTTPS (أو localhost). في الإنتاج حط الحاوية ورا بروكسي TLS.

FROM node:22-alpine AS build
WORKDIR /src
COPY . .
# نفس خطوة البناء اللي بيستخدمها النشر على Pages: بتنسخ ملفات التطبيق فقط وبتفشل لو ملف ناقص.
RUN SITE_DIR=/out node scripts/build-site.js

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html
EXPOSE 80
