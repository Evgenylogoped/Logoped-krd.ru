import { APIRequestContext, Page, expect } from '@playwright/test'

export async function programmaticLogin(page: Page, email: string) {
  const res = await page.request.post('/api/test/login', { data: { email } })
  expect(res.ok()).toBeTruthy()
}
