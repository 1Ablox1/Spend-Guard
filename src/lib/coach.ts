import type {
  AppState,
  Category,
  CoachVerdict,
  Necessity,
  WishlistItem,
} from '../types'
import { bmi, computeSnapshot, formatCny, todayISO } from './budget'

const FOOD_CATS: Category[] = ['food', 'delivery']

export function judgeSpend(
  state: AppState,
  amount: number,
  category: Category,
  note: string,
): CoachVerdict {
  const snap = computeSnapshot(state)
  const messages: string[] = []
  let severity: CoachVerdict['severity'] = 'ok'
  const noteL = note.toLowerCase()
  const bodyBmi = bmi(state.profile.heightCm, state.profile.weightKg)

  if (amount <= 0) {
    return {
      severity: 'block',
      title: 'Invalid amount',
      messages: ['Enter a real amount.'],
      allowAnyway: false,
    }
  }

  // Trip protection
  if (snap.tripGap > 0 && amount > snap.dailyAllowance && category !== 'rent' && category !== 'family' && category !== 'flight') {
    severity = 'block'
    messages.push(
      `Trip fund still short ${formatCny(snap.tripGap)}. This ¥${amount} eats runway you do not have.`,
    )
  }

  if (snap.survivalMode && !['rent', 'family', 'flight'].includes(category)) {
    if (severity === 'ok') severity = 'caution'
    messages.push(
      `Survival mode: only ${formatCny(Math.max(0, snap.discretionaryLeft))} left after trip + fixed costs. Every yuan is watched.`,
    )
  }

  if (amount > snap.dailyAllowance * 2 && snap.dailyAllowance > 0 && !['rent', 'family', 'flight'].includes(category)) {
    severity = severity === 'block' ? 'block' : 'caution'
    messages.push(
      `Daily soft cap is ~${formatCny(snap.dailyAllowance)}. You are asking for more than 2× that.`,
    )
  }

  // Wishlist / luxury keywords
  const wishlistHit = matchWishlist(state.wishlist, noteL, category)
  if (wishlistHit) {
    if (wishlistHit.necessity === 'unnecessary') {
      severity = 'block'
      messages.push(
        `${wishlistHit.name} is marked NOT necessary. ${wishlistHit.reason}`,
      )
      messages.push(
        `Trip ${state.profile.tripStart} → ${state.profile.tripEnd}. Save ${formatCny(state.profile.tripSaveTarget)} first.`,
      )
    } else if (wishlistHit.necessity === 'delayable') {
      severity = severity === 'block' ? 'block' : 'caution'
      messages.push(
        `${wishlistHit.name} can wait. ${wishlistHit.reason}`,
      )
      if (amount > wishlistHit.min) {
        messages.push(`If you must: cap at ${formatCny(wishlistHit.min)}, not ${formatCny(amount)}.`)
      }
    }
  }

  // Hard luxury patterns
  if (/watch|耳机|headphones?|airpods|索尼|bose/i.test(note) || (category === 'shopping' && amount >= 1000)) {
    if (!wishlistHit || wishlistHit.necessity === 'unnecessary') {
      severity = 'block'
      messages.push(
        'This looks like a want, not a need. I am blocking it until your trip wallet is full.',
      )
    }
  }

  // Food / body surveillance
  if (FOOD_CATS.includes(category)) {
    if (bodyBmi >= 30) {
      severity = severity === 'block' ? 'block' : amount >= 40 ? 'caution' : severity
      messages.push(
        `BMI ≈ ${bodyBmi.toFixed(1)} (186 cm / 115 kg). Delivery and snack spend works against both money and weight goals.`,
      )
    }
    if (category === 'delivery' && amount >= 35) {
      severity = severity === 'ok' ? 'caution' : severity
      messages.push('Cook or eat simple. Delivery is a leak you feel twice — wallet and waist.')
    }
    const todayFood = state.expenses
      .filter((e) => e.date === todayISO() && FOOD_CATS.includes(e.category))
      .reduce((s, e) => s + e.amount, 0)
    if (todayFood + amount > 80) {
      severity = severity === 'block' ? 'block' : 'caution'
      messages.push(
        `Food today would hit ${formatCny(todayFood + amount)}. Cap meals tighter until January 29.`,
      )
    }
  }

  // Fun
  if (category === 'fun' && snap.survivalMode) {
    severity = 'block'
    messages.push('Fun spend is frozen until the trip fund clears. I am not negotiating that.')
  }

  if (messages.length === 0) {
    messages.push(
      snap.survivalMode
        ? 'Barely acceptable. Log it and stop there.'
        : `Logged under watch. Daily room ≈ ${formatCny(snap.dailyAllowance)}.`,
    )
  }

  return {
    severity,
    title:
      severity === 'block'
        ? 'Do not spend this'
        : severity === 'caution'
          ? 'Think twice'
          : 'Cleared — still watched',
    messages,
    allowAnyway: severity !== 'ok',
  }
}

export function judgeWishlistBuy(state: AppState, item: WishlistItem): CoachVerdict {
  return judgeSpend(
    state,
    item.min,
    'shopping',
    item.name,
  )
}

export function dailyBriefing(state: AppState): string[] {
  const snap = computeSnapshot(state)
  const bodyBmi = bmi(state.profile.heightCm, state.profile.weightKg)
  const lines: string[] = []

  lines.push(
    `${snap.daysToTrip} days until departure (${state.profile.tripStart}). Target trip cash: ${formatCny(state.profile.tripSaveTarget)}.`,
  )

  if (snap.tripGap > 0) {
    lines.push(
      `Gap: ${formatCny(snap.tripGap)} still missing after projected pay and unpaid fixed costs.`,
    )
  } else {
    lines.push(
      `Trip fund looks coverable if you do not leak. Soft daily spend room: ${formatCny(snap.dailyAllowance)}.`,
    )
  }

  const pay = state.profile.monthlyIncome
  const decLeft = pay - 6000 - 4300 - 2000
  lines.push(
    `Pay is ${formatCny(pay)} end of month. December: ${formatCny(pay)} − flight ¥6,000 − rent ¥4,300 − mom ¥2,000 = ${formatCny(decLeft)} left.`,
  )
  lines.push('Wire WeChat via 账单 CSV export — no live personal API. Import keeps you under watch.')

  lines.push(
    `January 31 payday is AFTER you leave on Jan 29 — do not count January salary for this trip.`,
  )

  const blocked = state.wishlist.filter((w) => !w.bought && w.necessity === 'unnecessary')
  if (blocked.length) {
    lines.push(
      `Locked wishlist: ${blocked.map((w) => w.name).join(', ')}. Not necessary. Buy after Feb 21.`,
    )
  }

  if (bodyBmi >= 30) {
    lines.push(
      `Health track: BMI ${bodyBmi.toFixed(1)}. Treat delivery and sugar as both budget and body violations.`,
    )
  }

  return lines
}

export function necessityLabel(n: Necessity): string {
  if (n === 'essential') return 'Essential'
  if (n === 'delayable') return 'Can wait'
  return 'Not necessary'
}

function matchWishlist(
  list: WishlistItem[],
  note: string,
  category: Category,
): WishlistItem | undefined {
  return list.find((w) => {
    if (w.bought) return false
    const name = w.name.toLowerCase()
    if (note.includes(name)) return true
    if (category === 'shopping' && note.includes(name.split(' ')[0]!)) return true
    return false
  })
}
