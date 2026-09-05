import { useState } from 'react';
import { parseUpwork } from './upwork';

const fmt = (n) => n === null || n === undefined ? '—' : n.toLocaleString();
const pct = (n, total) => n !== null && total > 0 ? `${(n / total * 100).toFixed(1)}%` : '—';
const money = (n) => n === null ? '—' : `$${n.toFixed(1)}`;

function Bars({ items, total, color = 'blue', offset = 0, scale }) {
  const max = scale || Math.max(1, ...items.map((item) => item.count ?? 0));
  return <div className={`uw-bars ${color}`}>{items.map((item, i) => <div className="uw-bar" key={item.name}>
    <div className="uw-bar-label"><span><small>{String(i + 1 + offset).padStart(2, '0')}</small>{item.name}</span><b>{fmt(item.count)} <em>{pct(item.count, total)}</em></b></div>
    <div className="uw-track"><div style={{ width: `${Math.max(0, (item.count ?? 0) / max * 100)}%` }} /></div>
  </div>)}</div>;
}

export default function UpworkDashboard({ sheet, loading, view = 'overview' }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('demand');
  if (!sheet) return <div className="briefing-empty" role="status">{loading ? 'Reading the Upwork market snapshot…' : 'Upwork data is unavailable. Refresh to try again.'}</div>;
  const data = parseUpwork(sheet);
  const hourly = data.contracts.find((item) => item.name === 'Hourly')?.count ?? null;
  const fixed = data.contracts.find((item) => item.name === 'Fixed price')?.count ?? null;
  const mixTotal = hourly !== null && fixed !== null ? hourly + fixed : null;
  const share = mixTotal > 0 ? hourly / mixTotal * 100 : 0;
  const categories = [...data.categories].sort((a, b) => b.count - a.count);
  const skills = [...data.skills].filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.count - a.count);
  const lead = categories[0];
  const signalText = data.patterns.join(' ');
  const mentions = [
    ['Stripe', /Stripe integration requested in ([\d,]+) posts/i],
    ['Supabase', /Supabase appears in ([\d,]+) posts/i],
    ['OpenAI', /OpenAI in ([\d,]+)/i],
    ['Claude / Anthropic', /Claude\/Anthropic mentioned in ([\d,]+) job posts/i],
  ].map(([name, pattern]) => ({ name, count: signalText.match(pattern)?.[1] }))
    .filter((item) => item.count !== undefined)
    .map((item) => ({ ...item, count: Number(item.count.replace(/,/g, '')) }))
    .sort((a, b) => b.count - a.count);
  const rates = [{ name: 'All hourly jobs', value: data.rate }, { name: data.rateCategory || 'Top category', value: data.categoryRate }].filter((item) => item.value !== null);
  const rateMax = Math.max(1, ...rates.map((item) => item.value)) * 1.15;
  const rateGap = data.rate !== null && data.categoryRate !== null ? data.categoryRate - data.rate : null;
  const actions = [
    ...(lead ? [{ title: `Lead with ${lead.name}`, evidence: `${fmt(lead.count)} postings · ${pct(lead.count, data.jobs)} of the sample`, action: 'Prioritize relevant case studies and a focused proposal template for this category.' }] : []),
    ...(hourly !== null ? [{ title: hourly >= (fixed ?? 0) ? 'Structure for ongoing delivery' : 'Package defined outcomes', evidence: `${pct(hourly, mixTotal)} of classified jobs are hourly`, action: hourly >= (fixed ?? 0) ? 'Offer a paid discovery phase followed by scoped, hourly delivery milestones.' : 'Build fixed-scope packages with explicit acceptance criteria.' }] : []),
    ...(data.skills[0] ? [{ title: 'Match delivery capacity to demand', evidence: `${data.skills[0].name}: ${fmt(data.skills[0].count)} skill requests`, action: 'Review team availability and attach matching work samples before increasing proposal volume.' }] : []),
  ];
  return <div className="uw-dashboard">
    {view === 'overview' && <>
    <div className="uw-compact-heading"><h2>Upwork market overview</h2><span>{data.week || 'Current snapshot'} · Google Sheets</span></div>
    <section className="uw-kpis" aria-label="Upwork key performance indicators">
      {[['Jobs analyzed', fmt(data.jobs), 'Scraped postings in this snapshot'], ['Hourly contract share', pct(hourly, mixTotal), `${fmt(hourly)} hourly / ${fmt(mixTotal)} classified jobs`], ['Average hourly rate', money(data.rate), 'Per hour · worksheet benchmark'], ['Top-category rate', money(data.categoryRate), data.rateCategory || 'Not provided']].map(([label, value, note]) => <article className="uw-kpi" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <div className="uw-two-col">
      <section className="uw-panel"><p className="eyebrow">01 / DEMAND</p><h2>Leading job categories</h2><p className="uw-caption">Reported leaders · counts and share of all analyzed jobs</p><Bars items={categories} total={data.jobs} /><p className="uw-footnote">Only the worksheet’s top categories are listed; this is not a complete category breakdown.</p></section>
      <section className="uw-panel"><p className="eyebrow">02 / ENGAGEMENT MODEL</p><h2>How clients want to buy</h2><div className="uw-mix"><div className="uw-donut" role="img" aria-label={`${fmt(hourly)} hourly jobs and ${fmt(fixed)} fixed-price jobs`} style={{ background: `conic-gradient(#227b67 0 ${share}%, #d7e7e2 ${share}% 100%)` }}><div><strong>{pct(hourly, mixTotal)}</strong><span>hourly</span></div></div><div className="uw-legend">{data.contracts.map((item) => <div key={item.name}><span>{item.name}</span><strong>{fmt(item.count)}</strong><small>{pct(item.count, mixTotal)} of classified jobs</small></div>)}</div></div><p className="uw-footnote">{mixTotal !== null && data.jobs !== null && mixTotal !== data.jobs ? `Contract counts total ${mixTotal}, compared with ${data.jobs} jobs analyzed.` : 'Contract mix reflects this sample, not the entire Upwork market.'}</p></section>
    </div>
    <div className="uw-two-col">
      <section className="uw-panel"><p className="eyebrow">INTEGRATION OPPORTUNITIES</p><h2>What clients want integrated</h2><p className="uw-caption">Posting-text mentions · share of {fmt(data.jobs)} analyzed jobs</p><Bars items={mentions} total={data.jobs} color="green" />{!mentions.length && <p className="empty">No quantified integration mentions found in this snapshot.</p>}<p className="uw-footnote">Extracted from worksheet signals. Mentions can overlap; these differ from structured skill counts.</p></section>
      <section className="uw-panel"><p className="eyebrow">RATE POSITIONING</p><h2>Volume doesn’t imply a rate premium</h2><p className="uw-caption">Average hourly benchmarks · USD per hour</p><div className="uw-rate-chart">{rates.map((item) => <div className="uw-rate-column" key={item.name}><div className="uw-rate-track"><div style={{ height: `${item.value / rateMax * 100}%` }}><strong>{money(item.value)}</strong></div></div><span>{item.name}</span></div>)}</div>{rateGap !== null && <p className="uw-rate-insight"><strong>{money(Math.abs(rateGap))}/hr {rateGap < 0 ? 'below' : rateGap > 0 ? 'above' : 'difference from'} average</strong><span>The leading category’s benchmark{data.rate > 0 ? ` is ${pct(Math.abs(rateGap), data.rate)} ${rateGap < 0 ? 'lower' : rateGap > 0 ? 'higher' : 'different'}.` : '.'}</span></p>}<p className="uw-footnote">Zero-based scale. Worksheet averages, not achieved rates or revenue forecasts.</p></section>
    </div>
    </>}
    {view === 'market' && <>
    <section className="uw-action-section"><div className="uw-section-heading"><div><p className="eyebrow">03 / MANAGEMENT AGENDA</p><h2>Turn the signals into action</h2></div><span className="uw-badge">Suggested actions · based on this snapshot</span></div><div className="uw-actions">{actions.map((item, i) => <article key={item.title}><span className="uw-action-number">0{i + 1}</span><h3>{item.title}</h3><b>{item.evidence}</b><p>{item.action}</p></article>)}</div></section>
    <section className="uw-panel"><div className="uw-section-heading"><div><p className="eyebrow">04 / CAPABILITY DEMAND</p><h2>Skills clients are requesting</h2><p className="uw-caption">All {data.skills.length} skills reported in the worksheet · mentions can overlap across jobs</p></div><div className="uw-controls"><input aria-label="Search Upwork skills" placeholder="Find a skill…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Sort Upwork skills" value={sort} onChange={(event) => setSort(event.target.value)}><option value="demand">Highest demand</option><option value="name">Alphabetical</option></select></div></div><div className="uw-skills"><Bars items={skills.slice(0, Math.ceil(skills.length / 2))} total={data.jobs} color="green" scale={Math.max(1, ...skills.map((item) => item.count))} /><Bars offset={Math.ceil(skills.length / 2)} items={skills.slice(Math.ceil(skills.length / 2))} total={data.jobs} color="green" scale={Math.max(1, ...skills.map((item) => item.count))} /></div>{!skills.length && <p className="empty">No skills match your search.</p>}<p className="uw-footnote">Percentages use {fmt(data.jobs)} analyzed jobs as the denominator. Skill counts are not additive.</p></section>
    <section className="uw-panel"><p className="eyebrow">05 / MARKET INTELLIGENCE</p><h2>What the posting text reveals</h2><p className="uw-caption">All {data.patterns.length} signals, as reported in the worksheet</p><div className="uw-signals">{data.patterns.map((signal, i) => <article key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{signal}</p></article>)}</div></section>
    <section className="uw-method"><h2>Reading this snapshot</h2>{data.notes.map((note, i) => <p key={i}>{note.replace(/^Note:\s*/i, '')}</p>)}<p>Rates are worksheet averages, not realized revenue or recommended pricing. No historical comparison is available in this view.</p></section>
    </>}
  </div>;
}




