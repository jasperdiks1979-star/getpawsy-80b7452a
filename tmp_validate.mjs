import { chromium, devices } from 'playwright';
import fs from 'fs';

const rows = fs.readFileSync('/tmp/pins.txt','utf8').trim().split('\n').slice(1).filter(l=>l && !l.startsWith('('));
const pins = rows.map(r => { const [pid,purl,dest,slug]=r.split('|'); return {pid,purl,dest,slug}; });

const iPhone = devices['iPhone 13'];
const browser = await chromium.launch({ executablePath: '/bin/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ ...iPhone });
const results = [];

for (const p of pins) {
  const page = await ctx.newPage();
  const chain = [];
  page.on('response', r => { if ([301,302,303,307,308].includes(r.status())) chain.push(`${r.status()} ${r.url()}`); });
  let status=null, finalUrl='', title='', atc=false, err='';
  try {
    const resp = await page.goto(p.dest, { waitUntil: 'networkidle', timeout: 30000 });
    status = resp?.status();
    finalUrl = page.url();
    await page.waitForTimeout(1500);
    title = (await page.title()).slice(0,80);
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    atc = /add to cart|add to bag/.test(bodyText);
    var notFound = /couldn't find|page not found|404/.test(bodyText) && !atc;
  } catch(e) { err = e.message.slice(0,60); }
  const pass = status===200 && !!title && atc && !title.toLowerCase().includes('not found');
  results.push({ ...p, status, finalUrl, title, atc, chain: chain.length, pass, err });
  console.log(`${pass?'✓':'✗'} ${status} | ${title} | atc=${atc} | ${finalUrl.split('?')[0].replace('https://getpawsy.pet','')}`);
  await page.close();
}

await browser.close();
const passed = results.filter(r=>r.pass).length;
console.log(`\n=== ${passed}/${results.length} passed (${(passed/results.length*100).toFixed(1)}%) ===`);
fs.writeFileSync('/tmp/results.json', JSON.stringify(results,null,2));
