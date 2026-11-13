import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, CoachVerdict, Expense } from './types'
import { computeSnapshot, formatCny, monthLabel, todayISO } from './lib/budget'
import { dailyBriefing, judgeSpend, judgeWishlistBuy, necessityLabel } from './lib/coach'
import { loadState, resetState, saveState } from './lib/storage'
import { parseWechatBillCsv, reviewWechatBatch } from './lib/wechat'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'transport', label: 'Transport' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'health', label: 'Health' },
  { value: 'fun', label: 'Fun' },
  { value: 'other', label: 'Other' },
]

function uid(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [state, setState] = useState(loadState)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<Category>('food')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [verdict, setVerdict] = useState<CoachVerdict | null>(null)
  const [pendingForce, setPendingForce] = useState(false)
  const [cashDraft, setCashDraft] = useState(String(state.profile.cashOnHand))
  const [wechatPaste, setWechatPaste] = useState('')
  const [subtractWechatFromCash, setSubtractWechatFromCash] = useState(false)
  const [importMsg, setImportMsg] = useState<string[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  // Keep income on the ¥19k plan if an older session still has ¥14k
  useEffect(() => {
    if (state.profile.monthlyIncome === 14_000) {
      setState((s) => ({
        ...s,
        profile: { ...s.profile, monthlyIncome: 19_000 },
      }))
    }
  }, [state.profile.monthlyIncome])

  const snap = useMemo(() => computeSnapshot(state), [state])
  const briefing = useMemo(() => dailyBriefing(state), [state])
  const tripPct = Math.min(
    100,
    Math.round(
      ((state.profile.tripSaveTarget - snap.tripGap) / state.profile.tripSaveTarget) * 100,
    ),
  )

  function runJudge() {
    const n = Number(amount)
    const v = judgeSpend(state, n, category, note)
    setVerdict(v)
    setPendingForce(v.severity !== 'ok')
    if (v.severity === 'ok') commitExpense(n, false)
  }

  function commitExpense(n: number, forced: boolean) {
    const exp: Expense = {
      id: uid(),
      date,
      amount: n,
      category,
      note: note.trim() || category,
      forced,
    }
    setState((s) => ({ ...s, expenses: [exp, ...s.expenses] }))
    setAmount('')
    setNote('')
    setPendingForce(false)
    if (forced) {
      setVerdict({
        severity: 'caution',
        title: 'Overridden — logged against you',
        messages: [
          `You forced ¥${n}. I logged it. Trip gap is still ${formatCny(computeSnapshot({ ...state, expenses: [exp, ...state.expenses] }).tripGap)}.`,
        ],
        allowAnyway: false,
      })
    }
  }

  function forceSpend() {
    const n = Number(amount)
    if (!n) return
    commitExpense(n, true)
  }

  function toggleFixed(id: string) {
    setState((s) => {
      const target = s.fixed.find((f) => f.id === id)
      if (!target) return s
      const paying = !target.paid
      const fixed = s.fixed.map((f) => (f.id === id ? { ...f, paid: paying } : f))
      if (!paying) {
        return {
          ...s,
          fixed,
          expenses: s.expenses.filter((e) => e.id !== `fixed-${id}`),
        }
      }
      const exp: Expense = {
        id: `fixed-${id}`,
        date: todayISO(),
        amount: target.amount,
        category: target.category,
        note: target.name,
      }
      return { ...s, fixed, expenses: [exp, ...s.expenses.filter((e) => e.id !== exp.id)] }
    })
  }

  function tryWishlist(id: string) {
    const item = state.wishlist.find((w) => w.id === id)
    if (!item) return
    const v = judgeWishlistBuy(state, item)
    setVerdict(v)
    setAmount(String(item.min))
    setCategory('shopping')
    setNote(item.name)
    setPendingForce(v.severity !== 'ok')
    if (v.severity === 'ok') {
      setState((s) => ({
        ...s,
        wishlist: s.wishlist.map((w) => (w.id === id ? { ...w, bought: true } : w)),
        expenses: [
          {
            id: uid(),
            date: todayISO(),
            amount: item.min,
            category: 'shopping',
            note: item.name,
          },
          ...s.expenses,
        ],
      }))
    }
  }

  function markWishlistBought(id: string) {
    const item = state.wishlist.find((w) => w.id === id)
    if (!item) return
    setState((s) => ({
      ...s,
      wishlist: s.wishlist.map((w) => (w.id === id ? { ...w, bought: true } : w)),
      expenses: [
        {
          id: uid(),
          date: todayISO(),
          amount: item.min,
          category: 'shopping',
          note: `${item.name} (forced)`,
          forced: true,
        },
        ...s.expenses,
      ],
    }))
    setVerdict({
      severity: 'block',
      title: 'Wishlist override recorded',
      messages: [`${item.name} at ${formatCny(item.min)} — this fights your January trip.`],
      allowAnyway: false,
    })
  }

  function saveCash() {
    const n = Number(cashDraft)
    if (Number.isNaN(n)) return
    setState((s) => ({
      ...s,
      profile: { ...s.profile, cashOnHand: n },
    }))
  }

  function onReset() {
    if (!confirm('Reset all local data to the Nov 13 plan?')) return
    const fresh = resetState()
    setState(fresh)
    setCashDraft(String(fresh.profile.cashOnHand))
    setVerdict(null)
    setImportMsg(null)
  }

  function applyWechatText(text: string) {
    const result = parseWechatBillCsv(text, state.expenses)
    if (result.warnings.length && result.expenses.length === 0) {
      setImportMsg(result.warnings)
      setVerdict({
        severity: 'caution',
        title: 'WeChat import failed',
        messages: result.warnings,
        allowAnyway: false,
      })
      return
    }

    const imported = result.expenses.map((e) => ({
      ...e,
      excludeFromCash: !subtractWechatFromCash,
    }))

    setState((s) => ({
      ...s,
      expenses: [...imported, ...s.expenses],
    }))
    setWechatPaste('')

    const review = reviewWechatBatch(imported)
    const summary = [
      ...review,
      `Skipped income rows: ${result.skippedIncome}`,
      `Skipped duplicates: ${result.skippedDup}`,
      subtractWechatFromCash
        ? 'These rows were subtracted from cash on hand.'
        : 'Cash unchanged — assuming your cash on hand is already today’s balance.',
      ...result.warnings,
    ]
    setImportMsg(summary)
    setVerdict({
      severity: imported.some((e) => e.amount >= 500) ? 'caution' : 'ok',
      title: 'WeChat bill under watch',
      messages: summary,
      allowAnyway: false,
    })
  }

  async function onWechatFile(file: File | null) {
    if (!file) return
    const text = await file.text()
    applyWechatText(text)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Spend Guard</h1>
          <p>
            Local agent watching every yuan until your trip —{' '}
            {state.profile.tripStart.slice(5)} → {state.profile.tripEnd.slice(5)} (
            {state.profile.tripStart.slice(0, 4)}). Trip wallet target{' '}
            {formatCny(state.profile.tripSaveTarget)}.
          </p>
        </div>
        <div className="top-meta">
          <strong>{snap.daysToTrip} days</strong>
          until wheels up · income {formatCny(state.profile.monthlyIncome)}/mo
        </div>
      </header>

      <div className="grid">
        <div className="stack">
          <section className="panel">
            <h2>Trip runway</h2>
            <div className="metrics">
              <div className="metric">
                <span className="label">Cash now</span>
                <span className={`value ${snap.cashNow < 0 ? 'danger' : ''}`}>
                  {formatCny(snap.cashNow)}
                </span>
              </div>
              <div className="metric">
                <span className="label">Trip gap</span>
                <span className={`value ${snap.tripGap > 0 ? 'danger' : 'ok'}`}>
                  {formatCny(snap.tripGap)}
                </span>
              </div>
              <div className="metric">
                <span className="label">Daily room</span>
                <span className={`value ${snap.survivalMode ? 'warn' : 'ok'}`}>
                  {formatCny(snap.dailyAllowance)}
                </span>
              </div>
              <div className="metric">
                <span className="label">Pay before trip</span>
                <span className="value">{formatCny(snap.projectedInflows)}</span>
              </div>
              <div className="metric">
                <span className="label">Unpaid fixed</span>
                <span className="value warn">{formatCny(snap.upcomingFixed)}</span>
              </div>
              <div className="metric">
                <span className="label">After trip+fixed</span>
                <span className={`value ${snap.discretionaryLeft < 0 ? 'danger' : ''}`}>
                  {formatCny(snap.discretionaryLeft)}
                </span>
              </div>
            </div>
            <div className="progress" aria-label="Trip funding progress">
              <span style={{ width: `${Math.max(4, tripPct)}%` }} />
            </div>
            <p className="mono" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Trip funding ~{tripPct}% · starting cash is editable below (default ¥3,500 — change to
              your real balance)
            </p>
            <div className="cash-edit">
              <label>
                Cash on hand (starting)
                <input
                  className="mono"
                  type="number"
                  value={cashDraft}
                  onChange={(e) => setCashDraft(e.target.value)}
                />
              </label>
              <button type="button" className="btn" onClick={saveCash}>
                Update
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Agent briefing</h2>
            <ul className="briefing">
              {briefing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>WeChat bill wire</h2>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
              WeChat has no personal live spend API. Export: 我 → 服务 → 钱包 → 账单 → ⋯ → 导出账单
              (CSV/Excel as CSV). Drop the file or paste contents — agent dedupes by 交易单号.
            </p>
            <div className="form-row full">
              <label>
                Paste WeChat CSV
                <textarea
                  rows={4}
                  value={wechatPaste}
                  onChange={(e) => setWechatPaste(e.target.value)}
                  placeholder="微信支付账单明细 … 交易时间,交易类型,…"
                />
              </label>
            </div>
            <label
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: '0.5rem',
                textTransform: 'none',
                letterSpacing: 'normal',
                fontSize: '0.85rem',
                color: 'var(--text)',
                marginBottom: '0.5rem',
              }}
            >
              <input
                type="checkbox"
                checked={subtractWechatFromCash}
                onChange={(e) => setSubtractWechatFromCash(e.target.checked)}
              />
              Subtract imports from cash (only if cash on hand is the balance BEFORE this export)
            </label>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={!wechatPaste.trim()}
                onClick={() => applyWechatText(wechatPaste)}
              >
                Import paste
              </button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Import CSV file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                hidden
                onChange={(e) => onWechatFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {importMsg && (
              <div className="verdict caution" style={{ marginTop: '0.85rem' }}>
                <h3>Import report</h3>
                <ul>
                  {importMsg.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Log a spend — agent checks first</h2>
            <div className="form-row">
              <label>
                Amount (¥)
                <input
                  className="mono"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                What is it?
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. lunch / headphones / Didi"
                />
              </label>
            </div>
            <div className="actions">
              <button type="button" className="btn primary" onClick={runJudge} disabled={!amount}>
                Ask agent
              </button>
              {pendingForce && verdict?.severity !== 'ok' && (
                <button type="button" className="btn danger" onClick={forceSpend}>
                  Spend anyway (logged)
                </button>
              )}
            </div>
            {verdict && (
              <div className={`verdict ${verdict.severity}`}>
                <h3>{verdict.title}</h3>
                <ul>
                  {verdict.messages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Recent spends</h2>
            {state.expenses.length === 0 ? (
              <p style={{ color: 'var(--muted)', margin: 0 }}>No spends logged yet.</p>
            ) : (
              <div className="list">
                {state.expenses.slice(0, 20).map((e) => (
                  <div className="row" key={e.id}>
                    <span className="mono" style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {e.date.slice(5)}
                    </span>
                    <span>
                      {e.note}
                      {e.forced ? ' · forced' : ''}
                      {e.source === 'wechat' ? ' · wechat' : ''}
                      <div>
                        <span className="tag">{e.category}</span>
                      </div>
                    </span>
                    <span className="amt">{formatCny(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <h2>Wishlist gate</h2>
            {state.wishlist.map((w) => (
              <div className="wish-item" key={w.id}>
                <div>
                  <h4>
                    {w.name}{' '}
                    <span className={`tag ${w.necessity}`}>{necessityLabel(w.necessity)}</span>
                    {w.bought ? <span className="tag">bought</span> : null}
                  </h4>
                  <span className="mono">
                    {formatCny(w.min)}
                    {w.max !== w.min ? `–${formatCny(w.max)}` : ''}
                  </span>
                  <p>{w.reason}</p>
                </div>
                {!w.bought && (
                  <div className="actions" style={{ flexDirection: 'column' }}>
                    <button type="button" className="btn primary" onClick={() => tryWishlist(w.id)}>
                      Request
                    </button>
                    {w.necessity !== 'essential' && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => markWishlistBought(w.id)}
                      >
                        Force buy
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Fixed obligations</h2>
            {state.fixed.map((f) => (
              <div className={`fixed-row ${f.paid ? 'paid' : ''}`} key={f.id}>
                <div>
                  <div>{f.name}</div>
                  <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {monthLabel(f.month)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="mono amt">{formatCny(f.amount)}</span>
                  <button type="button" className="btn" onClick={() => toggleFixed(f.id)}>
                    {f.paid ? 'Unpaid' : 'Mark paid'}
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Body + money</h2>
            <p style={{ margin: '0 0 0.5rem', color: 'var(--muted)' }}>
              {state.profile.age} · {state.profile.heightCm} cm · {state.profile.weightKg} kg — the
              agent treats delivery and impulse food as dual violations (cash + health) until the
              trip and a lighter baseline.
            </p>
            <button type="button" className="btn ghost" onClick={onReset}>
              Reset plan data
            </button>
          </section>
        </div>
      </div>

      <p className="footnote">
        Data stays in this browser (localStorage). Income ¥19,000 EOM. Dec after flight+rent+mom ≈
        ¥6,700. Jan 31 pay does not fund a Jan 29 departure. WeChat = CSV账单 import only.
      </p>
    </div>
  )
}
