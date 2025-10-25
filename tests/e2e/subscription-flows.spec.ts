import { test, expect } from '@playwright/test'
import { programmaticLogin } from './fixtures/auth'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin+e2e@example.com'
const USER_EMAIL = process.env.E2E_USER_EMAIL || 'user+e2e@example.com'
const PASSWORD = process.env.E2E_PASSWORD || 'password123'

// helper: set user plan via admin table controls
async function adminSetUserPlan(page: any, email: string, plan: string, duration: string = 'month') {
  await programmaticLogin(page, ADMIN_EMAIL)
  await page.goto('/admin/subscriptions')
  // Найдём строку именно в управляющей таблице (там есть кнопка "Применить")
  const row = page.locator('tr').filter({ has: page.getByRole('button', { name: 'Применить' }) }).filter({ hasText: email })
  await expect(row.first()).toBeVisible()
  await row.getByRole('combobox').first().selectOption(plan)
  await row.getByRole('combobox').nth(1).selectOption(duration)
  await row.getByRole('button', { name: 'Применить' }).click()
  await expect(row.getByRole('cell', { name: plan.toUpperCase().replace('_PLUS','+') }).first()).toBeVisible()
}

test.describe('Subscriptions full flows', () => {
  test('Plan change: user request -> admin approve -> user sees updated plan', async ({ page }) => {
    // Ensure user starts from PRO
    await adminSetUserPlan(page, USER_EMAIL, 'pro', 'month')

    // User creates plan change request
    await programmaticLogin(page, USER_EMAIL)
    const res = await page.request.post('/api/billing/plan-request', {
      data: { from: 'pro', to: 'pro_plus', period: 'month', channel: 'e2e' },
    })
    expect(res.ok()).toBeTruthy()
    const { id: planReqId } = await res.json()

    // Admin approved the request
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/requests')
    const reqRow = page.locator(`tr[data-request-id="${planReqId}"]`)
    await expect(reqRow.first()).toBeVisible()
    const approveBtn = reqRow.first().getByRole('button', { name: /Обработано/i })
    await approveBtn.waitFor({ state: 'visible' })
    await approveBtn.click()

    // Подождём, пока заявка смены плана перейдёт в handled через API
    await programmaticLogin(page, USER_EMAIL)
    let handled = false
    for (let i = 0; i < 20; i++) {
      const res = await page.request.get('/api/billing/plan-request')
      if (res.ok()) {
        const data = await res.json()
        if (data?.request?.status === 'handled') { handled = true; break }
      }
      await page.waitForTimeout(1000)
    }

    // Откроем billing и проверим PRO+
    await page.goto('/settings/billing')
    await expect(page.getByRole('main')).toContainText(/(PRO\+|PRO_PLUS)/, { timeout: 20000 })
    // Admin requests page with handled filter contains our request
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/requests?status=handled&q=' + encodeURIComponent(USER_EMAIL))
    await expect(page.locator(`tr[data-request-id="${planReqId}"]`)).toBeVisible()
  })

  test('MAX limits: user request -> admin approve -> user limits updated', async ({ page }) => {
    // Ensure user is on MAX
    await adminSetUserPlan(page, USER_EMAIL, 'max', 'month')

    // User requests limit increase
    await programmaticLogin(page, USER_EMAIL)
    const res2 = await page.request.post('/api/billing/limit-request', {
      data: { branches: 11, logopeds: 55, mediaMB: 16000 },
    })
    expect(res2.ok()).toBeTruthy()
    const { id: limitReqId } = await res2.json()

    // Admin approved overrides
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/limit-requests')
    let row = page.locator(`tr[data-request-id="${limitReqId}"]`)
    await expect(row.first()).toBeVisible()
    await row.locator('input[name="branches"]').fill('11')
    await row.locator('input[name="logopeds"]').fill('55')
    await row.locator('input[name="mediaMB"]').fill('16000')
    const confirmBtn = row.getByRole('button', { name: /Подтверд/i })
    await confirmBtn.waitFor({ state: 'visible' })
    await confirmBtn.click()
    await page.waitForLoadState('networkidle')
    // Подождём, пока заявка лимитов получит статус approved через API
    await programmaticLogin(page, USER_EMAIL)
    for (let i = 0; i < 20; i++) {
      const res = await page.request.get('/api/billing/limit-request')
      if (res.ok()) {
        const data = await res.json()
        if (data?.request?.status === 'approved') break
      }
      await page.waitForTimeout(1000)
    }
    // Проверим на странице биллинга наличие MAX (план и блоки показывают MAX)
    await page.goto('/settings/billing')
    await expect(page.getByRole('main')).toContainText(/MAX/, { timeout: 20000 })
    // Verify in admin list numbers are shown in "Одобрено" line
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/limit-requests?status=approved&q=' + encodeURIComponent(USER_EMAIL))
    const approvedRow = page.locator(`tr[data-request-id="${limitReqId}"]`)
    await expect(approvedRow).toBeVisible()
    await expect(approvedRow).toContainText('Одобрено: филиалы 11, логопеды 55, медиа 16000 MB')
  })

  test('Plan change: user request -> admin deny -> user sees denied status', async ({ page }) => {
    // Ensure user starts from PRO
    await adminSetUserPlan(page, USER_EMAIL, 'pro', 'month')

    // User creates plan change request
    await programmaticLogin(page, USER_EMAIL)
    const res = await page.request.post('/api/billing/plan-request', {
      data: { from: 'pro', to: 'pro_plus', period: 'month', channel: 'e2e' },
    })
    expect(res.ok()).toBeTruthy()
    const { id: planReqId } = await res.json()

    // Admin denies the request
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/requests')
    const reqRow = page.locator(`tr[data-request-id="${planReqId}"]`)
    await expect(reqRow).toBeVisible()
    const denyBtn = reqRow.getByRole('button', { name: 'Отклонить' })
    await denyBtn.waitFor({ state: 'visible' })
    await denyBtn.click()

    // Wait until denied via API
    await programmaticLogin(page, USER_EMAIL)
    for (let i = 0; i < 20; i++) {
      const g = await page.request.get('/api/billing/plan-request')
      if (g.ok()) {
        const data = await g.json()
        if (data?.request?.status === 'denied') break
      }
      await page.waitForTimeout(1000)
    }
    // Billing page shows status block
    await page.goto('/settings/billing')
    await expect(page.getByRole('main')).toContainText('Статус заявки', { timeout: 20000 })
    // Admin requests page with denied filter contains our request
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/requests?status=denied&q=' + encodeURIComponent(USER_EMAIL))
    await expect(page.locator(`tr[data-request-id="${planReqId}"]`)).toBeVisible()
  })

  test('MAX limits: user request -> admin deny -> user sees denied status', async ({ page }) => {
    // Ensure user on MAX
    await adminSetUserPlan(page, USER_EMAIL, 'max', 'month')

    // User sends limit request
    await programmaticLogin(page, USER_EMAIL)
    const res = await page.request.post('/api/billing/limit-request', {
      data: { branches: 12, logopeds: 60, mediaMB: 20000 },
    })
    expect(res.ok()).toBeTruthy()
    const { id: limitReqId } = await res.json()

    // Admin denies
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions/limit-requests')
    const row = page.locator(`tr[data-request-id="${limitReqId}"]`)
    await expect(row).toBeVisible()
    const denyBtn = row.getByRole('button', { name: 'Отклонить' })
    await denyBtn.waitFor({ state: 'visible' })
    await denyBtn.click()

    // Poll API until denied
    await programmaticLogin(page, USER_EMAIL)
    for (let i = 0; i < 20; i++) {
      const g = await page.request.get('/api/billing/limit-request')
      if (g.ok()) {
        const data = await g.json()
        if (data?.request?.status === 'denied') break
      }
      await page.waitForTimeout(1000)
    }
    // Billing reflects status section
    await page.goto('/settings/billing')
    await expect(page.getByRole('main')).toContainText('Статус заявки', { timeout: 20000 })
  })
})
