# RBAC: Роли и права в системе

Дата: 2025-10-05
Версия: 1.0

## Цели
- Единая точка правды по ролям и правам.
- Основа для реализации проверок в `middleware.ts` и server actions.
- Основа для миграций Prisma и UI (назначение/снятие ролей).

## Термины
- Пользователь (User): участник системы.
- Организация (Organization): юридическое лицо/группа.
- Филиал (Branch): подразделение организации.
- Логопед (Logoped): специалист.
- Родитель (Parent): клиент/законный представитель.

## Иерархия ролей (высший → низший)
1) SUPER_ADMIN
2) ADMIN
3) ACCOUNTANT (Бухгалтер)
4) ORG_MANAGER (Руководитель организации)
5) BRANCH_MANAGER (Руководитель филиала)
6) LOGOPED (Логопед)
7) PARENT (Родитель)

Примечания:
- ADMIN включает все права ACCOUNTANT + расширенный пользовательский менеджмент и аудит действий бухгалтера.
- SUPER_ADMIN включает все права ADMIN + серверное администрирование, аудит уровня инфраструктуры и операции очистки/архивации.
- Руководитель (Manager) делится на два вида: ORG_MANAGER и BRANCH_MANAGER.

## Общий список прав (capabilities)
- users.read / users.write / users.delete — управление пользователями и их профилями
- roles.assign / roles.revoke — назначение и снятие ролей
- org.read / org.write — управление организациями
- branch.read / branch.write — управление филиалами
- finance.read / finance.write — просмотр/изменение финансовых данных
- tariffs.read / tariffs.write — управление тарифами логопедов
- audit.read / audit.write — просмотр/коррекция журналов действий
- chat.moderate — модерация/очистка чатов
- storage.read / storage.clean — просмотр/очистка файлов/медиа
- server.observe / server.maintain — метрики/нагрузка/техоперации (безопасные)

## Матрица прав по ролям
- SUPER_ADMIN
  - Все права: users.*, roles.*, org.*, branch.*, finance.*, tariffs.*, audit.*, chat.moderate, storage.*, server.*
- ADMIN
  - users.read/write/delete
  - roles.assign/revoke (кроме назначения/снятия ролей ADMIN/SUPER_ADMIN самому себе и SUPER_ADMIN другим)
  - org.read, branch.read
  - finance.read/write
  - tariffs.read/write
  - audit.read/write (включая логи бухгалтера)
  - chat.moderate
  - storage.read (clean — по политике, чаще недоступно ADMIN, только SUPER_ADMIN)
  - server.observe (только чтение метрик)
- ACCOUNTANT (Бухгалтер)
  - finance.read/write (все финансы связки логопед—руководитель)
  - tariffs.read/write (тарифы логопедам)
  - users.read (для сверки/сопоставления)
  - audit.read (в пределах бухгалтерии)
- ORG_MANAGER (Руководитель организации)
  - org.read/write (в пределах своей организации)
  - branch.read/write (управление филиалами своей организации)
  - users.read (в рамках орг‑скоупа)
  - finance.read (агрегаты/отчёты по своей организации)
  - chat.moderate (в рамках орг‑скоупа, по политике)
- BRANCH_MANAGER (Руководитель филиала)
  - branch.read/write (в пределах своего филиала)
  - users.read (в пределах филиала)
  - finance.read (метрики/отчёты филиала)
- LOGOPED
  - chat (свои диалоги), клиенты (свои), загрузки (свои)
  - ограниченный доступ к орг/филиал данным (только чтение, если требуется)
- PARENT
  - доступ к собственным данным/чатам/записям, без административных прав

## Скоупы доступа
- Глобальный (GLOBAL): SUPER_ADMIN, ADMIN, ACCOUNTANT (по финансам/тарифам)
- Организационный (ORG): ORG_MANAGER, пользователи и данные в рамках одной организации
- Филиал (BRANCH): BRANCH_MANAGER, пользователи и данные в рамках одного филиала
- Персональный (SELF): LOGOPED, PARENT — только собственные данные/диалоги/медиа

## Начисление и назначение ролей
- Глобальные роли: SUPER_ADMIN, ADMIN, ACCOUNTANT — назначаются глобально (на уровне `User`)
- Скоупные роли:
  - ORG_MANAGER — привязка к конкретной `Organization`
  - BRANCH_MANAGER — привязка к конкретному `Branch`
  - LOGOPED — может принадлежать `Organization` и `Branch` (основное место)
  - PARENT — без орг‑привязки

## Предлагаемая модель Prisma (высокоуровнево)
- enum Role { SUPER_ADMIN ADMIN ACCOUNTANT LOGOPED PARENT }
- model User { id, email, role Role @default(PARENT), ... }
- model Organization { id, ... }
- model Branch { id, organizationId, ... }
- model UserOrganizationRole { id, userId, organizationId, role String @default("ORG_MANAGER") }
- model UserBranchRole { id, userId, branchId, role String @default("BRANCH_MANAGER") }

Альтернатива: единая `UserScopedRole` с полем `scopeType` (ORG/BRANCH) и `scopeId`.

## Enforcement (проверки доступа)
- `middleware.ts`:
  - Блоки `/admin/**` — только ADMIN, SUPER_ADMIN
  - Блоки бухгалтерии `/admin/finance/**` — ACCOUNTANT, ADMIN, SUPER_ADMIN
  - Тарифы `/admin/finance/tariffs/**` — ACCOUNTANT, ADMIN, SUPER_ADMIN
- Server Actions (например, `app/(dash)/admin/users/actions.ts`):
  - Promote/Demote: разрешено ADMIN, SUPER_ADMIN (с ограничениями на операции с ADMIN/SUPER_ADMIN)
  - Назначение ORG_MANAGER/BRANCH_MANAGER — ADMIN, SUPER_ADMIN
- API‑роуты (например, `app/api/**`):
  - Проверка роли + проверка скоупа (orgId/branchId)

## Аудит и безопасность
- `AdminAudit`: кто → кого, когда, какие права назначил/снял
- Логи бухгалтерии: отдельное логирование (действия ACCOUNTANT)
- Журнал модерации чатов: действия `chat.moderate`
- Политика удаления/архивации (SUPER_ADMIN): ограниченные операции с логированием

## UI‑модули для управления ролями
- `/app/(dash)/admin/users/page.tsx` — список пользователей, Promote/Demote
- `/app/(dash)/admin/organizations/**` — назначение ORG_MANAGER
- `/app/(dash)/admin/branches/**` — назначение BRANCH_MANAGER
- `/app/(dash)/admin/audit/**` — просмотры/фильтры журналов

## Отдельные роли и нюансы
- ACCOUNTANT не может редактировать роли ADMIN/SUPER_ADMIN.
- ADMIN может править всех пользователей, кроме ограничения на операции с SUPER_ADMIN; действия — логируются.
- SUPER_ADMIN имеет расширенные серверные операции: метрики, очистки, архивы (всё — с логированием и подтверждениями).

## Инкрементальная реализация
1) Миграция Prisma глобальных ролей (Role enum) + назначение через server actions
2) Введение скоупных ролей (ORG/BRANCH) + проверки в нужных разделах
3) Расширение `middleware.ts` и use‑guards для UI
4) Аудит критических путей (финансы, тарифы, загрузки, чат)
5) Логи и страницы аудита

## Приложение: маршруты и предполагаемые роли
- `/admin/**`: ADMIN, SUPER_ADMIN
- `/admin/finance/**`: ACCOUNTANT, ADMIN, SUPER_ADMIN
- `/admin/finance/tariffs/**`: ACCOUNTANT, ADMIN, SUPER_ADMIN
- `/settings/organization/**`: ORG_MANAGER (для своей организации), ADMIN, SUPER_ADMIN
- `/chat/**`: пользователи в рамках своих скоупов; модерация — ORG/BRANCH_MANAGER, ADMIN, SUPER_ADMIN
