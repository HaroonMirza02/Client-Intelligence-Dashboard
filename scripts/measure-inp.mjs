import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://vision71-client-intelligence.netlify.app/';

async function measureInp(url, iterations = 3) {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.addInitScript(() => {
      window.__inpDurations = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) {
            window.__inpDurations.push(entry.duration);
          }
        }
      });
      observer.observe({ type: 'event', buffered: true, durationThreshold: 0 });
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[aria-label="Search prospects"]');

    await page.click('input[aria-label="Search prospects"]');
    await page.type('input[aria-label="Search prospects"]', 'test', { delay: 50 });
    await page.selectOption('select[aria-label="Filter by status"]', { index: 1 });
    await page.waitForTimeout(1000);

    const inp = await page.evaluate(() => {
      const durations = window.__inpDurations || [];
      if (!durations.length) return null;
      return Math.max(...durations);
    });

    results.push(inp);
    await browser.close();
  }

  const valid = results.filter((v) => v != null).sort((a, b) => a - b);
  return { runs: results, medianInpMs: valid.length ? valid[Math.floor(valid.length / 2)] : null };
}

measureInp(URL).then((r) => console.log(JSON.stringify(r, null, 2))).catch(console.error);
