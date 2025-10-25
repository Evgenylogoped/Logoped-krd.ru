import { test, expect } from '@playwright/test'
import { programmaticLogin } from './fixtures/auth'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin+e2e@example.com'
const USER_APPROVE = process.env.E2E_USER2_EMAIL || 'user2+e2e@example.com'
const USER_REJECT = process.env.E2E_USER3_EMAIL || 'user3+e2e@example.com'

function uniqueOrgName() {
  return `E2E Org ${Date.now()}`
}

test.describe('Admin org-requests', () => {
  test('Logoped submits org request -> admin sees it as PENDING', async ({ page }) => {
    // Login as logoped and open request page
    await programmaticLogin(page, USER_APPROVE)
    await page.goto('/logoped/organization/request')

    // If there is a pending request, cancel it to keep test deterministic
    const pendingBanner = page.getByText('находится на рассмотрении')
    if (await pendingBanner.isVisible().catch(() => false)) {
      const cancelBtn = page.getByRole('button', { name: 'Отменить заявку' })
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click()
        await page.waitForURL(/cancelled=1/)
      }
    }

    // If user is in organization already, this flow is not applicable
    // In that case, we skip to avoid false negative (seed should have a free logoped)
    const approvedBanner = page.getByText('Заявка одобрена')
    if (await approvedBanner.isVisible().catch(() => false)) {
      test.skip(true, 'User already in organization; org request flow not applicable')
    }

    // Submit a new request
    const orgName = uniqueOrgName()
    await page.locator('input[name="name"]').fill(orgName)
    await page.locator('input[name="website"]').fill('')
    await page.locator('textarea[name="about"]').fill('E2E check')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await page.waitForURL(/(sent=1|organization\/request)/)

    // Go to admin and verify
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto(`/admin/org-requests?status=PENDING&q=${encodeURIComponent(orgName.split(' ').slice(0, 2).join(' '))}`)

    // Find the row with our org name and requester email
    const row = page.locator('tbody tr').filter({ hasText: orgName }).filter({ hasText: USER_APPROVE })
    await expect(row.first()).toBeVisible({ timeout: 15000 })

    // Verify status and action buttons present
    await expect(row.getByText('PENDING')).toBeVisible()
    await expect(row.getByRole('button', { name: 'Утвердить' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Отклонить' })).toBeVisible()
  })

  test('Admin approves org request creates company and shows APPROVED', async ({ page }) => {
    // Submit a fresh request as logoped
    await programmaticLogin(page, USER_APPROVE)
    await page.goto('/logoped/organization/request')
    // If pending exists, cancel it to make inputs enabled
    const pendingBanner = page.getByText('находится на рассмотрении')
    if (await pendingBanner.isVisible().catch(()=>false)) {
      const cancelBtn = page.getByRole('button', { name: 'Отменить заявку' })
      if (await cancelBtn.isVisible().catch(()=>false)) {
        await cancelBtn.click()
        await page.waitForURL(/cancelled=1/)
      }
    }
    // If already approved (in organization), skip this test (not applicable)
    const approvedBanner = page.getByText('Заявка одобрена')
    if (await approvedBanner.isVisible().catch(()=>false)) {
      test.skip(true, 'User already in organization; approve flow not applicable')
    }
    const orgName = uniqueOrgName()
    await page.locator('input[name="name"]').fill(orgName)
    await page.locator('textarea[name="about"]').fill('Approve flow')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await page.waitForURL(/sent=1/)

    // Approve as admin
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto(`/admin/org-requests?status=PENDING&q=${encodeURIComponent(orgName.split(' ')[0])}`)
    const row = page.locator('tbody tr').filter({ hasText: orgName })
    await expect(row.first()).toBeVisible()
    const approveForm = row.first().locator('form').filter({ has: page.getByRole('button', { name: 'Утвердить' }) })
    await approveForm.locator('input[name="allowedBranches"]').fill('2')
    await approveForm.getByRole('button', { name: 'Утвердить' }).click()
    await page.waitForURL(/ok=approved/)
    // Verify status updated
    await page.goto(`/admin/org-requests?status=APPROVED&q=${encodeURIComponent(orgName.split(' ')[0])}`)
    const approvedRow = page.locator('tbody tr').filter({ hasText: orgName })
    await expect(approvedRow.getByText('APPROVED')).toBeVisible()

    // User sees approved banner
    await programmaticLogin(page, USER_APPROVE)
    await page.goto('/logoped/organization/request')
    await expect(page.getByText('Заявка одобрена')).toBeVisible()
    // And organization settings show company and 'Основной офис'
    await page.goto('/settings/organization')
    await expect(page.getByText(`Организация:`)).toBeVisible()
    await expect(page.getByText('Основной офис')).toBeVisible()
  })

  test('Admin rejects org request shows REJECTED and user sees reason', async ({ page }) => {
    // Submit a fresh request as logoped
    await programmaticLogin(page, USER_REJECT)
    await page.goto('/logoped/organization/request')
    // If pending exists, cancel it to enable submission
    {
      const pendingBanner = page.getByText('находится на рассмотрении')
      if (await pendingBanner.isVisible().catch(()=>false)) {
        const cancelBtn = page.getByRole('button', { name: 'Отменить заявку' })
        if (await cancelBtn.isVisible().catch(()=>false)) {
          await cancelBtn.click()
          await page.waitForURL(/cancelled=1/)
        }
      }
    }
    // If already approved, skip reject flow
    if (await page.getByText('Заявка одобрена').isVisible().catch(()=>false)) {
      test.skip(true, 'User already in organization; reject flow not applicable')
    }
    const orgName = uniqueOrgName()
    await page.locator('input[name="name"]').fill(orgName)
    await page.locator('textarea[name="about"]').fill('Reject flow')
    await page.getByRole('button', { name: 'Отправить заявку' }).click()
    await page.waitForURL(/sent=1/)

    // Reject as admin
    await programmaticLogin(page, ADMIN_EMAIL)
    await page.goto(`/admin/org-requests?status=PENDING&q=${encodeURIComponent(orgName.split(' ')[0])}`)
    const row = page.locator('tbody tr').filter({ hasText: orgName })
    await expect(row.first()).toBeVisible()
    const rejectForm = row.first().locator('form').filter({ has: page.getByRole('button', { name: 'Отклонить' }) })
    await rejectForm.locator('input[name="reason"]').fill('Недостаточно данных')
    await rejectForm.getByRole('button', { name: 'Отклонить' }).click()
    await page.waitForURL(/ok=rejected/)
    // Verify status updated
    await page.goto(`/admin/org-requests?status=REJECTED&q=${encodeURIComponent(orgName.split(' ')[0])}`)
    const rejectedRow = page.locator('tbody tr').filter({ hasText: orgName })
    await expect(rejectedRow.getByText('REJECTED')).toBeVisible()
    await expect(rejectedRow.getByText('Недостаточно данных')).toBeVisible()

    // User sees rejected banner
    await programmaticLogin(page, USER_REJECT)
    await page.goto('/logoped/organization/request')
    await expect(page.getByText('Заявка отклонена')).toBeVisible()
  })
})
