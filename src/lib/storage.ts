import { defaultState, STORAGE_KEY } from '../data/seed'
import type { AppState } from '../types'

export function loadState(): AppState {
  try {
    // Migrate v1 → v2 if present
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('spend-guard-v1')
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as AppState
    const base = defaultState()
    const income =
      parsed.profile?.monthlyIncome === 14_000
        ? 19_000
        : (parsed.profile?.monthlyIncome ?? base.profile.monthlyIncome)
    // Trip is Jan–Feb after current November — never keep a past-year tripStart
    const tripStart =
      parsed.profile?.tripStart && parsed.profile.tripStart < '2027-01-01'
        ? base.profile.tripStart
        : (parsed.profile?.tripStart ?? base.profile.tripStart)
    const tripEnd =
      parsed.profile?.tripEnd && parsed.profile.tripEnd < '2027-01-01'
        ? base.profile.tripEnd
        : (parsed.profile?.tripEnd ?? base.profile.tripEnd)
    const fixed =
      parsed.fixed?.some((f) => f.id === 'rent-jan' && f.month === '2026-01') || !parsed.fixed?.length
        ? base.fixed
        : parsed.fixed
    return {
      ...base,
      ...parsed,
      profile: {
        ...base.profile,
        ...parsed.profile,
        monthlyIncome: income,
        tripStart,
        tripEnd,
      },
      expenses: parsed.expenses ?? [],
      wishlist: parsed.wishlist?.length ? parsed.wishlist : base.wishlist,
      fixed,
    }
  } catch {
    return defaultState()
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetState(): AppState {
  const fresh = defaultState()
  saveState(fresh)
  return fresh
}
