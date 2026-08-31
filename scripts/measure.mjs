import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync } from 'fs';

const URL = process.argv[2] || 'https://vision71-client-intelligence.netlify.app/';

async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox'] });
  const options = {
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance'],
    port: chrome.port,
  };
  const runnerResult = await lighthouse(url, options);
  await chrome.kill();
  const lhr = runnerResult.lhr;
  const audits = lhr.audits;
  return {
    lcp: audits['largest-contentful-paint']?.numericValue,
    inp: audits['interaction-to-next-paint']?.numericValue ?? audits['experimental-interaction-to-next-paint']?.numericValue,
    fcp: audits['first-contentful-paint']?.numericValue,
    ttfb: audits['server-response-time']?.numericValue,
  };
}

async function countNetworkRequests(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const firstLoadRequests = [];
  page.on('request', (req) => firstLoadRequests.push(req.url()));

  await page.goto(url, { waitUntil: 'networkidle' });
  const firstLoadCount = firstLoadRequests.length;

  const filterChangeRequests = [];
  const filterListener = (req) => filterChangeRequests.push(req.url());
  page.on('request', filterListener);

  await page.fill('input[aria-label="Search prospects"]', 'test');
  await page.waitForTimeout(2000);
  const filterChangeCount = filterChangeRequests.length;

  page.off('request', filterListener);
  await browser.close();

  return { firstLoadCount, filterChangeCount, firstLoadUrls: firstLoadRequests, filterChangeUrls: filterChangeRequests };
}

async function main() {
  console.log(`Measuring: ${URL}`);

  const lighthouseRuns = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`Lighthouse run ${i}/3...`);
    const result = await runLighthouse(URL);
    lighthouseRuns.push(result);
    console.log(`  LCP: ${result.lcp}ms, INP: ${result.inp ?? 'N/A'}ms`);
  }

  const lcps = lighthouseRuns.map((r) => r.lcp).filter((v) => v != null).sort((a, b) => a - b);
  const inps = lighthouseRuns.map((r) => r.inp).filter((v) => v != null).sort((a, b) => a - b);

  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);

  console.log('Counting network requests...');
  const network = await countNetworkRequests(URL);

  const output = {
    url: URL,
    timestamp: new Date().toISOString(),
    lighthouse: {
      runs: lighthouseRuns,
      medianLcpMs: median(lcps),
      medianInpMs: median(inps),
    },
    network,
  };

  writeFileSync('measure-output.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
