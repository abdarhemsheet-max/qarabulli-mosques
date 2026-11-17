# توثيق مساجد مكتب أوقاف القره بوللي

تطبيق ويب عربي (RTL) مخصص للهاتف أولاً والحاسوب، يمكّن موظفي مكتب أوقاف القره بوللي من توثيق المساجد ميدانياً، وحفظ الإحداثيات وصور العلامات الدالة في **Firebase Firestore** مع العمل دون إنترنت، ثم تصدير البيانات إلى ملف **Excel** بقالب المكتب الرسمي.

---

## المميزات الأساسية
- **توثيق ميداني سريع من الهاتف**: خريطة تفاعلية (OpenStreetMap مع زر تبديل للقمر الصناعي Esri World Imagery)، تحديد الموقع عبر GPS عالي الدقة مع عرض الدقة بالمتر وتنبيه ضعف الإشارة (> 30 م)، وسحب الدبوس لتثبيت الموقع بدقة.
- **منع التكرار الذكي**: التحقق التلقائي من تطابق الاسم أو القرب الجغرافي (أقل من 30 متراً) مع خيار تعديل السجل الموجود أو الحفظ كمسجد مختلف.
- **ضغط الصور دون تكلفة تخزين إضافية**: ضغط حتى 3 صور للعلامة الدالة في المتصفح (عرض 1000 بكسل، صيغة JPEG جودة 0.7) وحفظها داخل سجل المسجد في Firestore ضمن الحد الآمن (< 900 كيلوبايت) دون الحاجة إلى Firebase Storage.
- **العمل دون إنترنت (Offline Persistence)**: حفظ السجلات محلياً عند انقطاع الإنترنت ومزامنتها تلقائياً عند عودة الاتصال، مع مؤشر واضح للحالة (`متصل` / `غير متصل`).
- **الخريطة العامة**: عرض جميع المساجد الموثقة مع التجميع التلقائي للدبابيس المتقاربة وبطاقة تفاصيل تتضمن الصور وزر الفتح والاتجاهات في خرائط جوجل.
- **قائمة المساجد والتصدير إلى Excel وKML وCSV**: بحث بالاسم وفلترة بالمحلة، وتصدير للمدير عبر مكتبة SheetJS (`xlsx-js-style`) بقالب عربي RTL، مع تصدير KML وCSV متوافقين مع الاستيراد المباشر في Google My Maps.
- **طبقة «مساجد موجودة مسبقاً» (Overpass API)**: جلب عناصر `amenity=place_of_worship` و`religion=muslim` ضمن نطاق القره بوللي مع حفظ مؤقت لمدة ساعة في المتصفح ومفتاح إظهار/إخفاء، وإمكانية توثيقها وربطها بحقل `osmId`.
- **النشر الاختياري إلى OpenStreetMap (مخفي افتراضياً)**: إعداد خاص بالمدير يتيح زر النشر عبر OAuth2 (`osm-auth`) على الخادم التجريبي افتراضياً أو الخادم الحقيقي بعد مراجعة الملخص والموافقة.
- **صلاحيات واضحة**:
  - **موثِّق**: يضيف مساجد جديدة، ويعدّل ويحذف ما أضافه هو فقط.
  - **مدير**: يطّلع على جميع السجلات، ويعدّل ويحذف ويصدّر Excel ويضيف حسابات الموثِّقين ويدير إعداد النشر إلى OpenStreetMap.

---

## هيكل المشروع
```text
src/
├── components/
│   ├── BottomNav.tsx           # شريط التنقل السفلي (إضافة / الخريطة / القائمة)
│   ├── ConfirmModal.tsx        # نافذة تأكيد الحذف
│   ├── ErrorBoundary.tsx       # معالج الأخطاء العام
│   ├── HeaderBar.tsx           # الشريط العلوي ومؤشر الاتصال
│   ├── LeafletMap.tsx          # مكون الخريطة (تحديد الموقع + التجميع + طبقة OSM)
│   ├── MosqueDetailSheet.tsx   # بطاقة تفاصيل المسجد واقتراح التعديل
│   ├── MosqueFormModal.tsx     # نموذج إضافة/تعديل المسجد ومنع التكرار
│   ├── OsmCandidateSheet.tsx   # بطاقة مراجعة المساجد الموجودة مسبقاً
│   └── OsmPublishModal.tsx     # نافذة ملخص وموافقة النشر إلى OpenStreetMap
├── lib/
│   ├── export/
│   │   ├── excelExport.ts      # تصدير قالب Excel عبر SheetJS
│   │   └── geoExport.ts        # تصدير KML وCSV لـ Google My Maps
│   ├── firebase/
│   │   ├── auth.ts             # المصادقة وإدارة الموثقين
│   │   ├── config.ts           # تهيئة Firebase مع Offline Persistence
│   │   ├── errors.ts           # تغليف أخطاء Firestore
│   │   ├── mosques.ts          # عمليات الحفظ والقراءة والتعديل والحذف
│   │   └── settings.ts         # إعدادات المدير الاختيارية في Firestore
│   ├── osm/
│   │   └── osmPublish.ts       # مصادقة OAuth2 ونشر التعديلات عبر osm-auth
│   └── utils/
│       ├── geo.ts              # حساب المسافة (Haversine) وتنسيق التاريخ
│       ├── image.ts            # ضغط الصور في المتصفح
│       └── osmMosques.ts       # جلب المساجد من Overpass API مع تخزين مؤقت (ساعة)
├── pages/
│   ├── AddMosquePage.tsx       # الشاشة الرئيسية (تحديد الموقع والإضافة)
│   ├── GeneralMapPage.tsx      # الخريطة العامة المجمّعة
│   ├── LoginPage.tsx           # تسجيل الدخول بالبريد أو جوجل للمدير
│   ├── MosquesListPage.tsx     # قائمة المساجد والبحث والفلتر والتصدير
│   ├── UsersPage.tsx           # شاشة إضافة الموثِّقين وإعدادات المدير
│   └── VisitReportsPlaceholderPage.tsx  # مساحة محجوزة لقسم «تقارير الزيارات» مستقبلاً
├── types/
│   └── mosque.ts               # تعريفات TypeScript
├── App.tsx
├── index.css
└── main.tsx
```

---

## التشغيل المحلي

1. **تثبيت الحزم:**
   ```bash
   npm install
   ```

2. **تشغيل بيئة التطوير:**
   ```bash
   npm run dev
   ```

3. **بناء نسخة الإنتاج:**
   ```bash
   npm run build
   ```

---

## إعداد Supabase (قاعدة البيانات وتسجيل الدخول)
1. أنشئ مشروعاً جديداً في [supabase.com](https://supabase.com).
2. من **Authentication → Sign In / Providers → Email** أوقف خيار **Confirm email** (حتى يستطيع المدير إنشاء حسابات الموثّقين مباشرة).
3. من **Authentication → Users → Add user** أنشئ حساب المدير بالبريد `abdarhemsheet@gmail.com` مع تفعيل **Auto Confirm User**.
4. طبّق قاعدة البيانات عبر Supabase CLI: `supabase link --project-ref <ref>` ثم `supabase db push` (الملفات في `supabase/migrations`). حساب المدير يُربط تلقائياً عند إنشائه.
5. من **Project Settings → API** انسخ **Project URL** و**anon public key** وضعهما في `supabase-config.json`:
   ```json
   { "url": "https://xxxx.supabase.co", "anonKey": "eyJ..." }
   ```
   مفتاح `anon` آمن للنشر لأن كل الجداول محمية بسياسات Row Level Security.

## إعداد OpenStreetMap OAuth2
1. **إعداد OAuth2 لـ OpenStreetMap (اختياري للمدير)**:
   - أنشئ تطبيق OAuth 2.0 غير سري في OpenStreetMap مع رابط العودة `/osm-callback.html`.
   - أضف `VITE_OSM_SANDBOX_CLIENT_ID` (للخادم التجريبي) و`VITE_OSM_PROD_CLIENT_ID` (للخادم الحقيقي) في متغيرات البيئة دون وضعها داخل الكود.
