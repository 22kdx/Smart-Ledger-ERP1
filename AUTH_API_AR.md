# المصادقة الداخلية لـ TAMM ERP

لا يعتمد هذا التنفيذ على Keycloak أو Clerk أو خدمة هوية مستضافة. لم يُطبّق أي ترحيل على قاعدة بيانات خلال هذا العمل، ولم تُقرأ أو تُنقل بيانات التخزين المحلي.

## الجداول

| الجدول | الغرض |
| --- | --- |
| `auth_users` | الحسابات، البريد الموحّد، الاسم، تجزئة كلمة المرور، وحالة الحساب. |
| `auth_refresh_tokens` | تجزئة SHA-256 لكل refresh token، مجموعة الجلسة، الانتهاء والإبطال والاستبدال. لا يُخزّن النص الأصلي للرمز. |
| `auth_login_throttles` | عدد المحاولات ووقت القفل، بمفتاحي بريد وIP مجزّأين. |
| `auth_audit_events` | أحداث التسجيل والدخول والفشل والقفل والتدوير والخروج؛ البريد وIP مجزّآن، ولا تُسجّل كلمات المرور أو الرموز. |
| `auth_role_permissions` | ربط الدور بالصلاحيات؛ تُضاف الصلاحيات الأساسية بواسطة الترحيل `0001_internal_auth.sql`. |
| `company_memberships` | عضوية المستخدم في المنشأة ودوره. يجب أن يكون `user_id` هو UUID لحساب `auth_users`؛ لا يحوّل التنفيذ تلقائيًا معرّفات مزود الهوية السابق. |

الأدوار والصلاحيات المعرفة حاليًا:

- `owner` و`admin`: إدارة المنشأة والأعضاء والإعدادات والحسابات والقيود والمبيعات والمشتريات والمخزون والموارد البشرية.
- `accountant`: قراءة وإدارة الحسابات والقيود، وقراءة المنشأة والمبيعات والمخزون.
- `sales`: قراءة وإدارة المبيعات.
- `purchasing`: قراءة وإدارة المشتريات.
- `inventory`: قراءة وإدارة المخزون.
- `hr`: قراءة وإدارة الموارد البشرية.
- `viewer`: قراءة المنشأة والحسابات والقيود والمبيعات والمشتريات والمخزون والموارد البشرية.

تُستخرج صلاحية المستخدم في كل طلب منشأة من `company_memberships` و`auth_role_permissions` في قاعدة البيانات. لا تُقبل عضوية أو صلاحية من claims التوكن. إنشاء منشأة يضيف منشئها بصفة `owner`؛ إضافة عضو تتطلب `members:manage`، ولا يمكن إسناد `owner` عبر مسار إضافة الأعضاء. إسناد `admin` متاح للمالك فقط.

## المسارات

العنوان الأساسي هو `/api`:

| المسار | المصادقة | الغرض |
| --- | --- | --- |
| `POST /auth/register` | عامة، محدودة المعدل | تسجيل حساب وإرجاع جلسة. |
| `POST /auth/login` | عامة، محدودة المعدل | دخول بالبريد وكلمة المرور. |
| `POST /auth/refresh` | refresh token في الجسم، محدودة المعدل | تدوير refresh وإصدار جلسة جديدة. |
| `POST /auth/logout` | refresh token في الجسم، محدودة المعدل | إبطال عائلة refresh token. |
| `GET /auth/me` | Bearer access token | إرجاع المستخدم الحالي. |
| `GET /companies` | Bearer access token | إرجاع المنشآت التي ينتمي إليها المستخدم فقط. |
| `POST /companies` | Bearer access token | إنشاء منشأة وربط المستخدم بها كمالك. |
| `GET /companies/{companyId}/authorization` | Bearer + عضوية + `companies:read` | إرجاع دور وصلاحيات المستخدم في المنشأة. |
| `POST /companies/{companyId}/members` | Bearer + عضوية + `members:manage` | إضافة حساب مسجل إلى المنشأة. |

مسارات الحسابات والقيود ليست منفذة في خادم Express حاليًا. عند تنفيذ أي مسار بيانات جديد، يجب وضع `requireAuthenticatedUser` ثم `requireCompanyPermission` المناسب قبل أي قراءة أو كتابة بيانات للمنشأة؛ تعريف المسار في OpenAPI وحده لا يطبّق الحماية.

## مدد الحماية

- كلمة المرور: bcrypt cost 12، بحد أدنى 12 بايت وحد أقصى 72 بايت.
- Access token: JWT موقّع بـHS256 ومدته 15 دقيقة.
- Refresh token: قيمة عشوائية 256-bit، مدته 30 يومًا، وتُخزّن تجزئته فقط. كل تدوير يُبطل الرمز السابق؛ إعادة استخدام رمز قديم تُبطل عائلة الجلسة.
- قفل الدخول: 5 محاولات فاشلة لكل بريد وIP خلال 15 دقيقة، ثم قفل 15 دقيقة. يعيد الخادم رسالة عامة `invalid_credentials`.
- محددات الطلبات لكل عملية API: التسجيل 5/ساعة/IP، الدخول 10/15 دقيقة/IP، التحديث والخروج 30/15 دقيقة/IP. محددات الطلبات العامة في الذاكرة لكل عملية؛ لتعدد العمليات ضع محددًا عند الوكيل العكسي أيضًا.
- خلف وكيل عكسي موثوق فقط، عيّن `TRUST_PROXY_HOPS` إلى عدد القفزات الصحيح. لا تفعّل الثقة العمياء بكل ترويسات `X-Forwarded-For`.
- استخدم HTTPS على VPS؛ أمثلة HTTP أدناه مخصصة للاتصال المحلي عبر loopback فقط.

## أمثلة الطلب والرد

### تسجيل حساب

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "owner@example.test",
  "password": "correct horse battery",
  "displayName": "Owner"
}
```

يرجع `201`:

```json
{
  "user": {
    "id": "UUID",
    "email": "owner@example.test",
    "displayName": "Owner"
  },
  "accessToken": "ACCESS_TOKEN",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshToken": "REFRESH_TOKEN",
  "refreshExpiresIn": 2592000
}
```

### تسجيل الدخول

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "owner@example.test",
  "password": "correct horse battery"
}
```

يرجع `200` بنفس بنية جلسة التسجيل. كلمة المرور لا تظهر في الرد أو السجل.

### المستخدم الحالي

```http
GET /api/auth/me
Authorization: Bearer ACCESS_TOKEN
```

يرجع `200` مع `{ "user": { "id": "UUID", "email": "...", "displayName": "..." } }`.

### إنشاء منشأة ثم قراءة العضوية

```http
POST /api/companies
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{ "name": "شركة اختبار" }
```

يرجع `201` بمنشأة يكون دور المستخدم الحالي فيها `owner`، ولا تُفرض عملة أو ضريبة.

```http
GET /api/companies/{companyId}/authorization
Authorization: Bearer ACCESS_TOKEN
```

يرجع `200` مع `companyId` و`role` وقائمة `permissions`. التوكن الصحيح بلا عضوية يرجع `403 company_access_denied`.

### إضافة عضو

```http
POST /api/companies/{companyId}/members
Authorization: Bearer OWNER_ACCESS_TOKEN
Content-Type: application/json

{
  "email": "member@example.test",
  "role": "accountant"
}
```

يرجع `201` مع `{ "userId": "UUID", "email": "...", "role": "accountant" }`. يجب أن يكون الحساب مسجلًا أولًا.

### تدوير الجلسة والخروج

```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "CURRENT_REFRESH_TOKEN" }
```

يرجع `200` بجلسة جديدة؛ خزّن refresh الجديد واستبدل القديم فورًا.

```http
POST /api/auth/logout
Content-Type: application/json

{ "refreshToken": "CURRENT_REFRESH_TOKEN" }
```

يرجع `200` مع `{ "ok": true }`. يُبطل الخادم عائلة refresh؛ access token الصادر سابقًا يظل صالحًا حتى انتهاء 15 دقيقة، بينما يمسحه العميل من الذاكرة عند الخروج.

## تشغيل واختبار محلي

استخدم قاعدة PostgreSQL محلية **فارغة ومخصصة للاختبار**. لا تنفذ `push` أو SQL على قاعدة بيانات الإنتاج أو بيانات ERP الحالية.

```sh
# أنشئ قاعدة محلية فارغة باسم midad_auth_test أولًا.
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/midad_auth_test'

# ينشئ مخطط التطبيق محليًا؛ لا تستخدم قاعدة إنتاج هنا.
pnpm --filter @workspace/db run push

# يضيف أدوار وصلاحيات المصادقة، ويعمل بعد إنشاء المخطط.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0001_internal_auth.sql

# ولّد سرًا محليًا للجلسات؛ لا تحفظه في ملف المشروع أو Git.
export AUTH_ACCESS_TOKEN_SECRET="$(openssl rand -hex 32)"
export PORT=5000
pnpm --filter @workspace/api-server run dev
```

اختبارات الوحدة لا تحتاج إلى قاعدة بيانات:

```sh
pnpm --filter @workspace/api-server run test:auth
```

لاختبار مستودع PostgreSQL ومسارات المصادقة فعليًا، أنشئ قاعدة محلية فارغة مخصصة للاختبار فقط، واسمها ينتهي بـ`_test`. نفّذ `pnpm --filter @workspace/db run push` عليها ثم ملف الترحيل أعلاه، وبعدها شغّل:

```sh
TEST_DATABASE_URL='postgresql://USER@127.0.0.1:5432/tamm_auth_test' \
  pnpm --filter @workspace/api-server run test:auth:postgres
```

يرفض اختبار PostgreSQL المضيف غير المحلي، واسم القاعدة الذي لا ينتهي بـ`_test`، وأي قاعدة تحتوي سجلات مصادقة أو منشآت. لا توجّه هذا الاختبار إلى قاعدة مستخدمة أو إنتاجية؛ فهو ينشئ سجلات اختبار ويحذفها بعد اكتماله.

وفي نافذة طرفية ثانية، اختبر دخولًا محليًا عبر HTTP:

```sh
export API_BASE_URL='http://127.0.0.1:5000/api'
curl -sS "$API_BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.test","password":"correct horse battery","displayName":"Owner"}'

curl -sS "$API_BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.test","password":"correct horse battery"}'
```

يجب تشغيل API مع `DATABASE_URL` و`AUTH_ACCESS_TOKEN_SECRET`؛ من دونهما يبقى فحص الصحة متاحًا وتعيد مسارات المصادقة `503 auth_unavailable`. `AUTH_TOKEN_ISSUER` و`AUTH_TOKEN_AUDIENCE` اختياريان ولهما قيم تطبيق افتراضية. لا تضف أيًا من هذه القيم السرية إلى ملفات المشروع.

## عميل الهاتف

يُبقي التطبيق Access token في الذاكرة فقط، ويحفظ Refresh token عبر `expo-secure-store` (Keychain على iOS وKeystore على Android). واجهة `authClient` تعرض `getToken` و`refresh` و`logout` و`currentUser` إضافة إلى `register` و`login`. لا يوضع أي رمز مصادقة في AsyncStorage. لم تُضف شاشات دخول؛ واجهة المصادقة منفصلة عن الشاشات حتى يمكن توصيلها لاحقًا دون تغيير تنفيذ الخادم.
