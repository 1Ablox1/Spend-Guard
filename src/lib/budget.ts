import type { AppState, BudgetSnapshot, Expense } from '../types'

const MS_DAY = 86_400_000

/** Local calendar date (YYYY-MM-DD), not UTC — avoids China timezone day shifts. */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00')
  const b = new Date(to + 'T12:00:00')
  return Math.ceil((b.getTime() - a.getTime()) / MS_DAY)
}

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

/** Paydays that land before the trip (end-of-month pay). */
export function paydaysBeforeTrip(tripStart: string, from = todayISO()): string[] {
  const start = new Date(from + 'T12:00:00')
  const trip = new Date(tripStart + 'T12:00:00')
  const out: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  for (let i = 0; i < 6; i++) {
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const iso = localISO(last)
    if (last >= start && last < trip) out.push(iso)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

export function spentTotal(expenses: Expense[], opts?: { cashOnly?: boolean }): number {
  return expenses.reduce((s, e) => {
    if (opts?.cashOnly && e.excludeFromCash) return s
    return s + e.amount
  }, 0)
}

export function computeSnapshot(state: AppState, asOf = todayISO()): BudgetSnapshot {
  const { profile, expenses, fixed } = state
  const daysToTrip = Math.max(0, daysBetween(asOf, profile.tripStart))
  const spent = spentTotal(expenses, { cashOnly: true })
  const unpaidFixed = fixed.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0)

  const inflows = paydaysBeforeTrip(profile.tripStart, asOf).length * profile.monthlyIncome
  const cashNow = profile.cashOnHand - spent
  // Money that can still become trip savings after unpaid fixed costs
  const pool = cashNow + inflows - unpaidFixed
  const tripGap = Math.max(0, profile.tripSaveTarget - Math.max(0, pool))
  const discretionaryLeft = pool - profile.tripSaveTarget
  const dailyAllowance =
    daysToTrip > 0 ? Math.max(0, Math.floor(Math.max(0, discretionaryLeft) / daysToTrip)) : 0

  return {
    daysToTrip,
    cashNow,
    tripSaved: Math.max(0, pool > 0 ? Math.min(profile.tripSaveTarget, pool) : 0),
    tripGap,
    upcomingFixed: unpaidFixed,
    discretionaryLeft,
    dailyAllowance,
    projectedInflows: inflows,
    survivalMode: discretionaryLeft < 500 || tripGap > 0,
  }
}

export function formatCny(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString('en-US')}`
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${names[Number(m) - 1]} ${y}`
}
