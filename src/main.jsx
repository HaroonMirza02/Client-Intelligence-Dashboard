import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SHEETS = ['Prospect Companies', 'Market Notes', 'Upwork Signals'];

function cellValue(cell) {
  return cell?.f ?? cell?.v ?? '';
}

async function fetchSheet(name) {
  const response = await fetch(`/api/sheet?name=${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`${name} could not be loaded (${response.status}).`);
  const payload = await response.json();
  return payload.table.rows.map((row) => (row.c || []).map(cellValue));
}

function nonEmpty(row) { return row.some((item) => String(item).trim()); }

function parseProspects(rows) {
  const headerIndex = rows.findIndex((row) => row[0] === 'Company Name');
  if (headerIndex < 0) throw new Error('Prospect Companies headers were not found.');
  const headers = rows[headerIndex].slice(0, 7);
  return rows.slice(headerIndex + 1).filter(nonEmpty)
    .map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] || '—'])))
    // The final row in this worksheet is an explanatory note, not a prospect.
    .filter((prospect) => prospect['Company Name'] && prospect['Company Name'] !== '—');
}

function parseMarketNotes(rows) {
  const headerIndex = rows.findIndex((row) => row[0] === 'Date' && row[1] === 'Category');
  if (headerIndex < 0) return [];
  return rows.slice(headerIndex + 1).filter(nonEmpty).map((row) => ({ date: row[0] || '', category: row[1] || '', note: row[2] || '', source: row[3] || '' }));
}

function parseUpworkSignals(rows) {
  const week = rows.find((row) => row[0] === 'Week Ending:')?.[1] || 'Latest update';
  const jobs = rows.find((row) => row[0] === 'Jobs Analyzed:')?.[1];
  const patternsAt = rows.findIndex((row) => String(row[0]).includes('NOTABLE PATTERNS'));
  const endAt = rows.findIndex((row, i) => i > patternsAt && String(row[0]).includes('HOURLY VS'));
  const patternRows = rows.slice(patternsAt + 1, endAt < 0 ? undefined : endAt)
    .map((row) => String(row[0] || '').trim()).filter((line) => line.startsWith('•'));
  // These entries are curated in the live workbook; retaining the first three preserves its ranked signal order.
  return { week, jobs, signals: patternRows.slice(0, 3).map((line) => line.replace(/^•\s*/, '')) };
}

const label = (value) => value === '—' ? '' : value;
const statusClass = (value) => `status ${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`;
const isCompetitiveReference = (prospect) => /not a real sales prospect|competitive reference/i.test(prospect.Notes || '');

function App() {
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [industryFilter, setIndustryFilter] = useState('All industries');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const raw = await Promise.all(SHEETS.map(fetchSheet));
      setData({ prospects: parseProspects(raw[0]), notes: parseMarketNotes(raw[1]), upwork: parseUpworkSignals(raw[2]) });
      setLastUpdated(new Date());
    } catch (err) { setError(err.message || 'Refresh failed. Please try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const prospects = data?.prospects || [];
  const pipelineProspects = useMemo(() => prospects.filter((prospect) => !isCompetitiveReference(prospect)), [prospects]);
  const statuses = useMemo(() => [...new Set(pipelineProspects.map((p) => p['Current Status']))], [pipelineProspects]);
  const industries = useMemo(() => [...new Set(prospects.map((p) => p.Industry))].sort(), [prospects]);
  const visible = prospects.filter((p) => (statusFilter === 'All statuses' || p['Current Status'] === statusFilter) && (industryFilter === 'All industries' || p.Industry === industryFilter) && Object.values(p).join(' ').toLowerCase().includes(query.toLowerCase()));
  const pipeline = statuses.map((status) => ({ status, count: pipelineProspects.filter((p) => p['Current Status'] === status).length }));

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">VISION71 TECHNOLOGIES</p><h1>Sales intelligence</h1><p className="subhead">A live view of the prospect pipeline and market signals.</p></div><div className="refresh-area"><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Loading live workbook…'}</span><button onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh data'}</button></div></header>
    {error && <div className="error" role="alert">{error} {data && 'Showing the last successful data set.'}</div>}
    <section className="summary" aria-label="Pipeline summary"><div className="total-card"><span>Active prospects</span><strong>{pipelineProspects.length}</strong></div>{pipeline.map(({ status, count }) => <div className="stat-card" key={status}><span className={statusClass(status)}>{status}</span><strong>{count}</strong></div>)}</section>
    <section className="insights-grid"><article className="panel upwork"><div className="panel-heading"><div><p className="eyebrow">UPWORK MARKET SIGNALS</p><h2>{data?.upwork.week || 'Loading latest signals…'}</h2></div>{data?.upwork.jobs && <span className="jobs">{data.upwork.jobs} jobs analyzed</span>}</div><ul>{data?.upwork.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>{data && !data.upwork.signals.length && <p className="empty">No notable signals are available in the latest workbook update.</p>}</article>
      <article className="panel market"><div className="panel-heading"><div><p className="eyebrow">MARKET NOTES</p><h2>Competitive context</h2></div><span>{data?.notes.length || 0} notes</span></div>{data?.notes.length ? <ul className="notes">{data.notes.map((note, i) => <li key={i}><b>{note.category || 'Market note'}</b><span>{note.note}</span>{note.source && <small>{note.source}</small>}</li>)}</ul> : <p className="empty">No market notes have been logged yet. Add them to the live workbook and refresh here.</p>}</article></section>
    <section className="table-panel"><div className="table-head"><div><p className="eyebrow">PROSPECT COMPANIES</p><h2>Pipeline</h2></div><span>{visible.length} of {prospects.length} records shown · {pipelineProspects.length} active prospects</span></div><div className="filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies, notes, or sources" aria-label="Search prospects"/><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} aria-label="Filter by industry"><option>All industries</option>{industries.map((item) => <option key={item}>{item}</option>)}</select></div><div className="table-wrap"><table><thead><tr>{['Company Name', 'Industry', 'Size (rough)', 'Source', 'Current Status', 'Last Touched', 'Notes'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{visible.map((p) => <tr key={p['Company Name']}><td className="company">{p['Company Name']}</td><td>{p.Industry}</td><td>{p['Size (rough)']}</td><td>{p.Source}</td><td><span className={statusClass(p['Current Status'])}>{p['Current Status']}</span></td><td>{label(p['Last Touched']) || '—'}</td><td className="notes-cell">{p.Notes}</td></tr>)}</tbody></table>{!loading && !visible.length && <p className="empty table-empty">No prospects match these filters.</p>}</div></section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
