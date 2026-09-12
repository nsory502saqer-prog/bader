# نظام إدارة طلبات الإعانات — صورة الإنتاج
#
# بناء متعدّد المراحل: أدوات البناء لا تصل الصورة النهائية، فتصغر مساحة
# الهجوم بقدر ما يصغر الحجم.
#
#   docker build -t bader-aid .
#   docker run --env-file .env -p 3000:3000 bader-aid

# ───────────────────────────── 1. الاعتماديات ─────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# `sharp` و`bcryptjs` يحتاجان أدوات بناء أصلية على Alpine.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild sharp

# ───────────────────────────── 2. البناء ─────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# عميل Prisma يُولَّد قبل البناء لأن الكود يستورد أنواعه.
RUN npx prisma generate

# مفاتيح وهمية للبناء فقط: Next يقيّم الوحدات وقت البناء ولا يتصل بشيء.
# القيم الحقيقية تأتي من البيئة وقت التشغيل.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"

RUN npm run build

# ───────────────────────────── 3. التشغيل ─────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat postgresql17-client tzdata
ENV TZ=Asia/Riyadh
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# مستخدم غير جذر: ثغرة في التطبيق لا تعني صلاحية جذر على الحاوية.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# المخطط والترحيلات لازمة لتشغيل `prisma migrate deploy` عند الإقلاع،
# والسكربتات لازمة للعامل والنسخ الاحتياطي.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# مجلد المرفقات حين يكون المزوّد محليًا — يُركَّب كوحدة تخزين دائمة.
RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# فحص صحة: المنسّق يعرف أن الحاوية حيّة فعلًا لا أن العملية قائمة فقط.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
