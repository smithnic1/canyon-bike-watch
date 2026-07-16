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
    name: 'Grizl CF 7 (S, R126_P02)',
    url: 'https://www.canyon.com/en-ca/gravel-bikes/adventure/grizl/cf/grizl-cf-7/4167.html?dwvar_4167_pv_rahmenfarbe=R126_P02',
    size: 'S'
  },
  {
    name: 'Grizl CF 7 (S, R126_P01)',
    url: 'https://www.canyon.com/en-ca/gravel-bikes/adventure/grizl/cf/grizl-cf-7/4167.html?dwvar_4167_pv_rahmenfarbe=R126_P01',
    size: 'S'
  },
  {
    name: 'Grizl CF 6 (S, R126_P02)',
    url: 'https://www.canyon.com/en-ca/gravel-bikes/adventure/grizl/cf/grizl-cf-6/4141.html?dwvar_4141_pv_rahmenfarbe=R126_P02&dwvar_4141_pv_rahmengroesse=S',
    size: 'S'
  },
];
// ────────────────────────────────────────────────────────────

const STATE_FILE = path.resolve('state.json');
const COOKIE_BTN = 'button:has-text("Accept")';
const PURCHASABLE_RE = /\bproductConfiguration__selectVariant--purchasable\b/;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
let state = JSON.parse(await fs.readFile(STATE_FILE).catch(() => '{}'));

try {
  for (const { name, url, size } of WATCH_LIST) {
    const tileSel = `button.js-productConfigurationSelect[data-product-size="${size}"]`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const cookieBtn = page.locator(COOKIE_BTN);
    if (await cookieBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cookieBtn.click();
    }

    // Canyon marks available variants explicitly with --purchasable.
    // Default to out of stock if the exact size button cannot be found or
    // does not have that class.
    let buttonClass = 'productConfiguration__selectVariant--unpurchasable';
    try {
      await page.waitForSelector(tileSel, {
        timeout: 30_000,
        state: 'attached'
      });
      buttonClass = await page.getAttribute(tileSel, 'class') ?? '';
    } catch {
      console.warn(`⚠️  ${name}: tile "${size}" not found – treating as OUT`);
    }

    const inStock = PURCHASABLE_RE.test(buttonClass);
    const key = `${url}#${size}`;
    const wasInStock = !!state[key];

    console.log(`${name.padEnd(35)} → ${inStock ? 'IN stock' : 'out'}`);

    if (inStock && !wasInStock) {
      try {
        await sendEmail(name, url, size);
      } catch (err) {
        console.error('✉️  Mail error:', err);
        // Keep the item unalerted so a later run retries the notification.
        state[key] = false;
        continue;
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
