#!/usr/bin/env node
import fs from 'fs';
import { chromium } from 'playwright';

const URL = 'https://web.peacefulvanilla.club/shops/data.json';
const HOMEPAGE = 'https://web.peacefulvanilla.club/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  console.log('Navigating to homepage to execute site JavaScript...');
  await page.goto(HOMEPAGE, { waitUntil: 'networkidle' });
  console.log('Requesting data.json via browser context...');
  const response = await page.request.get(URL, {
    headers: {
      Referer: HOMEPAGE,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok()) {
    console.error('Failed to fetch data.json, status:', response.status());
    await browser.close();
    process.exit(22);
  }
  const body = await response.text();
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/data.json', body, 'utf8');
  console.log('Wrote public/data.json (' + Buffer.byteLength(body, 'utf8') + ' bytes)');
  await browser.close();
})();
