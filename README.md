# Spend Guard

Personal spending agent for a hard save: **¥15,000 trip fund** by **29 Jan 2027** (trip through 21 Feb), on **¥19,000/mo** income paid at month-end.

## What it does

- Tracks cash, spends, fixed costs (rent, mom, flight)
- **WeChat 账单 CSV import** (no personal live API — export from the wallet bill screen)
- Blocks / warns on wishlist items (watch, headphones = not necessary)
- Daily soft spend room after trip + fixed obligations
- Health-aware food/delivery pushback (186 cm / 115 kg profile)
- All data in `localStorage` — no server

## Run (Windows / macOS / Linux)

Needs [Node.js 20+](https://nodejs.org/). On a Mac:

```bash
git clone https://github.com/1Ablox1/Spend-Guard.git
cd Spend-Guard
npm install
npm run dev
```

Open the local URL Vite prints (Safari or Chrome). Set **Cash on hand** to your real balance first.

### Phone (hosted — use this)

**Live app:** https://1ablox1.github.io/Spend-Guard/

1. Open that link in **Safari** on your iPhone  
2. Tap **Share** → **Add to Home Screen**  
3. Your spends stay on the phone (`localStorage`) — not uploaded to GitHub  

Rebuild + republish after code changes: `npm run deploy`

Same Wi‑Fi only (no public URL): `npm run dev -- --host`, then open `http://<your-computer-ip>:5173/` on the phone.

It is a web app, not an App Store native build. The GitHub repo is public so Pages can host it (no personal money data is in the source).

### WeChat wire

1. WeChat → 我 → 服务 → 钱包 → 账单 → ⋯ → **导出账单**
2. Download the CSV (or export Excel then save as CSV)
3. In Spend Guard → **Import CSV file** (or paste)
4. Leave “Subtract from cash” **off** if cash on hand is already today’s balance

Try `sample-wechat-bill.csv` in this folder.

## Your baked-in plan

| Item | Amount |
|------|--------|
| Income | ¥19,000 end of month |
| Trip save | ¥15,000 |
| Flight (Dec) | ¥6,000 |
| Rent | ¥4,300 / mo |
| Mom support | ¥2,000 / mo |
| Wishlist | phone, boots, headphones, watch, jacket |

**Critical:** Dec paycheck after flight + rent + mom ≈ **¥6,700**. January 31 payday is **after** you leave on Jan 29 — do not count it for this trip.
