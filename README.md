# موقع أسئلة Ooredoo فلسطين (مجاني بالكامل)

يقرأ المعلومات تلقائيًا من ooredoo.ps كل يوم، ويجيب عن الأسئلة باستخدام Gemini المجاني.

## كيف يعمل
1. GitHub Actions يشغّل `scripts/scrape.mjs` يوميًا ويحفظ المحتوى في `public/data/ooredoo.json`.
2. Cloudflare Pages ينشر الواجهة (`public/`) وخادم الإجابة (`functions/api/chat.js`) ويُعيد النشر تلقائيًا عند تغيّر البيانات.
3. عند كل سؤال يختار الخادم أقرب المقتطفات ويرسلها مع السؤال إلى Gemini.

## خطوات الإعداد (مرة واحدة)

### 1) مفتاح Gemini
ادخل إلى https://aistudio.google.com واحصل على API key (بدون بطاقة).

### 2) GitHub
- أنشئ مستودعًا جديدًا (Repository) على github.com.
- ارفع كل محتويات هذا المجلد إليه، ومنها المجلد المخفي `.github`.
  (الأسهل: ثبّت GitHub Desktop أو اسحب المجلدات إلى صفحة المستودع عبر Add file ← Upload files).
- من تبويب Actions اختر "تحديث بيانات أوريدو" ثم Run workflow.
- بعد اكتماله افتح `public/data/ooredoo.json` وتأكد أنه امتلأ بالمقاطع (chunks).
  - إن فشل أو بقي فارغًا فالموقع غالبًا يحمّل المحتوى بجافاسكربت: من Settings ← Secrets and variables ← Actions ← Variables أضف متغيرًا `USE_BROWSER` قيمته `1` وأعد التشغيل.
  - إن كانت الصفحات المهمة في عناوين محددة، أضف متغيرًا `START_URLS` بعناوين مفصولة بفاصلة.

### 3) Cloudflare Pages
- من لوحة Cloudflare: Workers & Pages ← Create ← Pages ← Connect to Git، واختر المستودع.
- Build command: اتركه فارغًا. Build output directory: `public`.
- بعد الإنشاء: Settings ← Variables and Secrets، أضف `GEMINI_API_KEY` (من نوع Secret) بقيمة مفتاحك، ثم أعد النشر.
- اختياري: متغير `GEMINI_MODEL` لتغيير النموذج (الافتراضي `gemini-flash-latest`).

## ملاحظات
- الحدود المجانية لـ Gemini تتغير وقد تنفد يوميًا؛ يظهر للمستخدم تنبيه عندئذ.
- السكربت يلتزم بملف robots.txt ويؤخر 0.8 ثانية بين الطلبات.
- الموقع غير رسمي، ولا يغني عن خدمة العملاء الرسمية.
