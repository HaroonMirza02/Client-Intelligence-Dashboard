import { useCallback, useMemo, useState, Component } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createRootRoute,
  createRouter,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { z } from 'zod';
import './styles.css';

const SHEETS = ['Prospect Companies', 'Market Notes', 'Upwork Signals'];
const STALE_TIME_MS = 5 * 60 * 1000;

const searchSchema = z.object({
  tab: z.enum(['pipeline', 'insights']).catch('pipeline'),
  search: z.string().catch(''),
  status: z.string().catch('All statuses'),
  industry: z.string().catch('All industries'),
});

const rootRoute = createRootRoute({
  validateSearch: (search) => searchSchema.parse(search),
  component: App,
});

const routeTree = rootRoute.addChildren([]);
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

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
    .filter((prospect) => prospect['Company Name'] && prospect['Company Name'] !== '—');
}

function parseMarketNotes(rows) {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map((c) => String(c).trim().toLowerCase());
    return (
      cells.some((c) => c === 'date') &&
      (cells.some((c) => c === 'category' || c === 'type') || cells.some((c) => c.includes('note')))
    );
  });

  if (headerIndex < 0) {
    return rows.filter(nonEmpty).filter((row) => row.filter((c) => String(c).trim()).length >= 2)
      .map((row) => ({ date: row[0] || '', category: '', note: row[1] || '', source: row[2] || '' }));
  }

  const headers = rows[headerIndex].map((c) => String(c).trim().toLowerCase());
  const col = (name) => headers.findIndex((h) => h === name || h.includes(name));

  const dateCol = col('date');
  const categoryCol = col('category') >= 0 ? col('category') : col('type');
  const noteCol = col('note');
  const sourceCol = col('source');

  return rows.slice(headerIndex + 1).filter(nonEmpty).map((row) => ({
    date: (dateCol >= 0 ? row[dateCol] : '') || '',
    category: (categoryCol >= 0 ? row[categoryCol] : '') || '',
    note: (noteCol >= 0 ? row[noteCol] : row[2]) || '',
    source: (sourceCol >= 0 ? row[sourceCol] : '') || '',
  })).filter((n) => n.note || n.category);
}

function parseUpworkSignals(rows) {
  const week = rows.find((row) => row[0] === 'Week Ending:')?.[1] || 'Latest update';
  const jobs = rows.find((row) => row[0] === 'Jobs Analyzed:')?.[1];
  const patternsAt = rows.findIndex((row) => String(row[0]).includes('NOTABLE PATTERNS'));
  const endAt = rows.findIndex((row, i) => i > patternsAt && String(row[0]).includes('HOURLY VS'));
  const patternRows = rows.slice(patternsAt + 1, endAt < 0 ? undefined : endAt)
    .map((row) => String(row[0] || '').trim()).filter((line) => line.startsWith('•'));
  return { week, jobs, signals: patternRows.slice(0, 3).map((line) => line.replace(/^•\s*/, '')) };
}

const label = (value) => value === '—' ? '' : value;
const statusClass = (value) => `status ${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`;

function getIndustries(industryStr) {
  if (!industryStr || industryStr === '—') return [];

  const parenRegex = /\([^)]+\)/g;
  const parens = [];
  let tempStr = String(industryStr).replace(parenRegex, (match) => {
    parens.push(match);
    return `__PAREN_${parens.length - 1}__`;
  });

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

    aiIots.forEach((val, idx) => {
      trimmed = trimmed.replace(new RegExp(`__AIIOT_${idx}__`, 'g'), val);
    });
    parens.forEach((val, idx) => {
      trimmed = trimmed.replace(new RegExp(`__PAREN_${idx}__`, 'g'), val);
    });

    return trimmed;
  }).filter((item) => item !== '' && item !== '—');
}

function useSheetQueries() {
  return useQueries({
    queries: SHEETS.map((name) => ({
      queryKey: ['sheet', name],
      queryFn: () => fetchSheet(name),
      staleTime: STALE_TIME_MS,
    })),
  });
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

      <div className="analytics-grid">
        <div className="analytics-left-col">
          <article className="chart-panel">
            <h3>Sales Pipeline Funnel</h3>
            <p className="chart-desc">Shows conversion stages for active prospects.</p>
            <div className="funnel-container">
              {funnelStages.map((stage) => {
                const maxCount = Math.max(...funnelStages.map((s) => s.count)) || 1;
                const widthPct = Math.max(25, Math.round((stage.count / maxCount) * 100));
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

function PipelineTable({ rows, loading }) {
  const [sorting, setSorting] = useState([]);

  const columns = useMemo(() => [
    {
      accessorKey: 'Company Name',
      header: 'Company Name',
      cell: ({ getValue }) => getValue(),
    },
    {
      accessorKey: 'Industry',
      header: 'Industry',
    },
    {
      accessorKey: 'Size (rough)',
      header: 'Size (rough)',
    },
    {
      accessorKey: 'Source',
      header: 'Source',
    },
    {
      accessorKey: 'Current Status',
      header: 'Current Status',
      cell: ({ getValue }) => {
        const value = getValue();
        return <span className={statusClass(value)}>{value}</span>;
      },
    },
    {
      accessorKey: 'Last Touched',
      header: 'Last Touched',
      cell: ({ getValue }) => label(getValue()) || '—',
    },
    {
      accessorKey: 'Notes',
      header: 'Notes',
      cell: ({ getValue }) => getValue(),
    },
  ], []);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={header.column.getCanSort() ? 'sortable' : undefined}
                  onClick={header.column.getToggleSortingHandler()}
                  aria-sort={
                    header.column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                  {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={
                    cell.column.id === 'Company Name'
                      ? 'company'
                      : cell.column.id === 'Notes'
                        ? 'notes-cell'
                        : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !rows.length && <p className="empty table-empty">No prospects match these filters.</p>}
    </div>
  );
}

function App() {
  const navigate = useNavigate({ from: '/' });
  const { tab, search: query, status: statusFilter, industry: industryFilter } = rootRoute.useSearch();
  const queryClient = useQueryClient();
  const sheetQueries = useSheetQueries();

  const loading = sheetQueries.some((q) => q.isFetching);
  const isInitialLoading = sheetQueries.some((q) => q.isLoading);
  const networkError = sheetQueries.find((q) => q.error)?.error;
  const hasData = sheetQueries.every((q) => q.data);

  const dataUpdatedAt = Math.max(...sheetQueries.map((q) => q.dataUpdatedAt || 0));
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // parseError is set when hasData is true but a parse function throws —
  // i.e. the sheet was reachable but returned unexpected/malformed content.
  // Returned from the same memo as data so no state setter is needed —
  // calling setState inside useMemo causes an infinite re-render loop (#301).
  const { data, parseError } = useMemo(() => {
    if (!hasData) return { data: null, parseError: null };
    try {
      const [prospectsRaw, notesRaw, upworkRaw] = sheetQueries.map((q) => q.data);
      return {
        data: {
          prospects: parseProspects(prospectsRaw),
          notes: parseMarketNotes(notesRaw),
          upwork: parseUpworkSignals(upworkRaw),
        },
        parseError: null,
      };
    } catch (err) {
      // Do not let the throw escape into the render phase.
      // Return null for data so the rest of the UI degrades safely,
      // and surface the error through the existing error banner.
      return {
        data: null,
        parseError: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }, [hasData, sheetQueries]);

  // Merge network error and parse error into one value.
  // Network error takes priority since it is the root cause when both exist.
  const error = networkError ?? parseError;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sheet'] });
  }, [queryClient]);

  const setSearchParams = useCallback((updates) => {
    navigate({ search: (prev) => ({ ...prev, ...updates }) });
  }, [navigate]);

  const prospects = data?.prospects || [];
  const pipelineProspects = prospects;
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
    const SIZE_BUCKETS = [
      { label: '1–10 employees', min: 1, max: 10 },
      { label: '11–50 employees', min: 11, max: 50 },
      { label: '51–200 employees', min: 51, max: 200 },
      { label: '201–500 employees', min: 201, max: 500 },
      { label: '501–1,000 employees', min: 501, max: 1000 },
      { label: '1,000+ employees', min: 1001, max: Infinity },
    ];

    function normalizeToBucket(rawSize) {
      if (!rawSize || rawSize === '—') return 'Not Specified';
      const cleaned = String(rawSize).replace(/,/g, '');
      const match = cleaned.match(/\d+/);
      if (!match) return 'Not Specified';
      const num = parseInt(match[0], 10);
      const bucket = SIZE_BUCKETS.find((b) => num >= b.min && num <= b.max);
      return bucket ? bucket.label : 'Not Specified';
    }

    const counts = {};
    pipelineProspects.forEach((p) => {
      const bucket = normalizeToBucket(p['Size (rough)']);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });

    const ordered = SIZE_BUCKETS
      .filter((b) => counts[b.label])
      .map((b) => ({ size: b.label, count: counts[b.label] }));
    if (counts['Not Specified']) {
      ordered.push({ size: 'Not Specified', count: counts['Not Specified'] });
    }
    return ordered;
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
        text: `${topSrc.source} is your primary channel, driving ${topSrc.count} leads (${percentage}% of total pipeline).`
      });
    }

    if (topIndustries.length > 0) {
      const topInd = topIndustries[0];
      insights.push({
        type: 'success',
        text: `Highest industry concentration found in "${topInd.industry}" (${topInd.count} companies).`
      });
    }

    const clientCount = pipelineProspects.filter((p) => p['Current Status'] === 'Client').length;
    const clientPct = total > 0 ? Math.round((clientCount / total) * 100) : 0;
    if (clientPct < 15) {
      insights.push({
        type: 'alert',
        text: `Conversion rate from pipeline to Client is currently ${clientPct}%. Focus on transitioning In-discussion leads.`
      });
    }

    return insights;
  }, [pipelineProspects, topSources, topIndustries]);

  const errorMessage = error instanceof Error ? error.message : error ? String(error) : '';

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">VISION71 TECHNOLOGIES</p><h1>Sales intelligence</h1><p className="subhead">A live view of the prospect pipeline and market signals.</p></div><div className="refresh-area"><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Loading live workbook…'}</span><button onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh data'}</button></div></header>
    {errorMessage && <div className="error" role="alert">{errorMessage} {data && 'Showing the last successful data set.'}</div>}

    <div className="tab-navigation">
      <button
        className={`tab-button ${tab === 'pipeline' ? 'active' : ''}`}
        onClick={() => setSearchParams({ tab: 'pipeline' })}
      >
        Prospect List
      </button>
      <button
        className={`tab-button ${tab === 'insights' ? 'active' : ''}`}
        onClick={() => setSearchParams({ tab: 'insights' })}
      >
        Manager Insights
      </button>
    </div>

    {tab === 'pipeline' ? (
      <>
        <section className="summary" aria-label="Pipeline summary"><div className="total-card"><span>Active prospects</span><strong>{pipelineProspects.length}</strong></div>{pipeline.map(({ status, count }) => <div className="stat-card" key={status}><span className={statusClass(status)}>{status}</span><strong>{count}</strong></div>)}</section>
        <section className="insights-grid"><article className="panel upwork"><div className="panel-heading"><div><p className="eyebrow">UPWORK MARKET SIGNALS</p><h2>{data?.upwork.week || 'Loading latest signals…'}</h2></div>{data?.upwork.jobs && <span className="jobs">{data.upwork.jobs} jobs analyzed</span>}</div><ul>{data?.upwork.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>{data && !data.upwork.signals.length && <p className="empty">No notable signals are available in the latest workbook update.</p>}</article>
          <article className="panel market"><div className="panel-heading"><div><p className="eyebrow">MARKET NOTES</p><h2>Competitive context</h2></div><span>{data?.notes.length || 0} notes</span></div>{data?.notes.length ? <ul className="notes">{data.notes.map((note, i) => <li key={i}><b>{note.category || 'Market note'}</b><span>{note.note}</span>{note.source && <small>{note.source}</small>}</li>)}</ul> : <p className="empty">No market notes have been logged yet. Add them to the live workbook and refresh here.</p>}</article></section>
        <section className="table-panel"><div className="table-head"><div><p className="eyebrow">PROSPECT COMPANIES</p><h2>Pipeline</h2></div><span>{visible.length} of {prospects.length} records shown · {pipelineProspects.length} active prospects</span></div><div className="filters"><input value={query} onChange={(e) => setSearchParams({ search: e.target.value })} placeholder="Search companies, notes, or sources" aria-label="Search prospects" /><select value={statusFilter} onChange={(e) => setSearchParams({ status: e.target.value })} aria-label="Filter by status"><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><select value={industryFilter} onChange={(e) => setSearchParams({ industry: e.target.value })} aria-label="Filter by industry"><option>All industries</option>{industries.map((item) => <option key={item}>{item}</option>)}</select></div><PipelineTable rows={visible} loading={isInitialLoading} /></section>
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

// Catches any render-phase throw that escapes the app tree — defense in depth
// so an unforeseen throw in any future component also degrades gracefully.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err) {
    return { error: err };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">VISION71 TECHNOLOGIES</p>
              <h1>Sales intelligence</h1>
            </div>
          </header>
          <div className="error" role="alert">
            An unexpected error occurred and the dashboard could not render.
            {' '}{this.state.error.message || String(this.state.error)}
            {' '}Please reload the page. If the problem persists, check the sheet data.
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </ErrorBoundary>
);
