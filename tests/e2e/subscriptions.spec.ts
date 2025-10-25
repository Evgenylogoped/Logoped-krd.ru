import { test, expect } from '@playwright/test'
import { programmaticLogin } from './fixtures/auth'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin+e2e@example.com'
const USER_EMAIL = process.env.E2E_USER_EMAIL || 'user+e2e@example.com'
const PASSWORD = process.env.E2E_PASSWORD || 'password123'

test.describe('Subscriptions smoke', () => {
  test('User sees current plan on settings/billing', async ({ page }) => {
    await programmaticLogin(page, USER_EMAIL)
    await page.goto('/settings/billing')
    await expect(page.getByRole('main').getByText('Текущий план:')).toBeVisible()
  })

  test('Clamp hint toast is shown after saving invalid values', async ({ page }) => {
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions')
    // Trigger prices clamp (upper bound) — use large positive to avoid HTML min=0 blocking submit
    await page.locator('input[name="pro_month"]').fill('2000000000')
    await page.getByRole('button', { name: 'Сохранить цены' }).click()
    await page.waitForTimeout(200)
    await page.goto(`/admin/subscriptions?ts=${Date.now()}`)
    // Wait for toast to appear (title button "Скрыть")
    await expect(page.getByRole('button', { name: 'Скрыть' })).toBeVisible({ timeout: 15000 })
    // Close toast manually
    await page.getByRole('button', { name: 'Скрыть' }).click()
    await expect(page.getByRole('button', { name: 'Скрыть' })).toHaveCount(0)
    // Highlight class present on corrected field
    await expect(page.locator('input[name="pro_month"]')).toHaveClass(/bg-yellow-50/)

    // Trigger limits clamp
    await page.locator('input[name="free_mediaMB"]').fill('999999999')
    await page.getByRole('button', { name: 'Сохранить лимиты' }).click()
    await page.waitForTimeout(200)
    await page.goto(`/admin/subscriptions?ts=${Date.now()}`)
    await expect(page.getByRole('button', { name: 'Скрыть' })).toBeVisible({ timeout: 15000 })
    // Close toast
    await page.getByRole('button', { name: 'Скрыть' }).click()
    await expect(page.getByRole('button', { name: 'Скрыть' })).toHaveCount(0)
    await expect(page.locator('input[name="free_mediaMB"]')).toHaveClass(/bg-yellow-50/)
    // Cookies cleared => no alert on subsequent navigation without new changes
    await page.reload()
    await expect(page.locator('text=Обратите внимание')).toHaveCount(0)
    await expect(page.locator('input[name="pro_month"]')).not.toHaveClass(/bg-yellow-50/)
    await expect(page.locator('input[name="free_mediaMB"]')).not.toHaveClass(/bg-yellow-50/)
  })

  test('Admin updates plan prices and limits', async ({ page }) => {
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions')
    // Update a PRO monthly price and save
    await page.locator('input[name="pro_month"]').fill('999')
    await page.getByRole('button', { name: 'Сохранить цены' }).click()
    await expect(page.getByText('Цены тарифов')).toBeVisible()

    // Update a PRO branches limit and save
    await page.locator('input[name="pro_branches"]').fill('2')
    await page.getByRole('button', { name: 'Сохранить лимиты' }).click()
    await expect(page.getByText('Параметры планов (лимиты)')).toBeVisible()
  })

  test('Admin can set user plan directly', async ({ page }) => {
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions')
    // Find the test user row via email inside the main table
    const table = page.locator('table').first()
    const row = table.locator('tr', { hasText: USER_EMAIL })
    await expect(row.first()).toBeVisible()
    await row.getByRole('combobox').first().selectOption('pro_plus')
    await row.getByRole('combobox').nth(1).selectOption('month')
    await row.getByRole('button', { name: 'Применить' }).click()
    await expect(row.getByRole('cell', { name: 'PRO+' }).first()).toBeVisible()
  })

  test('Validation clamps (prices/limits) are applied', async ({ page }) => {
    // Login as admin
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto('/admin/subscriptions')
    // Prices clamp across plans (upper bound -> 1_000_000)
    const pricePlans = ['pro','pro_plus','max']
    for (const p of pricePlans) {
      await page.locator(`input[name="${p}_month"]`).fill('2000000000')
      await page.locator(`input[name="${p}_year"]`).fill('3000000000')
    }
    await page.getByRole('button', { name: 'Сохранить цены' }).click()
    // wait for clamp to reflect after server action and bust cache
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(200)
    await page.goto(`/admin/subscriptions?ts=${Date.now()}`)
    for (const p of pricePlans) {
      await expect(page.locator(`input[name="${p}_month"]`)).toHaveValue('1000000', { timeout: 15000 })
      await expect(page.locator(`input[name="${p}_year"]`)).toHaveValue('1000000', { timeout: 15000 })
    }

    // Forever price: upper bound clamp works as well
    await page.locator('input[name="pro_plus_forever"]').fill('5000000000')
    await page.getByRole('button', { name: 'Сохранить цены' }).click()
    await page.goto(`/admin/subscriptions?ts=${Date.now()}`)
    await expect(page.locator('input[name="pro_plus_forever"]').first()).toHaveValue('1000000')

    // Upper bound clamp for max_year as well
    await page.locator('input[name="max_year"]').fill('9000000000')
    await page.getByRole('button', { name: 'Сохранить цены' }).click()
    await page.goto(`/admin/subscriptions?ts=${Date.now()}`)
    await expect(page.locator('input[name="max_year"]').first()).toHaveValue('1000000')

    // Boundary stress: set huge values -> clamp to 1000000; set 0 -> stays 0
    await page.locator('input[name="pro_month"]').fill('2000000000')
    await page.locator('input[name="pro_year"]').fill('0')
    await page.getByRole('button', { name: 'Сохранить цены' }).click()
    await page.reload()
    await expect(page.locator('input[name="pro_month"]').first()).toHaveValue('1000000')
    await expect(page.locator('input[name="pro_year"]').first()).toHaveValue('0')

    // Limits clamp across all plans
    const limitPlans = ['beta','free','pro','pro_plus','max']
    for (const p of limitPlans) {
      await page.locator(`input[name="${p}_branches"]`).fill('999999999') // -> 1000
      await page.locator(`input[name="${p}_logopeds"]`).fill('999999999') // -> 10000
      await page.locator(`input[name="${p}_mediaMB"]`).fill('999999999') // -> 1000000
    }
    await page.getByRole('button', { name: 'Сохранить лимиты' }).click()
    await page.reload()
    for (const p of limitPlans) {
      await expect(page.locator(`input[name="${p}_branches"]`)).toHaveValue('1000')
      await expect(page.locator(`input[name="${p}_logopeds"]`)).toHaveValue('10000')
      await expect(page.locator(`input[name="${p}_mediaMB"]`)).toHaveValue('1000000')
    }

    // Non-numeric inputs are blocked by HTML number inputs; upper bound clamps already verified above

    // Boundary exact: setting exact max values stays as is
    await page.locator('input[name="max_branches"]').fill('1000')
    await page.locator('input[name="max_logopeds"]').fill('10000')
    await page.locator('input[name="max_mediaMB"]').fill('1000000')
    await page.getByRole('button', { name: 'Сохранить лимиты' }).click()
    await page.reload()
    await expect(page.locator('input[name="max_branches"]').first()).toHaveValue('1000')
    await expect(page.locator('input[name="max_logopeds"]').first()).toHaveValue('10000')
    await expect(page.locator('input[name="max_mediaMB"]').first()).toHaveValue('1000000')
  })
})
