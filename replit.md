# مدار ERP

تطبيق إدارة موارد أعمال باللغة العربية، يضم المبيعات والمخزون والمالية ويدعم الريال اليمني والسعودي والدولار الأمريكي.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `DATABASE_URL` is for the user's own PostgreSQL server (or a local development database); never use Replit-managed database/storage or keep its value in project files or Replit secrets.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- تطبيق الجوال: `artifacts/midad-erp/`
- واجهات التطبيق وحالته المحلية: `artifacts/midad-erp/components/`
- الخادم: `artifacts/api-server/`
- عقد API: `lib/api-spec/openapi.yaml`
- مخططات قاعدة البيانات: `lib/db/src/schema/`
- سجل التسليم الحالي والخطوات التالية: `.agents/PROJECT_STATUS.md`

## استمرارية العمل بين المحادثات

- قبل بدء أي عمل، اقرأ `.agents/PROJECT_STATUS.md` ثم تحقق من الحالة الفعلية في الملفات؛ الملف ملخص قابل للتحديث وليس بديلًا عن فحص الكود.
- أكمل أعلى خطوة مفتوحة في سجل التسليم، ولا تعِد بناء ما هو منجز.
- بعد كل مرحلة مهمة أو عند التوقف، حدّث سجل التسليم: ما أُنجز، ما لم يُنجز، ما تم التحقق منه، والخطوة التالية والعوائق.
- لا تسجّل ميزة على أنها مكتملة إلا بعد التحقق منها. لا تضع كلمات مرور أو مفاتيح أو أسرارًا في سجل التسليم.
- مشاركة المشروع مع متعاونين في Replit تتيح لهم الوصول إلى ملفات التطوير، لكنها لا تجعل بيانات التطبيق المحلية مشتركة تلقائيًا.

## Architecture decisions

- Business settings that can differ between companies (name, country, base/allowed currencies, taxes, exchange rates, base prices/price lists, fiscal year, and similar values) must be editable per company; sample defaults must never be silently treated as confirmed business policy.
- All app network requests go through one API client. It reads the single `API_BASE_URL` value from a runtime-editable configuration file, changeable without rebuilding; screens must not contain server URLs or make direct requests.
- The user's own server is the only permanent data source. Local storage is a cache/offline layer only, and unsynced changes must remain identifiable and protected until the server confirms them.
- Keep the app and API portable for manual transfer to the user's VPS after the app is complete. Do not depend on Replit-only database, auth, secrets, file paths, or automatic deployment; do not publish without the user's explicit request.
- At final delivery, add a root `README.md` with build/run steps, the API client functions and expected API fields, runtime URL configuration, and VPS transfer instructions.

## Product

النسخة الحالية نموذج أولي لتطبيق جوال عربي RTL لإدارة الأعمال. تعرض واجهات للرئيسية والمبيعات والمخزون والمالية والمزيد، وتتضمن نماذج بيانات للفواتير والأصناف والحركات المالية والقيود والموظفين والعملاء والموردين. تفاصيل الحالة الراهنة، وما ينقص لتصبح البيانات مشتركة بين المستخدمين، موجودة في `.agents/PROJECT_STATUS.md`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
