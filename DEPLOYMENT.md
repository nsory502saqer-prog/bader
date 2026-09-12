# دليل النشر

نظام إدارة طلبات الإعانات — جمعية بادر للأجهزة الطبية.

> هذا النظام يحمل **هويات وطنية وبيانات صحية** لآلاف المستفيدين، ويخضع لنظام حماية البيانات الشخصية السعودي. النشر ليس خطوة تقنية فقط — راجع [قائمة ما قبل التشغيل](#قائمة-ما-قبل-التشغيل) كاملة قبل إدخال بيانات حقيقية.

---

## 1. أين يُستضاف

**داخل المملكة، دون استثناء.** الخيارات العملية:

| الخيار | ملاحظات |
|---|---|
| خادم في مركز بيانات سعودي | الأبسط لحجم 200 طلب شهريًا: خادم واحد بـ4 أنوية و8GB ذاكرة يكفي بفائض |
| سحابة بمنطقة سعودية | تأكد أن **كل** الخدمات في المنطقة نفسها: القاعدة والتخزين والنسخ |
| خادم داخل مقر الجمعية | يتطلب اتصالًا ثابتًا وكهرباء احتياطية ومسؤولًا تقنيًا |

**ما يجب ألّا يقع:** قاعدة بيانات أو تخزين مرفقات أو نسخ احتياطية خارج المملكة، ولو «مؤقتًا للتجربة».

### لماذا موقع البيانات مسألة قانونية لا تقنية

النظام يحمل **أرقام هوية وطنية وبيانات صحية**. البيانات الصحية «بيانات حساسة» في نظام حماية البيانات الشخصية، ونقلها خارج المملكة مقيَّد بشروط تحدّدها الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا). القرار يخصّ الجمعية ومستشارها النظامي، لا يُحسم من وثيقة تقنية.

الأثر الهندسي المهم: **النظام لا يرتبط بمزوّد.** لا يستعمل إلا PostgreSQL قياسيًا مع امتدادين شائعين، فالانتقال بين المزوّدين تغيير سطرين في `.env` وتشغيل `npm run db:transfer`. اختبر على ما تشاء، وانقل للإنتاج حيث يقرّر النظام.

**عند اختيار مزوّد مستضاف، تحقّق من:**

- وجود منطقة داخل المملكة فعليًا — لا «الشرق الأوسط» عمومًا؛ البحرين والإمارات وفرانكفورت خارجها.
- أن النسخ الاحتياطية والنسخ المتماثلة تبقى في المنطقة نفسها — كثير من المزوّدين ينسخ خارجها افتراضيًا.
- إمكانية توقيع اتفاقية معالجة بيانات.
- دعم `pg_trgm` و`unaccent`، وإصدار PostgreSQL 16 فأحدث.

خذ الإجابات مكتوبة من المزوّد، لا من صفحة تسويقية.

---

### الربط بقاعدة بيانات مستضافة

النظام لا يستعمل أي ميزة خاصة بمزوّد بعينه: **PostgreSQL 16+ مع `pg_trgm` و`unaccent`، لا أكثر.** لا مصادقة المزوّد ولا تخزينه ولا دواله. تغيير المزوّد = تغيير سطرين في `.env`.

المتغيّران:

| المتغيّر | لأي شيء |
|---|---|
| `DATABASE_URL` | اتصال التطبيق — عبر مجمّع الاتصالات إن وُجد |
| `DIRECT_URL` | الترحيلات فقط — تحتاج جلسة كاملة لا يضمنها مجمّع في وضع المعاملة |

محليًا يتساويان.

**Supabase** — من `Project Settings ← Database ← Connection string`:

```env
# Session pooler (المنفذ 5432 على مضيف pooler) — يناسب خادمًا دائم التشغيل
DATABASE_URL="postgresql://postgres.<ref>:<كلمة المرور>@aws-0-<region>.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.<ref>:<كلمة المرور>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

> النظام خادم دائم التشغيل لا دالة بلا خادم، وPrisma يدير مجمّعه بنفسه. لذلك **Session pooler** أنسب من Transaction pooler (المنفذ 6543): الأخير في وضع المعاملة قد يصطدم بالمعاملات التفاعلية التي يستعملها إصدار أمر الصرف. الاتصال المباشر (`db.<ref>.supabase.co`) يحتاج إضافة IPv4 مدفوعة.

### نقل البيانات القائمة

```bash
npm run db:transfer -- --to "postgresql://..." --dry-run   # يعرض الأعداد بلا كتابة
npm run db:transfer -- --to "postgresql://..."
```

السكربت يفعّل الامتدادات في الوجهة، وينسخ المخطط والبيانات و`_prisma_migrations` معًا، **ثم يقارن أعداد صفوف الجداول الحرجة** ويفشل إن لم تتطابق. يرفض الكتابة فوق وجهة غير فارغة إلا بـ`--force`.

> `ENCRYPTION_KEY` نفسه لازم مع القاعدة الجديدة. الملاحظات الصحية مشفَّرة في الصفوف المنقولة، وبمفتاح مختلف لا تُقرأ.

## 2. الأسرار

ولّد كل مفتاح على حدة، ولا تعد استعمال مفتاح من بيئة أخرى:

```bash
# سرّ الجلسات
npx auth secret

# مفتاح تشفير الحقول الحساسة (32 بايت)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# كلمة مرور قاعدة البيانات
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

| المتغيّر | إلزامي | ملاحظة |
|---|---|---|
| `DATABASE_URL` | ✅ | |
| `AUTH_SECRET` | ✅ | تغييره يُخرج كل المستخدمين |
| `AUTH_URL` | ✅ | العنوان العام بـ`https://` |
| `ENCRYPTION_KEY` | ✅ | **فقدانه = فقدان الملاحظات الصحية نهائيًا** |
| `STORAGE_DRIVER` | ✅ | `s3` للإنتاج |
| `S3_BUCKET` · `S3_REGION` · المفاتيح | ✅ مع s3 | حاوية خاصة داخل المملكة |
| `NOTIFICATIONS_DRIVER` | ✅ | `whatsapp` أو `sms` — لا تتركه `log` |
| `REDIS_URL` | ❌ | غيابه يؤخّر الإشعار لا يفقده |

> **`ENCRYPTION_KEY` يُخزَّن في مدير أسرار ويُنسخ احتياطيًا منفصلًا عن قاعدة البيانات.** نسخة تحوي المفتاح والبيانات معًا تُلغي فائدة التشفير كاملة.

---

## 3. النشر بـDocker

```bash
cp .env.example .env      # عبّئ الأسرار أعلاه + POSTGRES_PASSWORD
docker compose up -d --build

# الترحيلات والبيانات الأولية (أول مرة فقط)
docker compose exec app npx prisma migrate deploy
docker compose exec app npx tsx prisma/seed.ts
```

ثم **غيّر كلمات مرور الحسابات الافتراضية فورًا** من `/admin/users`.

### ترحيل بيانات Excel

```bash
docker compose cp "جدول اعانات 2026.xlsx" app:/tmp/data.xlsx
docker compose exec app npx tsx scripts/migrate-excel/index.ts --file /tmp/data.xlsx --dry-run
docker compose exec app npx tsx scripts/migrate-excel/index.ts --file /tmp/data.xlsx --sheet يناير
docker compose exec app npx tsx scripts/migrate-excel/index.ts --file /tmp/data.xlsx
docker compose exec app rm /tmp/data.xlsx    # لا يُترك ملف بيانات في الحاوية
```

راجع `reports/` بعد كل تشغيل.

---

## 4. النشر بلا Docker

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start        # أو خلف مدير عمليات
npm run worker       # عملية ثانية
```

مثال وحدة systemd للعامل:

```ini
[Unit]
Description=عامل إشعارات نظام الإعانات
After=network.target postgresql.service

[Service]
Type=simple
User=bader
WorkingDirectory=/srv/bader
EnvironmentFile=/srv/bader/.env
ExecStart=/usr/bin/npx tsx scripts/worker.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 5. الوكيل العكسي و HTTPS

التطبيق يستمع على HTTP ويجب ألّا يُعرَض مباشرة. مثال Nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name aid.example.sa;

  ssl_certificate     /etc/letsencrypt/live/aid.example.sa/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/aid.example.sa/privkey.pem;

  # كوكي الجلسة مضبوط Secure، فبلا HTTPS لا يعمل الدخول أصلًا.
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header Referrer-Policy "same-origin" always;

  # المرفقات حتى 10MB.
  client_max_body_size 12M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    # سجل التدقيق يسجّل عنوان الطالب من هذه الترويسة.
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name aid.example.sa;
  return 301 https://$host$request_uri;
}
```

---

## 6. النسخ الاحتياطي

**نسخة لم تُختبر ليست نسخة.** السكربت يأخذ النسخة ثم **يستعيدها فعليًا** ويعدّ صفوف الجداول الحرجة:

```bash
npm run backup
```

جدولة يومية (cron):

```cron
0 2 * * * cd /srv/bader && /usr/bin/npm run backup >> /var/log/bader-backup.log 2>&1
```

على ويندوز:

```powershell
schtasks /create /tn "نسخة بادر اليومية" /tr "cmd /c cd /d C:\bader && npm run backup" /sc daily /st 02:00
```

بعد الجدولة:

- تحقق أن `backup-log.jsonl` يُكتب فيه سطر `"ok": true` يوميًا.
- **انقل نسخة خارج الخادم** إلى موقع ثانٍ داخل المملكة — نسخة على نفس القرص لا تنجو من فقد القرص.
- **جرّب استرجاعًا كاملًا مرة كل ربع** على خادم منفصل، ووثّق المدة التي استغرقها.

---

## 7. قائمة ما قبل التشغيل

نفّذها بالترتيب، ولا تُدخل بيانات حقيقية قبل اكتمالها.

### الأمان

- [ ] كلمات مرور الحسابات الافتراضية السبعة **مُغيَّرة**
- [ ] `ENCRYPTION_KEY` مضبوط، و`npm run encrypt:backfill` نُفِّذ
- [ ] المفتاح منسوخ في مدير أسرار **منفصل** عن نسخ القاعدة
- [ ] `AUTH_SECRET` فريد لهذه البيئة
- [ ] HTTPS يعمل، وHTTP يُحوَّل إليه
- [ ] منفذ قاعدة البيانات **غير منشور** للإنترنت
- [ ] `STORAGE_DRIVER=s3` وحاوية خاصة لا قراءة عامة لها
- [ ] حساب `migration@bader.org.sa` النظامي معطَّل (`isActive=false`)

### البيانات

- [ ] الترحيلات مُطبَّقة (`prisma migrate deploy`)
- [ ] القوائم المرجعية مُعبّأة (`db:seed`)
- [ ] `reports/unmatched_items.csv` مُراجَع والأصناف الناقصة مُضافة من `/admin/catalog`
- [ ] `reports/rejected_rows.csv` مُراجَع والهويات غير الصالحة مُصحَّحة
- [ ] شعار الجمعية مرفوع من `/admin/settings`
- [ ] مدد الإنجاز المستهدفة مضبوطة على واقع الجمعية

### التشغيل

- [ ] النسخ الاحتياطي مجدول، و**استرجاع واحد جُرّب فعلًا**
- [ ] النسخ تُنقل خارج الخادم
- [ ] العامل يعمل، و`/admin/notifications` لا يُظهر رسائل عالقة
- [ ] `NOTIFICATIONS_DRIVER` ليس `log`
- [ ] رسالة اختبار وصلت جوالًا حقيقيًا
- [ ] أمر صرف تجريبي طُبع وظهرت فيه الترويسة والشعار ورمز QR

### الناس

- [ ] كل موظف له حساب بدوره الصحيح — لا حساب مشترك
- [ ] الاستقبال دُرِّب على معالج الطلب (الهدف: أقل من دقيقتين للطلب)
- [ ] المستودع يعرف أن الحجز لا يخصم وأن الخصم عند إصدار أمر الصرف
- [ ] المدير يعرف أن سجل التدقيق وسجل الاطّلاع **لا يُحذفان**

---

## 8. بعد التشغيل

| المتابعة | الدورية |
|---|---|
| `/admin/notifications` — رسائل أخفقت أو عالقة | يوميًا |
| `backup-log.jsonl` — سطر `ok: true` | يوميًا |
| `/inventory?below=1` — أصناف تحت حد إعادة الطلب | أسبوعيًا |
| `/reports` — متوسط زمن كل مرحلة، لكشف الاختناقات | شهريًا |
| `/admin/audit` — مراجعة الاطّلاع على ملفات المستفيدين | شهريًا |
| استرجاع نسخة كامل على خادم منفصل | ربعيًا |

### حين يطلب مستفيد حذف بياناته

النظام **لا يحذف نهائيًا** بحكم التصميم: الحذف الناعم يبقي الأثر المحاسبي لما صُرف فعلًا، وهو التزام على الجمعية لا حق للمستفيد في إسقاطه. ما يُنفَّذ عمليًا:

1. حذف ناعم للمستفيد من ملفه.
2. تفريغ الملاحظات الصحية (الحقول المشفَّرة).
3. حذف المرفقات الطبية من التخزين بعد انقضاء مدة الاحتفاظ النظامية.
4. توثيق الطلب وما نُفِّذ منه في سجل التدقيق.

سجلّا التدقيق والاطّلاع يبقيان: هما دليل الامتثال نفسه.
