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
  try {
    console.log('Navigating to homepage to execute site JavaScript...');
    await page.goto(HOMEPAGE, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Homepage loaded — cookies:', await context.cookies());

    console.log('Requesting data.json via browser context...');
    const response = await page.request.get(URL, {
      headers: {
        Referer: HOMEPAGE,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    });

    console.log('Response status:', response.status());
    if (!response.ok()) {
      const text = await response.text().catch(() => '<no-body>');
      console.error('Failed to fetch data.json — status:', response.status());
      console.error('Response body:', text.slice(0, 2000));
      await browser.close();
      process.exit(22);
    }

    const body = await response.text();
    fs.mkdirSync('public', { recursive: true });
    fs.writeFileSync('public/data.json', body, 'utf8');
    console.log('Wrote public/data.json (' + Buffer.byteLength(body, 'utf8') + ' bytes)');
  } catch (err) {
    console.error('Error in fetch-data script:', err && err.stack ? err.stack : err);
    await browser.close();
    process.exit(1);
  }
  await browser.close();
})();
