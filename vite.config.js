import { defineConfig } from 'vite';

const SHEET_ID = '1-SGEvxRXLOolU0Pud7pIvDK6_aJVKo9VuM9FahaFM78';
const allowed = new Set(['Prospect Companies', 'Market Notes', 'Upwork Signals', 'Monday Briefing']);

export default defineConfig({
  plugins: [{
    name: 'vision71-local-sheet-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sheet', async (req, res) => {
        const name = new URL(req.url, 'http://localhost').searchParams.get('name');
        if (!allowed.has(name)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Unknown worksheet.' })); return; }
        try {
          const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
          const response = await fetch(url);
          const raw = await response.text();
          const match = raw.match(/google\.visualization\.Query\.setResponse\((.*)\);?\s*$/s);
          res.setHeader('Content-Type', 'application/json'); res.end(match ? match[1] : JSON.stringify({ error: 'Unexpected Google Sheets response.' }));
        } catch (error) { res.statusCode = 502; res.end(JSON.stringify({ error: error.message })); }
      });
    }
  }]
});
