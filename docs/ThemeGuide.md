# Руководство по теме и вторичному тексту

Этот документ описывает правила использования токена `text-muted`, адаптации под тёмную тему и практики для единообразного оформления.

## Зачем `text-muted`
- **Консистентность.** Один токен для вторичного текста вместо набора серых (`text-gray-500/600/700`).
- **Читаемость в тёмной теме.** `text-muted` маппится на CSS‑переменную `--muted-text`, которая переопределяется в тёмной теме.
- **Гибкость.** Значение можно менять централизованно через `app/globals.css`.

## Где использовать `text-muted`
- **Подписи и вторичные тексты.** Даты/время, описания, пустые состояния, субтайтлы, неактивные подписи.
- **Лейблы форм.** Если лейбл не является основным контентом.
- **В плейсхолдерах.** Например, «Нет фото» в аватарах.

## Где НЕ использовать `text-muted`
- **Основной контент.** Заголовки, важные значения, кликабельные элементы c акцентом.
- **Акцентные статусы/бейджи.** Использовать брендовые/статусные цвета.

## Тёмная тема: ключевые правила
- **Вторичный текст.** `--muted-text` светлее основного текста, но не конкурирует с ним.
- **Светлые плашки и ховеры.** Уже перекрыты в `app/globals.css`:
  - `[data-theme="dark"] .bg-white`, `.bg-white/90`, `.bg-white/95`, `.supports-[backdrop-filter]:bg-white/70` → миксуются с `--card-bg`.
  - `[data-theme="dark"] .hover:bg-gray-50` → заменяется на `--card-hover`.
  - `bg-gray-50/100` → заменяются на `--card-bg`.
- **Серые тексты.** В dark переопределены алиасы:
  - `.text-gray-600/.text-gray-500` → `--muted-text`.
  - `.text-gray-700` → `--foreground`.

## Компонентные практики
- **Мобильная навигация.** Неактивные вкладки — `text-muted`, активные — цвет бренда.
- **Шапки/оверлеи.** Прозрачные белые (`bg-white/90`/`95`) допустимы — в dark перекрываются.
- **Пустые состояния.** Делаем короткими и используем `text-muted`.

## Примеры
```tsx
// Вторичный подпись/дата
<div className="text-sm text-muted">{formatDate(value)}</div>

// Лейбл формы
<label className="grid gap-1">
  <span className="text-sm text-muted">E‑mail</span>
  <input className="input" />
</label>

// Неактивная вкладка
<Link className="text-muted hover:opacity-80">Диалоги</Link>
```

## Антипаттерны
- `text-gray-500`, `text-gray-600`, `text-gray-700` — не использовать.
- Жёсткие inline‑цвета для вторичного текста.

## Проверки качества
- Запрещаем `text-gray-(500|600|700)` в PR (см. раздел «Автоматические проверки» ниже).
- Визуальный прогон dark‑темы на ключевых страницах: расписания, чат, мобильные шапки/навигация.

## Автоматические проверки (рекомендации)

### ESLint (JS/TS/TSX)
В `.eslintrc.js` добавить правило, запрещающее литералы с `text-gray-500/600/700`:
```js
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/text-gray-(500|600|700)/]",
        message: 'Используйте text-muted вместо text-gray-500/600/700',
      },
      {
        selector: "TemplateElement[value.raw=/text-gray-(500|600|700)/]",
        message: 'Используйте text-muted вместо text-gray-500/600/700',
      }
    ],
  },
}
```

### DangerJS (проверка при CI)
```ts
// dangerfile.ts
import { warn, fail, markdown, danger } from 'danger'

const changed = [...danger.git.modified_files, ...danger.git.created_files]
const suspect = changed.filter(f => f.match(/\.(tsx?|jsx?)$/))

Promise.all(suspect.map(async (file) => {
  const content = await danger.github.utils.fileContents(file)
  if (/text-gray-(500|600|700)/.test(content)) {
    fail(`В файле ${file} найдены запрещённые классы text-gray-500/600/700. Используйте text-muted.`)
  }
}))
```

### Pre-commit (опционально)
Грубая защита grep‑ом:
```sh
git diff --cached --name-only | grep -E '\.(tsx?|jsx?)$' | xargs grep -nE 'text-gray-(500|600|700)' && \
  echo 'Найдены text-gray-500/600/700 — замените на text-muted' && exit 1 || true
```

## Часто задаваемые вопросы
- **Почему не `text-gray-400`?** В dark он может стать слишком бледным или неконтрастным; `text-muted` управляется токеном.
- **Можно ли использовать собственные токены?** Да, при необходимости добавьте новый токен и его dark‑значение в `app/globals.css`.

---
Обновляйте данный документ при изменении дизайн‑системы или добавлении новых токенов.
