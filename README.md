# Vision71 Sales Intelligence Dashboard

This React dashboard reads the public Vision71 Google Sheet live on every load and whenever **Refresh data** is selected. It is ready to deploy as a Vite site on Netlify. A tiny Netlify Function proxies the public workbook, avoiding browser CORS issues while keeping the refresh credential-free.

## Run and deploy

```bash
npm install
npm run dev
```

For Netlify, use build command `npm run build` and publish directory `dist`. Netlify automatically deploys `netlify/functions/sheet.mjs`. No environment variables or credentials are required while the workbook remains publicly readable.

## Weekly workflow

1. Add new prospects in the **Prospect Companies** tab, beneath its header row, filling in Company Name, Industry, Size, Source, Current Status, Last Touched, and Notes.
2. Update `Current Status` and `Last Touched` after outreach and at least once each Monday. Statuses remain open-ended: any new status in the sheet will appear in both the summary and filter.
3. Add timely market observations to **Market Notes**. Update the latest **Upwork Signals** block before the sales meeting.
4. The dashboard picks up the sheet’s published data automatically on page load or immediately after selecting **Refresh data**. No republishing step is needed for the current Google Visualization endpoint.

The dashboard retains company records, including competitive references such as Contour Software, so the source remains transparent. Competitive references are visibly labelled in the table and excluded from active-pipeline totals; explanatory rows in the sheet are not treated as prospects.
