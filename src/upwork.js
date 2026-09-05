const text = (value) => String(value ?? '').trim();
export function number(value) {
  const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
export function parseUpwork({ rows = [], cols = [] }) {
  const find = (label) => rows.find((row) => text(row[0]).toLowerCase() === label.toLowerCase()) || [];
  const skillsAt = rows.findIndex((row) => row.some((cell) => /TOP\s+\d+\s+SKILLS REQUESTED/i.test(text(cell))));
  const skillCol = skillsAt >= 0 ? rows[skillsAt].findIndex((cell) => /SKILLS REQUESTED/i.test(text(cell))) : -1;
  const skills = skillsAt < 0 ? [] : rows.slice(skillsAt + 1).map((row) => ({ name: text(row[skillCol]), count: number(row[skillCol + 1]) })).filter((item) => item.name && item.count !== null);
  const contracts = ['Hourly', 'Fixed'].map((name) => {
    for (const row of rows) {
      const index = row.findIndex((cell) => text(cell).toLowerCase() === name.toLowerCase());
      if (index >= 0) return { name: name === 'Fixed' ? 'Fixed price' : name, count: number(row[index + 1]) };
    }
    return { name, count: null };
  });
  const patterns = rows.flatMap((row) => row.filter((cell) => /^\s*•/.test(text(cell))).map((cell) => text(cell).replace(/^•\s*/, '')));
  return {
    jobs: number(find('Jobs Analyzed:')[1]), week: text(find('Week Ending:')[1]),
    categories: rows.filter((row) => /^\d+$/.test(text(row[0])) && text(row[1]) && number(row[2]) !== null).map((row) => ({ name: text(row[1]), count: number(row[2]) })),
    rate: number(find('Across all hourly jobs:')[2]), categoryRate: number(find('Top category avg rate:')[2]), rateCategory: text(find('Top category avg rate:')[1]),
    contracts, skills, patterns,
    notes: rows.flat().filter((cell) => /^Note:/i.test(text(cell))).map(text),
    sourceRows: rows.filter((row) => row.some((cell) => text(cell))), cols,
  };
}
