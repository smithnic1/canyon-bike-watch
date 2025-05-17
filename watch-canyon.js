#!/usr/bin/env node
// watch-canyon.js  – ES-module style
import { chromium } from 'playwright';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';

// ────────────────────────────────────────────────────────────
// 1. List every bike/size you want to monitor
//    • url:  the product page URL **including the colour string**
//    • size: the exact size tile text (S, M, L, XL, 2XS, …)
const WATCH_LIST = [
  {
    name: 'Endurace CF 7 RAW  (S, Cold Cactus)',
    url: 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/al/endurace-7-raw/3705.html?dwvar_3705_pv_rahmenfarbe=R074_P05',
    size: 'S'
  },
  {
    name: 'Endurace CF 7 RAW  (S, New Stealth)',
    url: 'https://www.canyon.com/en-ca/road-bikes/endurance-bikes/endurace/al/endurace-7-raw/3705.html?dwvar_3705_pv_rahmenfarbe=R074_P06',
    size: 'S'
  },
];
// ────────────────────────────────────────────────────────────

const STATE_FILE = path.resolve('state.json');
const COOKIE_BTN = 'button:has-text("Accept")';
const SOLDOUT_RE = /--(unpurchasable|notifyMe)/;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
let state = JSON.parse(await fs.readFile(STATE_FILE).catch(() => '{}'));

try {
  for (const { name, url, size } of WATCH_LIST) {
    const tileSel = `button[data-product-size="${size}"]`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const cookieBtn = page.locator(COOKIE_BTN);
    if (await cookieBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cookieBtn.click();
    }

    let classList = '--unpurchasable';
    try {
      await page.waitForSelector(tileSel, {
        timeout: 30_000,
        state: 'attached'
      });
      classList = await page.getAttribute(tileSel, 'class') ?? '';
    } catch {
      console.warn(`⚠️  ${name}: tile "${size}" not found – treating as OUT`);
    }

    const inStock = !SOLDOUT_RE.test(classList);
    const key = `${url}#${size}`;
    const wasInStock = !!state[key];

    console.log(`${name.padEnd(35)} → ${inStock ? 'IN stock' : 'out'}`);

    if (inStock && !wasInStock) {
      try {
        await sendEmail(name, url, size);
      } catch (err) {
        console.error('✉️  Mail error:', err);
      }
    }

    state[key] = inStock;
  }

  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}

// ────────────────────────────────────────────────────────────
async function sendEmail(itemName, url, size) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  await transporter.sendMail({
    from: `"Canyon Watch" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `🚲  ${itemName} is IN STOCK!`,
    text: `${itemName} (size ${size}) is now available:\n${url}\n\n⏩  Go grab it before it’s gone!`
  });

  console.log(`📧  Alert e-mail sent for ${itemName}`);
}
