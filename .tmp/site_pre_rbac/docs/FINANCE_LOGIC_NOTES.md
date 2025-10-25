# Finance Logic Notes

## Roles and Access
- LOGOPED (therapist)
- ADMIN / SUPER_ADMIN
- ACCOUNTANT

### Finance org routes access
- Middleware allows LOGOPED to pass only to `/admin/finance*`.
- Page guards allow:
  - ADMIN/SUPER_ADMIN/ACCOUNTANT always.
  - LOGOPED only if leader:
    - Owner of any company (`company.ownerId=userId`), or
    - Manager of any branch (`branch.managerId=userId`).

### Leader detection helpers (page-level)
- Check owned company by `ownerId`.
- Check any managed branch by `managerId`.
- Also consider `user.branch.company.ownerId === userId` as owning current company.

## Sections in Sidebar
- `Лич. Финансы` → `/logoped/finance`: always visible for LOGOPED (and leaders).
- `Лог. финансы` → `/logoped/org-finance`: visible only if LOGOPED is in organization and not a leader.
- `Рук. финансы` → `/logoped/branch-finance`: visible only if leader.
- API `GET /api/me/leadership` returns `{ isLeader, inOrg }` for dynamic menu.

## Personal vs Organization
- Personal:
  - LOGOPED without organization (solo), or leader's own lessons.
  - Transactions use `branchId = null`, `companyId = null`, `meta.personal = true`.
  - Not included in organization dashboards/archives.
- Organization:
  - LOGOPED (non-leader) working in a branch/company.
  - Transactions attributed with `branchId/companyId`.

## Settlement (`services/finance.ts::applyLessonSettlement`)
- Detect `isLeader` (owner/manager) and `isSolo` (no `branchId`).
- `isPersonal = isLeader || isSolo` → force personal attribution for transactions.
- Payment flows:
  - Subscription (Pass):
    - Use latest active Pass; create `PassUsage`; decrement `remainingLessons`.
    - Create `THERAPIST_BALANCE` (therapist share) and `REVENUE` (branch revenue) with `paymentMethod='SUBSCRIPTION'`.
  - Cash therapist (`CASH_THERAPIST`): create `CASH_HELD` with leader share.
  - Cash/cashless leader (`CASH_LEADER` / `CASHLESS_LEADER`): create `THERAPIST_BALANCE` and `REVENUE` from nominal price.
- All created transactions include `{ personal: isPersonal }` in `meta`.

## Passes
- `PassUsage` is unique by `lessonId` to avoid double usage.
- Remaining lessons decremented transactionally.

## Payouts
- LOGOPED creates payout request via `app/logoped/finance/actions.ts::createPayoutRequest()`:
  - If existing `PENDING` request: no new one; redirect with `?pending=1`.
  - After creation: redirect with `?sent=1`.
- Leader/Admin confirms payout via `admin/finance/payouts/actions.ts::confirmPayout()`:
  - Links un-paid lessons up to request time; marks lessons `payoutStatus='PAID'`.
  - Creates `PAYOUT` transaction.
  - Updates request to `PAID` with `confirmedById`.
- Payouts page shows preview of lesson IDs to be included.

## Personal Finance page (`/logoped/finance`)
- Widgets: Balance, Cash Held, Final to pay.
- Period filters: day/week/month/half/year.
- Limited to current calendar year for display.
- SOLO section: personal stats per child (lessons, nominal, therapist earned).
- Payout request button with success/pending banners.

## Org Finance for LOGOPED (`/logoped/org-finance`)
- Guard: LOGOPED in organization and not leader.
- Shows recent lessons with child, price, payment method, status.
- To be extended with period filters and aggregates similar to personal page.

## Leader Finance (`/logoped/branch-finance`)
- Entry page with CTA to `/admin/finance`.
- All `/admin/finance/*` pages support leader access via guards.

## Admin/Finance layout and mobile nav
- `app/admin/finance/layout.tsx` renders top tabs (desktop) and bottom mobile nav.
- Tabs: Разделы, Дашборд, Дети, Статистика, Архив, Выплаты, Проценты, Абонементы.

## Year Retention
- UI displays only current calendar year by default. Data older than 31 Dec not shown in personal stats. Potential server action can be added to purge if required.

## Debugging Checklist
- Verify `/api/me/leadership` returns expected `{ isLeader, inOrg }`.
- Verify LOGOPED leader can open `/admin/finance/*` without login loop.
- Verify personal transactions include `meta.personal=true` and have null branch/company.
- Verify Pass usage is created once and remaining lessons decrement.
- Verify payout flow and included lessons preview.
