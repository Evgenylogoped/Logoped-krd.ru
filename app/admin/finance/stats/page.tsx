import { redirect } from 'next/navigation'

export default function AdminFinanceStatsRedirect() {
  redirect('/admin/finance/statistics')
  return null
}
