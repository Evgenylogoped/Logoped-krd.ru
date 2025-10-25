# logoped-krd (NovikovDom) — SaaS платформа

Next.js 14 + TypeScript + Tailwind + Prisma + NextAuth.

## Быстрый старт (dev)

1) Создайте `.env.local` (см. `ENV_README.md`):

```
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="dev-secret-change-me"
```

2) Генерация клиента и база:

```
npm i
npx prisma generate
npx prisma db push
```

3) Запуск:

```
npm run dev
```

Откройте http://localhost:3000

## Основные URL (MVP)

- Админ‑панель: `/admin`
- Компании/Филиалы/Группы: `/admin/companies`, `/admin/branches`, `/admin/groups`
- Договоры/Платежи: `/admin/contracts`, `/admin/payments`
- Пользователи (роли): `/admin/users`
- Логопед: `/logoped/schedule`
- Родитель: `/parent/children`, `/parent/documents`, `/parent/enrollments`

## Прод деплой (Ubuntu 24, Docker)

Готовые файлы в директории `deploy/`:

- `deploy/docker-compose.yml` — сервисы: `app`, `db` (Postgres), `nginx`
- `deploy/nginx.conf` — прокси на `app:3000`, статика и uploads
- `deploy/init.sql` — начальная инициализация БД PostgreSQL
- Переменные окружения перед запуском задайте через shell/CI (см. ниже)

Переменные окружения (prod):

```
export NEXTAUTH_URL="https://logoped-krd.ru"
export NEXTAUTH_SECRET="<случайная_строка>"
export DATABASE_URL="postgresql://app:app@db:5432/logoped?schema=public"
export POSTGRES_USER=app
export POSTGRES_PASSWORD=app
export POSTGRES_DB=logoped
```

Запуск:

```
cd deploy
docker compose up -d --build
```

## Healthcheck

`/api/health` → `{ status: 'ok' }`

## Примечания

- В dev используется SQLite, в prod — PostgreSQL.
- Файлы хранятся в `public/uploads/*` (документы/логотипы компаний/контракты).

---

## PWA (установка и офлайн)

- Манифест: `public/manifest.json`
- Service Worker: `public/sw.js` (регистрируется только в production)
- Регистрация: `components/PWARegister.tsx`
- Подсказка установки (мобайл): `components/marketing/InstallHint.tsx`

Как протестировать локально:

1) Прод-сборка
```
npm run build
NODE_ENV=production npm start
```
2) Откройте http://localhost:3000 и проверьте в Chrome DevTools → Application → Manifest/Service Workers.
3) Для офлайна включите Offline в DevTools — статика будет из кэша, навигация/`/api/*` — по сети.

## OAuth (Google / Яндекс / VK)

- Конфиг провайдеров: `lib/auth.ts` (включаются по наличию ENV)
- Кнопки на `/login`: `app/login/page.tsx`

ENV/.env.local (пример):
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev_secret_change_me
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...
VK_CLIENT_ID=...
VK_CLIENT_SECRET=...
```

Redirect URI для локали:
- http://localhost:3000/api/auth/callback/google
- http://localhost:3000/api/auth/callback/yandex
- http://localhost:3000/api/auth/callback/vk

## Android TWA (публикация в Google Play)

1) Установить Bubblewrap CLI
```
npm i -g @bubblewrap/cli
```
2) Инициализация проекта TWA
```
bubblewrap init --manifest=https://logoped-krd.ru/manifest.json
```
Альтернатива вручную: `bubblewrap init` и указать Host: `logoped-krd.ru`, Package ID: `ru.logoped.krd`.

3) Сборка релиза
```
bubblewrap build
# или ./gradlew bundleRelease
```

4) Получить SHA-256 отпечаток ключа и прописать в `public/.well-known/assetlinks.json`
```
keytool -list -v -keystore <release.keystore> -alias <alias> | grep 'SHA256'
```

5) Задеплоить сайт по HTTPS и убедиться, что файл доступен:
```
https://logoped-krd.ru/.well-known/assetlinks.json
```

6) Загрузить `.aab` в Google Play Console (Closed testing → Production).

## Проверка лендинга

- Гость: `app/page.tsx` (маркетинговые секции и `InstallHint` перед футером)
- Отрисовка секций: `components/marketing/*` (`Header`, `Hero`, `Features`, `Audience`, `Screens`, `Pricing`, `FAQ`, `Footer`)
- 3D/Glass эффекты автоматически упрощаются на мобильных и при `prefers-reduced-motion`.
