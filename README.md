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

### Phone (yes — host it)

Your phone cannot usefully “install” this from GitHub alone. **Host the built site**, then open the HTTPS link in Safari.

1. Open the hosted URL in **Safari**
2. Tap **Share** → **Add to Home Screen**
3. Data stays on your phone browser (`localStorage`) — no account needed

**Why host:** GitHub repo is private (free GitHub Pages needs a public repo). Use **Vercel** / **Netlify** (free) linked to this repo, or make the repo public and enable Pages.

Same Wi‑Fi only (no public URL): on Mac/PC run `npm run dev -- --host`, then open `http://<your-computer-ip>:5173/` on the phone. Hosting is better so it works on cellular too.

It is a web app, not an App Store native build.

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
