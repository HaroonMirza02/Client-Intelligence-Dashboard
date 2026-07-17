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

function getIndustries(industryStr) {
  if (!industryStr || industryStr === '—') return [];

  // Temporarily mask parenthesized contents to avoid splitting inside e.g. (SEO/SEM/PPC)
  const parenRegex = /\([^)]+\)/g;
  const parens = [];
  let tempStr = String(industryStr).replace(parenRegex, (match) => {
    parens.push(match);
    return `__PAREN_${parens.length - 1}__`;
  });

  // Temporarily mask AI/IoT to prevent splitting it
  const aiIotRegex = /\bAI\/IoT\b/gi;
  const aiIots = [];
  tempStr = tempStr.replace(aiIotRegex, (match) => {
    aiIots.push(match);
    return `__AIIOT_${aiIots.length - 1}__`;
  });

  const parts = tempStr.split(/,|\//);
  return parts.map((part) => {
    let trimmed = part.trim();
    if (!trimmed) return '';

    // Restore masked placeholders
    aiIots.forEach((val, idx) => {
      trimmed = trimmed.replace(new RegExp(`__AIIOT_${idx}__`, 'g'), val);
    });
    parens.forEach((val, idx) => {
      trimmed = trimmed.replace(new RegExp(`__PAREN_${idx}__`, 'g'), val);
    });

    return trimmed;
  }).filter((item) => item !== '' && item !== '—');
}

function ManagerInsights({
  pipelineProspects,
  funnelStages,
  topIndustries,
  topSources,
  sizeDistribution,
  executiveInsights
}) {
  return (
    <div className="insights-view">
      {/* Overview stats */}
      <section className="insights-overview-row">
        <div className="insight-stat-card">
          <span>Active Pipeline</span>
          <strong>{pipelineProspects.length}</strong>
          <small>Pro prospects in pipeline</small>
        </div>
        <div className="insight-stat-card">
          <span>Opportunity Rate</span>
          <strong>
            {pipelineProspects.length > 0
              ? Math.round(
                (pipelineProspects.filter((p) => p['Current Status'] === 'In discussion').length /
                  pipelineProspects.length) *
                100
              )
              : 0}
            %
          </strong>
          <small>Leads in discussion</small>
        </div>
        <div className="insight-stat-card">
          <span>Primary Source</span>
          <strong>{topSources[0]?.source || 'None'}</strong>
          <small>{topSources[0]?.count || 0} leads from this source</small>
        </div>
        <div className="insight-stat-card">
          <span>Top Industry Focus</span>
          <strong>{topIndustries[0]?.industry || 'None'}</strong>
          <small>{topIndustries[0]?.count || 0} companies mapped</small>
        </div>
      </section>

      {/* Main analytics grid */}
      <div className="analytics-grid">
        <div className="analytics-left-col">
          {/* Funnel Chart */}
          <article className="chart-panel">
            <h3>Sales Pipeline Funnel</h3>
            <p className="chart-desc">Shows conversion stages for active prospects.</p>
            <div className="funnel-container">
              {funnelStages.map((stage) => {
                const maxCount = Math.max(...funnelStages.map((s) => s.count)) || 1;
                // Width declines as step goes down to look like a funnel, but capped based on count
                const widthPct = Math.max(25, Math.round((stage.count / maxCount) * 100));

                // Get color matching status class
                const statusName = stage.stage.toLowerCase().replace(/[^a-z]+/g, '-');

                return (
                  <div key={stage.stage} className="funnel-step-row">
                    <div className="funnel-step-label">
                      <span className={`status ${statusName}`}>{stage.stage}</span>
                    </div>
                    <div className="funnel-step-track">
                      <div
                        className={`funnel-step-bar ${statusName}`}
                        style={{ width: `${widthPct}%` }}
                      >
                        <span className="funnel-step-val">{stage.count} ({stage.pct}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          {/* Industry focus */}
          <article className="chart-panel">
            <h3>Top Focus Industries</h3>
            <p className="chart-desc">Markets with the highest density of prospects.</p>
            <div className="industry-bars">
              {topIndustries.map((ind) => {
                const maxCount = Math.max(...topIndustries.map((i) => i.count)) || 1;
                const barWidth = Math.round((ind.count / maxCount) * 100);
                return (
                  <div key={ind.industry} className="industry-bar-item">
                    <div className="industry-bar-info">
                      <span className="industry-name">{ind.industry}</span>
                      <strong className="industry-count">{ind.count}</strong>
                    </div>
                    <div className="industry-bar-track">
                      <div className="industry-bar-fill" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                );
              })}
              {topIndustries.length === 0 && <p className="empty">No industries logged.</p>}
            </div>
          </article>
        </div>

        <div className="analytics-right-col">
          {/* Executive Action Board */}
          <article className="chart-panel alert-board">
            <h3>Executive Actions & Alerts</h3>
            <p className="chart-desc">Auto-generated focus items for sales leadership.</p>
            <div className="alerts-list">
              {executiveInsights.map((ins, i) => (
                <div key={i} className={`alert-item ${ins.type}`}>
                  <div>{ins.text}</div>
                </div>
              ))}
              {executiveInsights.length === 0 && <p className="empty">No actions or alerts generated.</p>}
            </div>
          </article>

          {/* Acquisition Channels */}
          <article className="chart-panel">
            <h3>Acquisition Channels (Sources)</h3>
            <p className="chart-desc">Where our prospects originate from.</p>
            <div className="sources-list">
              {topSources.map((src, index) => {
                const colors = ['#1661c8', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];
                const color = colors[index % colors.length];
                const maxCount = Math.max(...topSources.map((s) => s.count)) || 1;
                const barWidth = Math.round((src.count / maxCount) * 100);
                return (
                  <div key={src.source} className="source-bar-item">
                    <div className="source-bar-label">
                      <span>
                        <span className="source-dot" style={{ backgroundColor: color }} />
                        <span className="source-name">{src.source}</span>
                      </span>
                      <strong className="source-count">{src.count}</strong>
                    </div>
                    <div className="source-bar-track">
                      <div className="source-bar-fill" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
              {topSources.length === 0 && <p className="empty">No sources logged.</p>}
            </div>
          </article>

          {/* Company Sizes */}
          <article className="chart-panel">
            <h3>Prospect Size Profile</h3>
            <p className="chart-desc">Breakdown of companies by size bracket.</p>
            <div className="sizes-distribution">
              {sizeDistribution.map((size) => {
                const total = pipelineProspects.length || 1;
                const sizePct = Math.round((size.count / total) * 100);
                return (
                  <div key={size.size} className="size-badge-row">
                    <span className="size-badge">{size.size === '—' ? 'Not Specified' : size.size}</span>
                    <div className="size-badge-bar-wrap">
                      <div className="size-badge-bar" style={{ width: `${sizePct}%` }} />
                    </div>
                    <span className="size-badge-pct">{size.count} ({sizePct}%)</span>
                  </div>
                );
              })}
              {sizeDistribution.length === 0 && <p className="empty">No size data logged.</p>}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [industryFilter, setIndustryFilter] = useState('All industries');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pipeline');

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
  const industries = useMemo(() => {
    const set = new Set();
    prospects.forEach((p) => {
      getIndustries(p.Industry).forEach((ind) => set.add(ind));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [prospects]);
  const visible = prospects.filter((p) =>
    (statusFilter === 'All statuses' || p['Current Status'] === statusFilter) &&
    (industryFilter === 'All industries' || getIndustries(p.Industry).includes(industryFilter)) &&
    Object.values(p).join(' ').toLowerCase().includes(query.toLowerCase())
  );
  const pipeline = statuses.map((status) => ({ status, count: pipelineProspects.filter((p) => p['Current Status'] === status).length }));

  const funnelStages = useMemo(() => {
    const order = ['Cold', 'Contacted', 'In discussion', 'Client'];
    const total = pipelineProspects.length;
    return order.map((stage) => {
      const count = pipelineProspects.filter((p) => p['Current Status'] === stage).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return { stage, count, pct };
    });
  }, [pipelineProspects]);

  const topIndustries = useMemo(() => {
    const counts = {};
    pipelineProspects.forEach((p) => {
      getIndustries(p.Industry).forEach((ind) => {
        counts[ind] = (counts[ind] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [pipelineProspects]);

  const topSources = useMemo(() => {
    const counts = {};
    pipelineProspects.forEach((p) => {
      const src = p.Source || 'Unknown';
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [pipelineProspects]);

  const sizeDistribution = useMemo(() => {
    const counts = {};
    pipelineProspects.forEach((p) => {
      const size = p['Size (rough)'] || '—';
      counts[size] = (counts[size] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => b.count - a.count);
  }, [pipelineProspects]);

  const executiveInsights = useMemo(() => {
    const insights = [];
    const total = pipelineProspects.length;
    if (total === 0) return [];

    const inDiscussionOrContacted = pipelineProspects.filter(
      (p) => p['Current Status'] === 'In discussion' || p['Current Status'] === 'Contacted'
    );
    const untouched = inDiscussionOrContacted.filter((p) => !p['Last Touched'] || p['Last Touched'] === '—');
    if (untouched.length > 0) {
      insights.push({
        type: 'warning',
        text: `⚠️ ${untouched.length} leads in discussion / contacted stage have no registered touch activity. Immediate follow-up recommended.`
      });
    }

    if (topSources.length > 0) {
      const topSrc = topSources[0];
      const percentage = Math.round((topSrc.count / total) * 100);
      insights.push({
        type: 'info',
        text: `📈 ${topSrc.source} is your primary channel, driving ${topSrc.count} leads (${percentage}% of total pipeline).`
      });
    }

    if (topIndustries.length > 0) {
      const topInd = topIndustries[0];
      insights.push({
        type: 'success',
        text: `🎯 Highest industry concentration found in "${topInd.industry}" (${topInd.count} companies).`
      });
    }

    const clientCount = pipelineProspects.filter((p) => p['Current Status'] === 'Client').length;
    const clientPct = total > 0 ? Math.round((clientCount / total) * 100) : 0;
    if (clientPct < 15) {
      insights.push({
        type: 'alert',
        text: `💡 Conversion rate from pipeline to Client is currently ${clientPct}%. Focus on transitioning In-discussion leads.`
      });
    }

    return insights;
  }, [pipelineProspects, topSources, topIndustries]);

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">VISION71 TECHNOLOGIES</p><h1>Sales intelligence</h1><p className="subhead">A live view of the prospect pipeline and market signals.</p></div><div className="refresh-area"><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Loading live workbook…'}</span><button onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh data'}</button></div></header>
    {error && <div className="error" role="alert">{error} {data && 'Showing the last successful data set.'}</div>}

    <div className="tab-navigation">
      <button
        className={`tab-button ${activeTab === 'pipeline' ? 'active' : ''}`}
        onClick={() => setActiveTab('pipeline')}
      >
        Prospect List
      </button>
      <button
        className={`tab-button ${activeTab === 'insights' ? 'active' : ''}`}
        onClick={() => setActiveTab('insights')}
      >
        Manager Insights
      </button>
    </div>

    {activeTab === 'pipeline' ? (
      <>
        <section className="summary" aria-label="Pipeline summary"><div className="total-card"><span>Active prospects</span><strong>{pipelineProspects.length}</strong></div>{pipeline.map(({ status, count }) => <div className="stat-card" key={status}><span className={statusClass(status)}>{status}</span><strong>{count}</strong></div>)}</section>
        <section className="insights-grid"><article className="panel upwork"><div className="panel-heading"><div><p className="eyebrow">UPWORK MARKET SIGNALS</p><h2>{data?.upwork.week || 'Loading latest signals…'}</h2></div>{data?.upwork.jobs && <span className="jobs">{data.upwork.jobs} jobs analyzed</span>}</div><ul>{data?.upwork.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>{data && !data.upwork.signals.length && <p className="empty">No notable signals are available in the latest workbook update.</p>}</article>
          <article className="panel market"><div className="panel-heading"><div><p className="eyebrow">MARKET NOTES</p><h2>Competitive context</h2></div><span>{data?.notes.length || 0} notes</span></div>{data?.notes.length ? <ul className="notes">{data.notes.map((note, i) => <li key={i}><b>{note.category || 'Market note'}</b><span>{note.note}</span>{note.source && <small>{note.source}</small>}</li>)}</ul> : <p className="empty">No market notes have been logged yet. Add them to the live workbook and refresh here.</p>}</article></section>
        <section className="table-panel"><div className="table-head"><div><p className="eyebrow">PROSPECT COMPANIES</p><h2>Pipeline</h2></div><span>{visible.length} of {prospects.length} records shown · {pipelineProspects.length} active prospects</span></div><div className="filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies, notes, or sources" aria-label="Search prospects" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} aria-label="Filter by industry"><option>All industries</option>{industries.map((item) => <option key={item}>{item}</option>)}</select></div><div className="table-wrap"><table><thead><tr>{['Company Name', 'Industry', 'Size (rough)', 'Source', 'Current Status', 'Last Touched', 'Notes'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{visible.map((p) => <tr key={p['Company Name']}><td className="company">{p['Company Name']}</td><td>{p.Industry}</td><td>{p['Size (rough)']}</td><td>{p.Source}</td><td><span className={statusClass(p['Current Status'])}>{p['Current Status']}</span></td><td>{label(p['Last Touched']) || '—'}</td><td className="notes-cell">{p.Notes}</td></tr>)}</tbody></table>{!loading && !visible.length && <p className="empty table-empty">No prospects match these filters.</p>}</div></section>
      </>
    ) : (
      <ManagerInsights
        pipelineProspects={pipelineProspects}
        funnelStages={funnelStages}
        topIndustries={topIndustries}
        topSources={topSources}
        sizeDistribution={sizeDistribution}
        executiveInsights={executiveInsights}
      />
    )}
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
