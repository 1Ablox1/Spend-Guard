import type { Category, Expense } from '../types'

/** One row from a WeChat Pay 账单 export (CSV). */
export interface WechatRow {
  time: string
  type: string
  counterparty: string
  product: string
  direction: 'in' | 'out' | 'unknown'
  amount: number
  status: string
  txId: string
  note: string
}

export interface WechatImportResult {
  rows: WechatRow[]
  expenses: Expense[]
  skippedIncome: number
  skippedDup: number
  skippedOther: number
  warnings: string[]
}

const HEADER_MARKERS = ['交易时间', '交易类型', '金额']

/** Parse WeChat Pay bill CSV/TXT (账单明细). Handles UTF-8 BOM and preamble lines. */
export function parseWechatBillCsv(text: string, existing: Expense[]): WechatImportResult {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n')
  const headerIdx = lines.findIndex((line) => HEADER_MARKERS.every((m) => line.includes(m)))
  const warnings: string[] = []

  if (headerIdx < 0) {
    return {
      rows: [],
      expenses: [],
      skippedIncome: 0,
      skippedDup: 0,
      skippedOther: 0,
      warnings: [
        'Could not find WeChat bill header (需要含「交易时间 / 交易类型 / 金额」). Export CSV from 微信 → 我 → 服务 → 钱包 → 账单 → 右上角 → 导出账单.',
      ],
    }
  }

  const header = splitCsvLine(lines[headerIdx]!)
  const col = (names: string[]) =>
    header.findIndex((h) => names.some((n) => h.replace(/\s/g, '').includes(n)))

  const iTime = col(['交易时间'])
  const iType = col(['交易类型'])
  const iWho = col(['交易对方'])
  const iProduct = col(['商品'])
  const iDir = col(['收/支', '收支'])
  const iAmt = col(['金额'])
  const iStatus = col(['当前状态', '交易状态'])
  const iTx = col(['交易单号'])
  const iNote = col(['备注'])

  if (iTime < 0 || iAmt < 0) {
    warnings.push('Header found but time/amount columns missing.')
    return {
      rows: [],
      expenses: [],
      skippedIncome: 0,
      skippedDup: 0,
      skippedOther: 0,
      warnings,
    }
  }

  const existingIds = new Set(
    existing.map((e) => e.wechatId).filter((id): id is string => Boolean(id)),
  )

  const rows: WechatRow[] = []
  const expenses: Expense[] = []
  let skippedIncome = 0
  let skippedDup = 0
  let skippedOther = 0

  for (let li = headerIdx + 1; li < lines.length; li++) {
    const raw = lines[li]!.trim()
    if (!raw || raw.startsWith('#')) continue
    const cells = splitCsvLine(raw)
    if (cells.length < 3) continue

    const amountRaw = (cells[iAmt] ?? '').replace(/[¥￥,\s]/g, '')
    const amount = Number(amountRaw)
    if (!Number.isFinite(amount) || amount <= 0) {
      skippedOther++
      continue
    }

    const dirRaw = (iDir >= 0 ? cells[iDir] : '') ?? ''
    const direction: WechatRow['direction'] = /支出/.test(dirRaw)
      ? 'out'
      : /收入/.test(dirRaw)
        ? 'in'
        : 'unknown'

    const txId = (iTx >= 0 ? cells[iTx] : '')?.trim() || `wx-${li}-${amount}`
    const status = (iStatus >= 0 ? cells[iStatus] : '') ?? ''
    const time = (cells[iTime] ?? '').trim()
    const type = (iType >= 0 ? cells[iType] : '') ?? ''
    const counterparty = (iWho >= 0 ? cells[iWho] : '') ?? ''
    const product = (iProduct >= 0 ? cells[iProduct] : '') ?? ''
    const note = (iNote >= 0 ? cells[iNote] : '') ?? ''

    const row: WechatRow = {
      time,
      type,
      counterparty,
      product,
      direction,
      amount,
      status,
      txId,
      note,
    }
    rows.push(row)

    if (/退款|失败|关闭/.test(status)) {
      skippedOther++
      continue
    }

    if (direction === 'in') {
      skippedIncome++
      continue
    }

    // Treat unknown as expense if type looks like spend
    if (direction === 'unknown' && !/消费|转账|红包|扫二维码|商户/.test(type)) {
      skippedOther++
      continue
    }

    if (existingIds.has(txId)) {
      skippedDup++
      continue
    }
    existingIds.add(txId)

    const category = categorizeWechat(counterparty, product, type)
    const date = time.slice(0, 10)
    const label = [counterparty, product].filter(Boolean).join(' · ') || type || 'WeChat'

    expenses.push({
      id: `wechat-${txId}`,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : time.slice(0, 10),
      amount,
      category,
      note: label,
      source: 'wechat',
      wechatId: txId,
      // Already hit the wallet if cash-on-hand is today's balance
      excludeFromCash: true,
    })
  }

  if (expenses.length === 0 && warnings.length === 0) {
    warnings.push('No new expense rows imported (all income, duplicates, or empty).')
  }

  return { rows, expenses, skippedIncome, skippedDup, skippedOther, warnings }
}

export function categorizeWechat(
  counterparty: string,
  product: string,
  type: string,
): Category {
  const blob = `${counterparty} ${product} ${type}`.toLowerCase()

  if (/美团|饿了么|外卖|肯德基|麦当劳|星巴克|瑞幸|奈雪|喜茶|食堂/.test(blob)) {
    if (/外卖|美团外卖|饿了么/.test(blob)) return 'delivery'
    return 'food'
  }
  if (/滴滴|高德|地铁|公交|加油|中石化|中石油|铁路|12306|机票|航旅/.test(blob)) {
    return 'transport'
  }
  if (/房租|房东|物业/.test(blob)) return 'rent'
  if (/妈妈|母亲|父母|家用/.test(blob)) return 'family'
  if (/医院|药店|体检|健身/.test(blob)) return 'health'
  if (/电影|游戏|会员|酒吧|ktv|演出/.test(blob)) return 'fun'
  if (/京东|淘宝|天猫|拼多多|唯品会|得物|苹果|华为|小米|数码|耳机|手表/.test(blob)) {
    return 'shopping'
  }
  if (/商户消费|扫二维码付款|付款/.test(blob)) return 'other'
  return 'other'
}

/** Minimal CSV splitter that respects double quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if ((ch === ',' || ch === '\t') && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

export function reviewWechatBatch(expenses: Expense[]): string[] {
  const lines: string[] = []
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  lines.push(`Imported ${expenses.length} WeChat spends · ${total.toFixed(2)} yuan watched.`)

  const delivery = expenses.filter((e) => e.category === 'delivery' || e.category === 'food')
  if (delivery.length) {
    const sum = delivery.reduce((s, e) => s + e.amount, 0)
    lines.push(`Food/delivery in this file: ${delivery.length} hits · ¥${sum.toFixed(0)} — agent is watching this leak.`)
  }

  const big = expenses.filter((e) => e.amount >= 500)
  if (big.length) {
    lines.push(
      `Large hits (≥¥500): ${big
        .slice(0, 5)
        .map((e) => `${e.note} ¥${e.amount}`)
        .join('; ')}${big.length > 5 ? '…' : ''}`,
    )
  }

  const luxury = expenses.filter((e) =>
    /耳机|手表|headphones?|watch|数码|apple|索尼|bose/i.test(e.note),
  )
  if (luxury.length) {
    lines.push('Luxury-looking WeChat rows detected — treat as NOT necessary until trip fund is full.')
  }

  return lines
}
