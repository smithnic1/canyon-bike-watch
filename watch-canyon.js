#!/usr/bin/env node
// watch-canyon.js  – ES-module style
import { chromium } from 'playwright';
import nodemailer   from 'nodemailer';
import fs           from 'fs/promises';
import path         from 'path';

// ────────────────────────────────────────────────────────────
// 1. List every bike/size you want to monitor
//    • url:  the product page URL **including the colour string**
//    • size: the exact size tile text (S, M, L, XL, 2XS, …)
const WATCH_LIST = [
  {
    name : 'Endurace CF SLX 8 Di2  (L, Stealth)',
    url  : 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/cf-slx/endurace-cf-slx-8-di2/3711.html?dwvar_3711_pv_rahmenfarbe=R077_P01',
    size : 'L'
  },
  {
    name : 'Endurace CF SLX 8 Di2  (L, Desert Grey)',
    url  : 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/cf-slx/endurace-cf-slx-8-di2/3711.html?dwvar_3711_pv_rahmenfarbe=R077_P09',
    size : 'L'
  },
  {
    name : 'Endurace CF SLX 8 AXS  (L, Stealth)',
    url  : 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/cf-slx/endurace-cf-slx-8-axs-aero/3712.html?dwvar_3712_pv_rahmenfarbe=R077_P01',
    size : 'L'
  },
  {
    name : 'Endurace CF SLX 8 AXS  (L, Stealth)',
    url  : 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/cf-slx/endurace-cf-slx-8-axs-aero/3712.html?dwvar_3712_pv_rahmenfarbe=R077_P09',
    size : 'L'
  },
  {
    name : 'Endurace CF 7 Di2  (L, Slate)',
    url  : 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/cf/endurace-cf-7-di2/4017.html?dwvar_4017_pv_rahmenfarbe=R076_P06',
    size : 'L'
  },
];
// ────────────────────────────────────────────────────────────

const STATE_FILE = path.resolve('state.json');
const COOKIE_BTN = 'button:has-text("Accept")';
const SOLDOUT_RE = /--(unpurchasable|notifyMe)/;        // Canyon’s two “out” flags

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page    = await browser.newPage();
let state     = JSON.parse(await fs.readFile(STATE_FILE).catch(() => '{}'));

try {
  for (const { name, url, size } of WATCH_LIST) {
    const tileSel = `button[data-product-size="${size}"]`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // dismiss cookie banner once per session
    const cookieBtn = page.locator(COOKIE_BTN);
    if (await cookieBtn.isVisible({ timeout: 3_000 }).catch(() => false))
      await cookieBtn.click();

    // wait for the size tile; if Canyon changes markup we learn quickly
    await page.waitForSelector(tileSel, { timeout: 15_000 });
    const classList = await page.getAttribute(tileSel, 'class');
    const inStock   = !SOLDOUT_RE.test(classList);

    const key = `${url}#${size}`;          // unique key per bike-size
    const wasInStock = !!state[key];

    console.log(`${name.padEnd(35)} → ${inStock ? 'IN stock' : 'out'}`);

    if (inStock && !wasInStock) {
      try       { await sendEmail(name, url, size); }
      catch(err){ console.error('✉️  Mail error:', err); }
    }
    state[key] = inStock;                  // remember latest state
  }

  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}

// ────────────────────────────────────────────────────────────
async function sendEmail(itemName, url, size) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  await transporter.sendMail({
    from   : `"Canyon Watch" <${process.env.EMAIL_USER}>`,
    to     : process.env.EMAIL_TO,
    subject: `🚲  ${itemName} is IN STOCK!`,
    text   : `${itemName} (size ${size}) is now available:\n${url}\n\n⏩  Go grab it before it’s gone!`
  });

  console.log(`📧  Alert e-mail sent for ${itemName}`);
}
