/**
 * Seed: Arabic NER Demo Project
 *
 * Creates a project that showcases the AI structured-output feature for
 * Arabic Named Entity Recognition (NER). Sentences are divided into two
 * tiers:
 *
 *  · Straightforward — clear, distinct entities; good for verifying the
 *    AI structured-output pipeline works end-to-end.
 *
 *  · Challenging — designed to trip up LLMs and make the Edit workflow
 *    genuinely useful:
 *      - "بن/ابن" name chains (AI often truncates or splits them)
 *      - Common nouns used as company names (النور، الفجر)
 *      - Definite-article elision after proclitic (للربع → الربع)
 *      - Multiple entities of the same type in one sentence
 *      - Nested entities (person name inside organisation name)
 *      - Organisations with very long official names
 *      - Dates written entirely in Arabic words (no digits)
 *      - Transliterated foreign names with ambiguous boundaries
 *
 * Run:
 *   node server/scripts/seedArabicNER.js          # create (skip if exists)
 *   node server/scripts/seedArabicNER.js --force  # drop & recreate
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const FORCE = process.argv.includes('--force');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH  = path.join(DATA_DIR, 'databayt.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}. Start the server once first to initialise the DB.`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ── XML annotation config ────────────────────────────────────────────────────

const XML_CONFIG = `<annotation-config>
  <field id="entities" type="entity-list" required="true">
    <label>الكيانات المستخرجة</label>
    <entity-types>
      <type value="PER"  label="شخص" />
      <type value="ORG"  label="منظمة" />
      <type value="LOC"  label="مكان" />
      <type value="DATE" label="تاريخ" />
      <type value="MISC" label="متفرق" />
    </entity-types>
  </field>
</annotation-config>`;

// ── Upload prompt ────────────────────────────────────────────────────────────

const UPLOAD_PROMPT = `أنت خبير في التعرف على الكيانات المسماة في النصوص العربية.
استخرج جميع الكيانات المسماة من النص التالي.

أنواع الكيانات:
- PER  : اسم شخص (سياسي، رياضي، عالم، شخصية تاريخية...)
- ORG  : منظمة أو مؤسسة (شركة، جامعة، حكومة، فريق...)
- LOC  : مكان جغرافي (دولة، مدينة، منطقة، نهر، جبل...)
- DATE : تاريخ أو فترة زمنية (سنة، شهر، يوم، حقبة...)
- MISC : كيانات مسماة أخرى (جوائز، مبادرات، معاهدات، منتجات...)

لكل كيان أعطِ: النص الحرفي كما يظهر في الجملة، النوع، وموضع البداية والنهاية (بالأحرف).`;

// ── Sentences ────────────────────────────────────────────────────────────────

// Tier 1 – straightforward, verify the pipeline works
const SIMPLE = [
  `أعلنت شركة أرامكو السعودية عن نتائجها المالية للربع الثالث من عام 2023، مسجلةً أرباحاً صافية بلغت 121 مليار ريال.`,

  `زار الرئيس الفرنسي إيمانويل ماكرون مدينة الرياض في أكتوبر 2023، والتقى بولي العهد الأمير محمد بن سلمان لبحث العلاقات الثنائية.`,

  `وقّعت جامعة الملك عبدالله للعلوم والتقنية (كاوست) اتفاقية شراكة استراتيجية مع معهد ماساتشوستس للتكنولوجيا لتطوير برامج الذكاء الاصطناعي.`,

  `أسّس جيف بيزوس شركة أمازون عام 1994 في مدينة سياتل بولاية واشنطن، لتتحوّل لاحقاً إلى أكبر منصة للتجارة الإلكترونية في العالم.`,

  `فاز المنتخب المغربي بلقب كأس أمم أفريقيا عام 2022، بعد نهائي مثير أمام المنتخب السنغالي في مدينة ياوندي بالكاميرون.`,

  `حصل الروائي المصري نجيب محفوظ على جائزة نوبل للآداب عام 1988، ليصبح أول كاتب عربي يحظى بهذا التكريم العالمي.`,

  `أصدر البنك المركزي السعودي (ساما) تقريره السنوي لعام 2023، مشيراً إلى تسارع نمو الناتج المحلي الإجمالي في المملكة العربية السعودية.`,

  `انطلقت بطولة كأس العالم لكرة القدم 2022 في الدوحة بدولة قطر في نوفمبر، وتوّج المنتخب الأرجنتيني بقيادة ليونيل ميسي باللقب.`,

  `تُعدّ قناة السويس، التي تمتد بين مدينتَي بورسعيد والسويس في مصر، من أهم الممرات المائية الدولية منذ افتتاحها عام 1869.`,
];

// Tier 2 – challenging, designed to produce AI mistakes worth correcting
const HARD = [
  // 1. Long "بن" name chain — AI often truncates or splits the name mid-chain
  `عيّن مجلس الوزراء السعودي الأمير عبد العزيز بن سلمان بن عبد العزيز آل سعود وزيراً للطاقة، ليتولى الإشراف على ملف أوبك+ اعتباراً من سبتمبر 2019.`,

  // 2. Common nouns as company names — "النور" and "الفجر" look like adjectives
  `أعلنت شركة النور للاتصالات أن اندماجها مع مجموعة الفجر للإعلام سيُنجز بحلول الربع الأول من عام 2026، وسيُفرز كياناً يضم أكثر من ثلاثة ملايين مشترك.`,

  // 3. Definite-article elision + three persons in one sentence
  `شارك كلٌّ من أحمد الجارالله وعبد الحميد الحكيم ومحمد عبد الكريم في مؤتمر أبوظبي للمناخ الذي عُقد في نوفمبر 2024، وقدّم كلٌّ منهم ورقةً بحثيةً حول آليات خفض الانبعاثات.`,

  // 4. Person name embedded inside a university name — nested entity
  `استضافت جامعة الأميرة نورة بنت عبد الرحمن ملتقى المرأة والتكنولوجيا في الرياض في أكتوبر 2023، بمشاركة أكثر من خمسين متحدثةً من عشرين دولة.`,

  // 5. Very long official country name + city — AI often shortens it
  `أعلنت منظمة الصحة العالمية عن رصد بؤرة وبائية جديدة في مدينة كيسانغاني بجمهورية الكونغو الديمقراطية خلال مارس 2024، وطالبت بتوفير جرعات لقاح طارئة.`,

  // 6. Date written entirely in Arabic words — no digits, Islamic calendar
  `وقّع الطرفان على معاهدة السلام في الثامن والعشرين من شهر رجب عام ألف وأربعمائة وخمسة وأربعين للهجرة، في حفل رسمي أُقيم بقصر الحمراء بغرناطة.`,

  // 7. Three orgs in one sentence connected by و — boundaries hard to separate
  `تعاونت كلٌّ من مايكروسوفت وجوجل وميتا مع المعهد الوطني للمعايير والتكنولوجيا الأمريكي لوضع إطار تنظيمي مشترك للذكاء الاصطناعي يُطبَّق في دول مجموعة العشرين.`,

  // 8. Transliterated name with ambiguous start/end + person vs org confusion
  `أكد الرئيس التنفيذي لمجموعة ستيلانتيس كارلوس تافاريس أن المجموعة ستُدشّن مصنعها الجديد في مدينة كيزيلتبه التركية مطلع عام 2025، بطاقة إنتاجية تبلغ 200 ألف سيارة سنوياً.`,

  // 9. Historical entity + MISC (Silk Road) + ambiguous date format
  `أصدر الخليفة العباسي هارون الرشيد مرسوماً في بغداد عام 786 ميلادية يُلزم التجار على طريق الحرير بدفع رسوم المرور عند المحطات الكبرى من سمرقند إلى أنطاكية.`,

  // 10. Two locations that share a token + organisation vs location ambiguity
  `أعلن بنك مصر ومجموعة بنك أبوظبي الأول عن إتمام صفقة الاندماج في القاهرة بحضور محافظ البنك المركزي المصري حسن عبد الله، في خطوة تُعيد رسم خريطة القطاع المصرفي في شمال أفريقيا.`,
];

const ALL_SENTENCES = [...SIMPLE, ...HARD];

// ── Insert ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'demo-arabic-ner-001';

if (FORCE) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(PROJECT_ID);
  console.log(`Dropped existing project "${PROJECT_ID}".`);
}

const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(PROJECT_ID);
if (existing) {
  console.log(`Project "${PROJECT_ID}" already exists — run with --force to recreate.`);
  process.exit(0);
}

const now = Date.now();

db.prepare(`
  INSERT INTO projects
    (id, name, description, manager_id, xml_config, upload_prompt, custom_field_name,
     task_type, is_demo, created_at, updated_at)
  VALUES
    (?, ?, ?, NULL, ?, ?, NULL, 'custom', 1, ?, ?)
`).run(
  PROJECT_ID,
  'التعرف على الكيانات المسماة — العربية',
  'مشروع تجريبي لاستخراج الكيانات المسماة من نصوص عربية. يضم جملاً بسيطة للتحقق من الأداء، وأخرى معقدة (سلاسل الأسماء، الأعداد بالحروف، المؤسسات ذات الأسماء المشتركة مع الكلمات الشائعة) تُبرز قيمة مراجعة مخرجات الذكاء الاصطناعي وتعديلها.',
  XML_CONFIG,
  UPLOAD_PROMPT,
  now, now
);

db.prepare(`INSERT OR IGNORE INTO project_stats (project_id) VALUES (?)`).run(PROJECT_ID);

const insertDP = db.prepare(`
  INSERT INTO data_points
    (id, project_id, content, type, ai_suggestions, ratings, status,
     custom_field_values, metadata, display_metadata,
     upload_prompt, created_at, updated_at)
  VALUES
    (?, ?, ?, 'text', '{}', '{}', 'pending', '{}', '{}', '{}', ?, ?, ?)
`);

db.transaction((sentences) => {
  for (const text of sentences) {
    insertDP.run(randomUUID(), PROJECT_ID, text, UPLOAD_PROMPT, now, now);
  }
})(ALL_SENTENCES);

console.log(`✓ Created Arabic NER demo project — ${SIMPLE.length} simple + ${HARD.length} challenging = ${ALL_SENTENCES.length} total.`);
console.log(`  Project ID  : ${PROJECT_ID}`);
console.log(`  Challenging : long بن-chains, common-noun orgs, elided ال, nested entities,`);
console.log(`                dates in Arabic words, three orgs in one sentence, transliterations.`);
