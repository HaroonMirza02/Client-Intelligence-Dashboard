const SHEET_ID = '1-SGEvxRXLOolU0Pud7pIvDK6_aJVKo9VuM9FahaFM78';
const ALLOWED_SHEETS = new Set(['Prospect Companies', 'Market Notes', 'Upwork Signals']);

export default async (request) => {
  const name = new URL(request.url).searchParams.get('name');
  if (!ALLOWED_SHEETS.has(name)) {
    return Response.json({ error: 'Unknown worksheet.' }, { status: 400 });
  }
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`Google Sheets returned ${upstream.status}`);
    const raw = await upstream.text();
    const match = raw.match(/google\.visualization\.Query\.setResponse\((.*)\);?\s*$/s);
    if (!match) throw new Error('Unexpected Google Sheets response.');
    return Response.json(JSON.parse(match[1]), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to fetch worksheet.' }, { status: 502 });
  }
};
