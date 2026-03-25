/**
 * Seed script — creates 6 Arabic demo projects for the platform Arabic demo.
 *
 *   node server/scripts/seed-arabic-projects.js
 *
 * Run once after the server has been started at least once (so the DB + admin user exist).
 * Safe to re-run — skips projects whose name already exists.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Match the server's own DB path: process.cwd()/data/databayt.sqlite
const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'databayt.sqlite')
  : path.resolve(__dirname, '..', '..', 'data', 'databayt.sqlite');
const db = new Database(DB_PATH);

// ── helpers ────────────────────────────────────────────────────────────────
const uuid = () => crypto.randomUUID();
const now = () => Date.now();

const insertProject = db.prepare(`
  INSERT INTO projects (id, name, description, manager_id, xml_config, guidelines, is_demo, created_at, updated_at)
  VALUES (@id, @name, @description, @managerId, @xmlConfig, @guidelines, 0, @ts, @ts)
`);

const insertPoint = db.prepare(`
  INSERT INTO data_points (id, project_id, content, type, original_annotation, status, metadata, created_at, updated_at)
  VALUES (@id, @projectId, @content, 'text', @annotation, @status, @metadata, @ts, @ts)
`);

const insertStats  = db.prepare(`INSERT OR IGNORE INTO project_stats (project_id) VALUES (?)`);
const insertMember = db.prepare(`INSERT OR IGNORE INTO project_annotators (project_id, user_id) VALUES (?, ?)`);
const checkExists  = db.prepare(`SELECT id FROM projects WHERE name = ?`);

// ── fetch admin ────────────────────────────────────────────────────────────
const admin = db.prepare(`SELECT id FROM users WHERE JSON_EXTRACT(roles,'$[0]') = 'admin' OR roles LIKE '%admin%' LIMIT 1`).get();
if (!admin) { console.error('No admin user found. Start the server at least once first.'); process.exit(1); }
const adminId = admin.id;

// ── project definitions ────────────────────────────────────────────────────

const PROJECTS = [

  // ── 1. تحليل مشاعر وسائل التواصل الاجتماعي ─────────────────────────────
  {
    name: 'تحليل مشاعر وسائل التواصل الاجتماعي',
    description: 'تصنيف تغريدات ومنشورات عربية حول شركات التقنية والخدمات الرقمية إلى مشاعر إيجابية أو سلبية أو محايدة.',
    guidelines: `صنِّف كل منشور وفق المعايير الآتية:

- **إيجابي** — يعبّر الكاتب عن رضا أو إعجاب أو ترحيب
- **سلبي** — يعبّر الكاتب عن استياء أو شكوى أو خيبة أمل
- **محايد** — لا يحمل المنشور تقييماً واضحاً، أو هو مجرد خبر

**ملاحظة:** ركّز على المشاعر الصريحة وتجاهل الكلمات الساخرة ما لم يكن السياق واضحاً.`,
    xmlConfig: `<annotation-config>
  <field id="sentiment" type="dropdown" required="true">
    <label>المشاعر</label>
    <options>
      <option value="positive">إيجابي</option>
      <option value="negative">سلبي</option>
      <option value="neutral">محايد</option>
    </options>
  </field>
  <field id="confidence" type="rating-scale" required="false">
    <label>درجة الثقة</label>
    <rating-config min="1" max="5" style="stars" minLabel="غير متأكد" maxLabel="متأكد تماماً" />
  </field>
</annotation-config>`,
    points: [
      { content: 'خدمة العملاء في شركة STC ممتازة جداً، حلّوا مشكلتي في أقل من خمس دقائق! 👏', annotation: 'positive', status: 'accepted' },
      { content: 'الإنترنت منقطع من ثلاث ساعات وما في أي رد من الدعم الفني. مخجل!', annotation: 'negative', status: 'accepted' },
      { content: 'أعلنت أمازون السعودية عن عروض جديدة لموسم الصيف.', annotation: 'neutral', status: 'accepted' },
      { content: 'تطبيق نون أسهل وأسرع تطبيق تسوق استخدمته في حياتي، أنصح فيه الكل!', annotation: 'positive', status: 'accepted' },
      { content: 'وصلت البضاعة مكسورة والتغليف كان سيئ جداً، خسرت فلوسي!', annotation: 'negative', status: 'accepted' },
      { content: 'أطلقت أبل نظام iOS الجديد يحتوي على تحديثات كثيرة للخصوصية.', annotation: 'neutral', status: 'pending' },
      { content: 'التوصيل وصل قبل الموعد المحدد والسائق كان محترم جداً، شكراً جزيلاً!', annotation: 'positive', status: 'accepted' },
      { content: 'اشتريت جهاز وبعد أسبوع توقف، والضمان رفضوا تفعيله بحجج واهية.', annotation: 'negative', status: 'accepted' },
      { content: 'أعلنت شركة سامسونج عن هاتف جديد بسعر يبدأ من ٣٠٠٠ ريال.', annotation: 'neutral', status: 'pending' },
      { content: 'أحسن تجربة تسوق إلكتروني بحياتي، الجودة عالية والسعر مناسب جداً!', annotation: 'positive', status: 'accepted' },
      { content: 'ما أقدر أحذف حسابي من الموقع وما عندهم طريقة واضحة للتواصل. مستحيل!', annotation: 'negative', status: 'pending' },
      { content: 'وصل الطرد اليوم في الوقت المتوقع.', annotation: 'neutral', status: 'pending' },
    ],
  },

  // ── 2. تصنيف الأخبار العربية ─────────────────────────────────────────────
  {
    name: 'تصنيف الأخبار العربية',
    description: 'تصنيف عناوين ومقاطع أخبار عربية إلى فئات: سياسة، اقتصاد، رياضة، تقنية، صحة، ثقافة.',
    guidelines: `صنِّف كل خبر في الفئة الأنسب له:

- **سياسة** — أخبار حكومية، انتخابات، دبلوماسية، قوانين
- **اقتصاد** — أسواق مالية، شركات، تجارة، بترول
- **رياضة** — كرة القدم، ألعاب أولمبية، بطولات
- **تقنية** — ذكاء اصطناعي، شركات تقنية، برمجيات، إنترنت
- **صحة** — طب، أوبئة، أدوية، دراسات طبية
- **ثقافة** — فن، أدب، سينما، موسيقى، تراث

اختر الفئة الأكثر ارتباطاً بمحور الخبر الرئيسي.`,
    xmlConfig: `<annotation-config>
  <field id="category" type="radio" required="true">
    <label>فئة الخبر</label>
    <options>
      <option value="politics">سياسة</option>
      <option value="economy">اقتصاد</option>
      <option value="sports">رياضة</option>
      <option value="technology">تقنية</option>
      <option value="health">صحة</option>
      <option value="culture">ثقافة</option>
    </options>
  </field>
  <field id="notes" type="text" required="false">
    <label>ملاحظات</label>
    <placeholder>أي ملاحظة إضافية...</placeholder>
  </field>
</annotation-config>`,
    points: [
      { content: 'عقدت القمة العربية اجتماعها السنوي في الرياض بمشاركة قادة الدول الأعضاء لبحث القضايا الإقليمية.', annotation: 'politics', status: 'accepted' },
      { content: 'ارتفع سعر برميل النفط الخام إلى ٩٥ دولاراً في تداولات اليوم وسط توقعات بمزيد من الارتفاع.', annotation: 'economy', status: 'accepted' },
      { content: 'فاز المنتخب السعودي على نظيره الأرجنتيني في مفاجأة تاريخية أذهلت عشاق كرة القدم.', annotation: 'sports', status: 'accepted' },
      { content: 'أعلنت شركة أوبن إيه آي عن نموذج لغوي جديد يتفوق على البشر في مهام الاستدلال المنطقي.', annotation: 'technology', status: 'accepted' },
      { content: 'أكد باحثون أن ساعة من المشي اليومي تقلل خطر الإصابة بأمراض القلب بنسبة ٣٠٪.', annotation: 'health', status: 'accepted' },
      { content: 'حصد الفيلم المصري "ريح المدام" جائزة أفضل إخراج في مهرجان القاهرة السينمائي الدولي.', annotation: 'culture', status: 'accepted' },
      { content: 'وقّعت المملكة العربية السعودية اتفاقية تجارية جديدة مع الاتحاد الأوروبي لرفع الصادرات.', annotation: 'economy', status: 'accepted' },
      { content: 'اكتشف علماء لقاحاً واعداً ضد سرطان الجلد يدخل المرحلة الثالثة من التجارب السريرية.', annotation: 'health', status: 'accepted' },
      { content: 'أطلقت الإمارات قمراً صناعياً جديداً لمراقبة المناخ وتحسين نماذج التنبؤ بالطقس.', annotation: 'technology', status: 'pending' },
      { content: 'أُعلن عن انتخابات برلمانية مبكرة في تونس وسط أجواء سياسية متوترة.', annotation: 'politics', status: 'pending' },
      { content: 'افتتح متحف اللوفر أبوظبي معرضاً استثنائياً للمخطوطات العربية النادرة.', annotation: 'culture', status: 'pending' },
      { content: 'صعد نادي الهلال إلى صدارة الدوري السعودي للمحترفين بعد فوزه على النصر بهدفين.', annotation: 'sports', status: 'pending' },
    ],
  },

  // ── 3. التعرف على الكيانات المسماة ──────────────────────────────────────
  {
    name: 'التعرف على الكيانات المسماة في النصوص العربية',
    description: 'استخراج وتصنيف الكيانات المسماة (أشخاص، أماكن، منظمات، تواريخ) من نصوص عربية متنوعة.',
    guidelines: `حدِّد جميع الكيانات المسماة في النص وصنِّفها:

- **شخص** — أسماء أشخاص حقيقيين أو خياليين
- **مكان** — مدن، دول، مناطق جغرافية، معالم
- **منظمة** — شركات، حكومات، مؤسسات، أحزاب
- **تاريخ** — تواريخ محددة، فترات زمنية، أحداث تاريخية

**تعليمات:** أضف كل كيان في حقل منفصل مع تحديد نوعه. إذا تكرر الكيان في النص، أضفه مرة واحدة فقط.`,
    xmlConfig: `<annotation-config>
  <field id="entities" type="entity-list" required="true">
    <label>الكيانات المسماة</label>
    <placeholder>اكتب الكيان هنا...</placeholder>
    <entity-types>
      <entity-type value="person">شخص</entity-type>
      <entity-type value="location">مكان</entity-type>
      <entity-type value="organization">منظمة</entity-type>
      <entity-type value="date">تاريخ / زمن</entity-type>
    </entity-types>
  </field>
</annotation-config>`,
    points: [
      { content: 'زار الأمير محمد بن سلمان باريس في ديسمبر الماضي والتقى برئيس فرنسا إيمانويل ماكرون.', annotation: JSON.stringify([{text:'محمد بن سلمان',type:'person'},{text:'باريس',type:'location'},{text:'ديسمبر',type:'date'},{text:'إيمانويل ماكرون',type:'person'},{text:'فرنسا',type:'location'}]), status: 'accepted' },
      { content: 'أعلنت شركة أرامكو السعودية عن افتتاح مكتبها الإقليمي الجديد في دبي الشهر القادم.', annotation: JSON.stringify([{text:'أرامكو السعودية',type:'organization'},{text:'دبي',type:'location'}]), status: 'accepted' },
      { content: 'أسّس الروائي نجيب محفوظ تيّاراً أدبياً جديداً في مصر خلال القرن العشرين.', annotation: JSON.stringify([{text:'نجيب محفوظ',type:'person'},{text:'مصر',type:'location'},{text:'القرن العشرين',type:'date'}]), status: 'accepted' },
      { content: 'أصدرت منظمة الصحة العالمية تقريراً جديداً حول انتشار الأمراض المزمنة في الشرق الأوسط.', annotation: JSON.stringify([{text:'منظمة الصحة العالمية',type:'organization'},{text:'الشرق الأوسط',type:'location'}]), status: 'accepted' },
      { content: 'شارك المنتخب المغربي في نهائيات كأس العالم ٢٠٢٢ التي أُقيمت في قطر.', annotation: JSON.stringify([{text:'المغرب',type:'location'},{text:'كأس العالم ٢٠٢٢',type:'date'},{text:'قطر',type:'location'}]), status: 'accepted' },
      { content: 'أعلن بنك الإمارات المركزي عن خفض أسعار الفائدة بدءاً من أول يناير القادم.', annotation: JSON.stringify([{text:'بنك الإمارات المركزي',type:'organization'},{text:'يناير',type:'date'}]), status: 'accepted' },
      { content: 'وُلد الشاعر محمود درويش في قرية البروة بفلسطين عام ١٩٤١.', annotation: JSON.stringify([{text:'محمود درويش',type:'person'},{text:'البروة',type:'location'},{text:'فلسطين',type:'location'},{text:'١٩٤١',type:'date'}]), status: 'accepted' },
      { content: 'أعلنت مجموعة بن لادن السعودية فوزها بعقد إنشاء المسجد الحرام الجديد.', annotation: JSON.stringify([{text:'مجموعة بن لادن السعودية',type:'organization'},{text:'المسجد الحرام',type:'location'}]), status: 'pending' },
      { content: 'فتح القائد صلاح الدين الأيوبي القدس عام ١١٨٧ ميلادية بعد معارك طاحنة.', annotation: JSON.stringify([{text:'صلاح الدين الأيوبي',type:'person'},{text:'القدس',type:'location'},{text:'١١٨٧',type:'date'}]), status: 'pending' },
      { content: 'تتخذ شركة غوغل من مدينة ماونتن فيو في كاليفورنيا مقراً رئيسياً لها.', annotation: JSON.stringify([{text:'غوغل',type:'organization'},{text:'ماونتن فيو',type:'location'},{text:'كاليفورنيا',type:'location'}]), status: 'pending' },
    ],
  },

  // ── 4. تقييم جودة الترجمة الآلية ─────────────────────────────────────────
  {
    name: 'تقييم جودة الترجمة الآلية عربي-إنجليزي',
    description: 'تقييم دقة وطبيعية الترجمات الآلية من العربية إلى الإنجليزية وتحديد أخطائها.',
    guidelines: `قيّم جودة الترجمة من العربية إلى الإنجليزية وفق المعايير التالية:

**الدقة (Accuracy):** هل نقلت الترجمة المعنى الصحيح؟
**الطبيعية (Fluency):** هل الترجمة طبيعية وسلسة في الإنجليزية؟

**تصنيف الجودة:**
- **ممتازة** — دقيقة وطبيعية تماماً
- **جيدة** — دقيقة مع بعض التعابير الغريبة
- **مقبولة** — تنقل المعنى العام لكن بأخطاء واضحة
- **ضعيفة** — أخطاء جوهرية تشوّه المعنى`,
    xmlConfig: `<annotation-config>
  <field id="quality" type="radio" required="true">
    <label>جودة الترجمة</label>
    <options>
      <option value="excellent">ممتازة</option>
      <option value="good">جيدة</option>
      <option value="acceptable">مقبولة</option>
      <option value="poor">ضعيفة</option>
    </options>
  </field>
  <field id="error_type" type="dropdown" required="false">
    <label>نوع الخطأ الرئيسي (إن وجد)</label>
    <options>
      <option value="none">لا يوجد</option>
      <option value="meaning">خطأ في المعنى</option>
      <option value="grammar">خطأ نحوي</option>
      <option value="style">أسلوب غير طبيعي</option>
      <option value="missing">معلومات مفقودة</option>
    </options>
  </field>
  <field id="comment" type="text" required="false">
    <label>تعليق</label>
    <placeholder>اشرح سبب تقييمك...</placeholder>
  </field>
</annotation-config>`,
    points: [
      { content: 'النص العربي: "إن الصبر مفتاح الفرج"\nالترجمة: "Patience is the key to relief"', annotation: 'excellent', status: 'accepted' },
      { content: 'النص العربي: "ذهبت إلى السوق لشراء الخضروات الطازجة"\nالترجمة: "I went to the market to buy the fresh vegetables"', annotation: 'excellent', status: 'accepted' },
      { content: 'النص العربي: "الاقتصاد السعودي يشهد نمواً متسارعاً في ظل رؤية ٢٠٣٠"\nالترجمة: "The Saudi economy is witnessing fast growing in shadow of vision 2030"', annotation: 'acceptable', status: 'accepted' },
      { content: 'النص العربي: "تفضلوا بزيارتنا في أي وقت"\nالترجمة: "Please, your excellency, visit us at any time"', annotation: 'poor', status: 'accepted' },
      { content: 'النص العربي: "المسافة بين مكة المكرمة والمدينة المنورة نحو ٤٠٠ كيلومتر"\nالترجمة: "The distance between Makkah and Madinah is approximately 400 kilometers"', annotation: 'excellent', status: 'accepted' },
      { content: 'النص العربي: "الطالب الذي يجتهد في دراسته سينجح لا محالة"\nالترجمة: "The student who strives in his study will inevitably succeed"', annotation: 'good', status: 'accepted' },
      { content: 'النص العربي: "كان الجو بارداً جداً أمس"\nالترجمة: "The weather it was very cold yesterday"', annotation: 'acceptable', status: 'pending' },
      { content: 'النص العربي: "يُعدّ نهر النيل أطول أنهار العالم"\nالترجمة: "The Nile River is considered the longest rivers in the world"', annotation: 'acceptable', status: 'pending' },
      { content: 'النص العربي: "أحبّ القهوة العربية بالهيل"\nالترجمة: "I love Arabic coffee with cardamom"', annotation: 'excellent', status: 'pending' },
      { content: 'النص العربي: "لا تؤجّل عمل اليوم إلى الغد"\nالترجمة: "Don\'t delay today work to tomorrow"', annotation: 'acceptable', status: 'pending' },
    ],
  },

  // ── 5. اكتشاف خطاب الكراهية ──────────────────────────────────────────────
  {
    name: 'اكتشاف المحتوى المسيء في النصوص العربية',
    description: 'تصنيف التعليقات والمنشورات العربية لتحديد المحتوى المسيء أو خطاب الكراهية لأغراض الإشراف على المحتوى.',
    guidelines: `صنِّف كل نص حسب مستوى الإساءة:

- **خطاب كراهية** — يتضمن تحريضاً أو إهانة مباشرة بسبب الدين أو العرق أو الجنس
- **محتوى مسيء** — يحتوي على شتائم أو ألفاظ بذيئة لكن لا يصل لخطاب الكراهية
- **تحرش** — يستهدف شخصاً بعينه بأذى متكرر
- **محتوى طبيعي** — لا يحمل أي مخالفة

**ملاحظة:** اتخذ قرارك بناءً على النص فقط وليس على آرائك الشخصية.`,
    xmlConfig: `<annotation-config>
  <field id="label" type="dropdown" required="true">
    <label>تصنيف المحتوى</label>
    <options>
      <option value="hate_speech">خطاب كراهية</option>
      <option value="offensive">محتوى مسيء</option>
      <option value="harassment">تحرش</option>
      <option value="normal">محتوى طبيعي</option>
    </options>
  </field>
  <field id="severity" type="rating-scale" required="false">
    <label>درجة الخطورة</label>
    <rating-config min="1" max="3" style="numbers" minLabel="منخفضة" maxLabel="عالية" />
  </field>
</annotation-config>`,
    points: [
      { content: 'شكراً على المساعدة، أنتم فريق رائع!', annotation: 'normal', status: 'accepted' },
      { content: 'كلام فاضي ومالوش قيمة، بلاش تعلق تاني!', annotation: 'offensive', status: 'accepted' },
      { content: 'أنا مش موافق على هذا الرأي لكن أحترم وجهة نظرك.', annotation: 'normal', status: 'accepted' },
      { content: 'هذا المنتج الأسوأ اشتريته في حياتي، مضيعة للمال.', annotation: 'normal', status: 'accepted' },
      { content: 'أنتِ لا تستحقين التحدث في هذا الموضوع، اخرسي وروحي المطبخ!', annotation: 'harassment', status: 'accepted' },
      { content: 'الحوار بين المختلفين ضروري لبناء مجتمع صحي ومتسامح.', annotation: 'normal', status: 'accepted' },
      { content: 'وجهة نظر مثيرة للاهتمام، لكنني أختلف مع بعض النقاط.', annotation: 'normal', status: 'accepted' },
      { content: 'الفيلم ده كان ممل جداً، ضيعت ساعتين من عمري.', annotation: 'normal', status: 'accepted' },
      { content: 'سأجد عنوانك وسأجعلك تندم على ما قلته!', annotation: 'harassment', status: 'pending' },
      { content: 'هذا الرأي لا أشاطرك إياه، لكن شكراً للمشاركة.', annotation: 'normal', status: 'pending' },
      { content: 'المباراة كانت ممتعة ومثيرة حتى الدقيقة الأخيرة.', annotation: 'normal', status: 'pending' },
      { content: 'ما زلت أتعلم البرمجة وأجد صعوبة في بعض المفاهيم.', annotation: 'normal', status: 'pending' },
    ],
  },

  // ── 6. تلخيص النصوص الطبية ────────────────────────────────────────────────
  {
    name: 'جودة تلخيص النصوص الطبية العربية',
    description: 'تقييم ملخصات نصوص طبية عربية من حيث الدقة والشمولية والوضوح لدعم نظام ذكاء اصطناعي طبي.',
    guidelines: `قيّم الملخص المقترح مقارنةً بالنص الأصلي:

**معايير التقييم:**
- **دقيق** — يحتوي الملخص على المعلومات الصحيحة فقط دون تشويه
- **شامل** — يغطي النقاط الرئيسية ولا يحذف معلومات جوهرية
- **واضح** — اللغة سليمة والمعنى مفهوم

**تصنيف الجودة الكلية:**
- ممتاز / جيد / مقبول / ضعيف`,
    xmlConfig: `<annotation-config>
  <field id="overall" type="radio" required="true">
    <label>الجودة الكلية للملخص</label>
    <options>
      <option value="excellent">ممتاز</option>
      <option value="good">جيد</option>
      <option value="acceptable">مقبول</option>
      <option value="poor">ضعيف</option>
    </options>
  </field>
  <field id="accuracy" type="rating-scale" required="true">
    <label>دقة المعلومات</label>
    <rating-config min="1" max="5" style="stars" minLabel="غير دقيق" maxLabel="دقيق جداً" />
  </field>
  <field id="issue" type="textarea" required="false">
    <label>وصف المشكلة (إن وجدت)</label>
    <placeholder>اذكر ما ينقص الملخص أو ما هو خاطئ فيه...</placeholder>
  </field>
</annotation-config>`,
    points: [
      { content: 'النص: "يُعدّ السكري النوع الثاني مرضاً مزمناً يتسم بارتفاع نسبة السكر في الدم نتيجة مقاومة الأنسولين أو عدم إنتاجه بكمية كافية."\nالملخص: "مرض مزمن يرفع سكر الدم بسبب خلل في الأنسولين."', annotation: 'good', status: 'accepted' },
      { content: 'النص: "تشمل أعراض الإنفلونزا الحمى والسعال وآلام العضلات والتعب الشديد، وتستمر عادةً من ٥ إلى ٧ أيام."\nالملخص: "الإنفلونزا تسبب حمى وسعال وتعب وتستمر أسبوعاً تقريباً."', annotation: 'excellent', status: 'accepted' },
      { content: 'النص: "يتضمن علاج ارتفاع ضغط الدم تغييرات في نمط الحياة كتقليل الملح وممارسة الرياضة، إضافةً إلى أدوية مدرّات البول أو حاصرات بيتا."\nالملخص: "ارتفاع الضغط يُعالَج بتقليل الملح فقط."', annotation: 'poor', status: 'accepted' },
      { content: 'النص: "الكوليسترول الضار LDL يتراكم في جدران الشرايين مسبباً تصلّبها وتضيّقها، مما يزيد خطر النوبات القلبية والسكتات الدماغية."\nالملخص: "الكوليسترول الضار يتراكم في الشرايين ويزيد خطر أمراض القلب والسكتة."', annotation: 'excellent', status: 'accepted' },
      { content: 'النص: "يُوصى بإجراء فحص سرطان القولون كل ١٠ سنوات للأشخاص فوق الخمسين، أو كل ٥ سنوات لمن لديهم عوامل خطر."\nالملخص: "فحص القولون يُجرى كل ١٠ سنوات للجميع."', annotation: 'acceptable', status: 'accepted' },
      { content: 'النص: "الصداع النصفي يتميز بألم نابض في جانب واحد من الرأس مصحوباً بالغثيان وحساسية للضوء والصوت، وقد يستمر من ٤ إلى ٧٢ ساعة."\nالملخص: "الصداع النصفي ألم نابض من جانب واحد مع غثيان وحساسية، يستمر لساعات أو أيام."', annotation: 'excellent', status: 'accepted' },
      { content: 'النص: "يُسبب نقص فيتامين د ضعف العظام والكساح عند الأطفال، وهشاشة العظام عند البالغين، فضلاً عن ضعف المناعة."\nالملخص: "نقص فيتامين د يُضعف العظام والمناعة."', annotation: 'good', status: 'pending' },
      { content: 'النص: "الربو مرض التهابي مزمن يؤثر على مجرى الهواء ويسبب نوبات من الصفير وضيق التنفس والسعال، ويمكن السيطرة عليه بالأدوية الموسّعة للشعب الهوائية."\nالملخص: "مرض يصعّب التنفس ويُعالج بالأدوية."', annotation: 'acceptable', status: 'pending' },
      { content: 'النص: "تنتقل عدوى الكبد الوبائي ب عبر الدم أو الاتصال الجنسي، وقد تؤدي إلى تليّف الكبد أو سرطانه إذا لم تُعالَج."\nالملخص: "التهاب الكبد ب ينتقل بالدم وقد يسبب سرطان الكبد."', annotation: 'good', status: 'pending' },
      { content: 'النص: "يُقلّل تناول الأسبرين يومياً بجرعة منخفضة من خطر الإصابة بالنوبات القلبية لدى المرضى ذوي الخطورة العالية، لكنه قد يسبب نزيفاً في المعدة."\nالملخص: "الأسبرين يومياً يحمي من النوبات القلبية لكن قد يسبب نزيفاً."', annotation: 'excellent', status: 'pending' },
    ],
  },
];

// ── insert all projects ────────────────────────────────────────────────────
const ts = now();
let created = 0;
let skipped = 0;

for (const proj of PROJECTS) {
  if (checkExists.get(proj.name)) {
    console.log(`  ⏭  Skipping (already exists): ${proj.name}`);
    skipped++;
    continue;
  }

  const projectId = uuid();
  insertProject.run({
    id: projectId,
    name: proj.name,
    description: proj.description,
    managerId: adminId,
    xmlConfig: proj.xmlConfig,
    guidelines: proj.guidelines,
    ts,
  });

  insertStats.run(projectId);
  insertMember.run(projectId, adminId);

  for (const pt of proj.points) {
    insertPoint.run({
      id: uuid(),
      projectId,
      content: pt.content,
      annotation: pt.annotation,
      status: pt.status,
      metadata: '{}',
      ts,
    });
  }

  console.log(`  ✓  Created: ${proj.name} (${proj.points.length} items)`);
  created++;
}

console.log(`\nDone — ${created} project(s) created, ${skipped} skipped.`);
db.close();
