import { chromium } from 'playwright';

const URL = process.argv[2];

async function testUrlParams(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${url}?tab=pipeline&search=test&status=Cold&industry=Healthcare`, { waitUntil: 'networkidle' });
  const currentUrl = page.url();
  const searchValue = await page.inputValue('input[aria-label="Search prospects"]');
  const statusValue = await page.locator('select[aria-label="Filter by status"]').inputValue();
  const industryValue = await page.locator('select[aria-label="Filter by industry"]').inputValue();

  await page.reload({ waitUntil: 'networkidle' });
  const afterReloadSearch = await page.inputValue('input[aria-label="Search prospects"]');
  const afterReloadUrl = page.url();

  await browser.close();
  console.log(JSON.stringify({
    loadedUrl: currentUrl,
    searchValue,
    statusValue,
    industryValue,
    afterReloadSearch,
    afterReloadUrl,
  }, null, 2));
}

testUrlParams(URL).catch(console.error);
