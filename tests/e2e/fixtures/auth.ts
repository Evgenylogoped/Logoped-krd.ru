import { Page, expect } from '@playwright/test'

export async function programmaticLogin(page: Page, email: string) {
  // Наводим браузер на GET-роут, чтобы куки авторизации установились в контекст страницы
  await page.goto(`/api/test/login?email=${encodeURIComponent(email)}`)
  // Ждём возврат на корень после клиентского редиректа
  await page.waitForURL('**/', { timeout: 15000 })
  // Дополнительно проверим, что мы действительно на сайте (не на about:blank)
  await expect(page).toHaveURL(/\//)
}
