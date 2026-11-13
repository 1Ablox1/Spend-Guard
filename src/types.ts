export type Category =
  | 'food'
  | 'delivery'
  | 'transport'
  | 'rent'
  | 'family'
  | 'flight'
  | 'shopping'
  | 'health'
  | 'fun'
  | 'other'

export type Necessity = 'essential' | 'delayable' | 'unnecessary'

export type Severity = 'ok' | 'caution' | 'block'

export interface Expense {
  id: string
  date: string
  amount: number
  category: Category
  note: string
  forced?: boolean
  source?: 'manual' | 'wechat'
  wechatId?: string
  /** When true, spend is watched but not subtracted from cash on hand (already in wallet balance). */
  excludeFromCash?: boolean
}

export interface WishlistItem {
  id: string
  name: string
  min: number
  max: number
  necessity: Necessity
  bought: boolean
  reason: string
}

export interface FixedCost {
  id: string
  name: string
  amount: number
  month: string // YYYY-MM
  category: Category
  paid: boolean
}

export interface Profile {
  age: number
  heightCm: number
  weightKg: number
  monthlyIncome: number
  cashOnHand: number
  tripSaveTarget: number
  tripStart: string
  tripEnd: string
}

export interface AppState {
  profile: Profile
  expenses: Expense[]
  wishlist: WishlistItem[]
  fixed: FixedCost[]
}

export interface CoachVerdict {
  severity: Severity
  title: string
  messages: string[]
  allowAnyway: boolean
}

export interface BudgetSnapshot {
  daysToTrip: number
  cashNow: number
  tripSaved: number
  tripGap: number
  upcomingFixed: number
  discretionaryLeft: number
  dailyAllowance: number
  projectedInflows: number
  survivalMode: boolean
}
