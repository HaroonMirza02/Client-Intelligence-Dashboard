import { useState } from 'react';
import jobs from './upwork-jobs.json';

const currency = (value) => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
export default function JobDataset() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All');
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(1);
  const filtered = jobs.filter((job) => (type === 'All' || job['Job Type'] === type) && Object.values(job).join(' ').toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  const visible = filtered.slice(start, start + size);
  return <section className="job-dataset" aria-label="Imported Upwork jobs">
    <h3>Upwork jobs dataset</h3><p className="uw-caption">444 jobs · Imported Excel snapshot · upwork_jobs_dataset_clean_formatted.xlsx</p>
    <div className="job-toolbar"><input aria-label="Search job dataset" placeholder="Search titles, skills or descriptions…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><select aria-label="Filter job contract type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="All">All contract types</option>{[...new Set(jobs.map((job) => job['Job Type']))].map((value) => <option key={value}>{value}</option>)}</select><label>Rows per page <select aria-label="Jobs per page" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="table-wrap job-table-wrap"><table className="job-table"><thead><tr>{['#', 'Job title', 'Required skills', 'Contract', 'Hourly min', 'Hourly max', 'Fixed amount', 'Budget', 'Description', 'Job link'].map((name) => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{visible.map((job, index) => <tr key={`${current}-${size}-${index}`}><td data-label="Row">{start + index + 1}</td><td data-label="Job title" className="job-title">{job['Job Title'] || '—'}</td><td data-label="Required skills" className="job-skills">{job['Required Skills'] || '—'}</td><td data-label="Contract"><span className="status">{job['Job Type'] || '—'}</span></td><td data-label="Hourly min">{currency(job['Hourly Min'])}</td><td data-label="Hourly max">{currency(job['Hourly Max'])}</td><td data-label="Fixed amount">{currency(job['Fixed Amount'])}</td><td data-label="Budget">{job.Budget || '—'}</td><td data-label="Description" className="job-description">{job.Description ? <details><summary>Read description</summary><p>{job.Description}</p></details> : '—'}</td><td data-label="Job link">{/^https:\/\/([\w-]+\.)?upwork\.com\//i.test(job['Job URL'] || '') ? <a href={job['Job URL']} target="_blank" rel="noopener noreferrer">View job ↗</a> : job['Job URL'] || '—'}</td></tr>)}</tbody></table>{!visible.length && <p className="empty">No jobs match your filters.</p>}</div>
    <nav className="job-pagination" aria-label="Job dataset pagination"><span role="status">{filtered.length ? start + 1 : 0}–{Math.min(start + size, filtered.length)} of {filtered.length} jobs{filtered.length !== jobs.length ? ` (${jobs.length} total)` : ''}</span><div><button disabled={current === 1} onClick={() => setPage(1)} aria-label="First page">« First</button><button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><label>Page <select aria-label="Job dataset page" value={current} onChange={(event) => setPage(Number(event.target.value))}>{Array.from({ length: pages }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select> of {pages}</label><button disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button><button disabled={current === pages} onClick={() => setPage(pages)} aria-label="Last page">Last »</button></div></nav>
  </section>;
}

