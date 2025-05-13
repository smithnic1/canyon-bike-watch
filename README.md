# Canyon Bike Watch 🚲

> **Get an e-mail the moment your chosen Canyon bikes come back in stock.**  
> Runs for free on GitHub Actions every few minutes.

---

## How it works

1. **GitHub Actions** spins up a runner on a cron schedule (default: every 15 min).  
2. A tiny Node script (`watch-canyon.js`)  
   * opens each Canyon product page with Playwright,  
   * checks your size tile’s CSS classes, and  
   * sends one Gmail alert the first time the tile is *not* marked `--unpurchasable / --notifyMe`.  
3. The current in-stock state is stored in `state.json` and committed back to the repo, so you won’t get repeat e-mails while an item remains available.

---

## Quick start

```bash
# 1. Fork or clone this repo
git clone https://github.com/<yourname>/canyon-bike-watch.git
cd canyon-bike-watch

# 2. Install deps once (local smoke-test)
npm ci
npx playwright install --with-deps chromium
EMAIL_USER='you@gmail.com' \
EMAIL_PASS='your-16-char-app-password' \
EMAIL_TO='you@gmail.com' \
node watch-canyon.js        # exits silently if all bikes are out
