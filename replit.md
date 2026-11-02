# مدار ERP

تطبيق إدارة موارد أعمال باللغة العربية، يضم المبيعات والمخزون والمالية ويدعم الريال اليمني والسعودي والدولار الأمريكي.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

النسخة الحالية نموذج أولي لتطبيق جوال عربي RTL لإدارة الأعمال. تعرض واجهات للرئيسية والمبيعات والمخزون والمالية والمزيد، وتتضمن نماذج بيانات للفواتير والأصناف والحركات المالية والقيود والموظفين والعملاء والموردين. تفاصيل الحالة الراهنة، وما ينقص لتصبح البيانات مشتركة بين المستخدمين، موجودة في `.agents/PROJECT_STATUS.md`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
