Создайте локальный файл окружения `.env.local` в корне проекта со значениями по умолчанию для разработки:

```
# База данных (SQLite в dev)
DATABASE_URL="file:./prisma/dev.db"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="dev-secret-change-me"
```

Сохраните файл и выполните:

```
npx prisma generate
npx prisma db push
```

Для сидов пользователей (после создания файла `prisma/seed.cjs`):

```
npx prisma db seed
```
