// Report formats: text for a terminal, Markdown for a pull request or job summary, JSON for other tools, CSV for a
// spreadsheet. Findings are listed in the order of the files read (the page, the manifest, the scripts, the workers),
// then by line. A finding names the file, the line and the thing it is about; the sentences of the sources that it quotes
// come with their addresses.

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

function countsLine(c) {
  return `${c.error} error, ${c.warning} warning, ${c.info} info`;
}

function gateLine(r) {
  return r.gate.pass ? `GATE: PASS (--fail-on ${r.gate.failOn})` : `GATE: FAIL - ${r.gate.reason}`;
}

function inputLine(r) {
  const parts = [`the page`, r.input.manifest ? 'the manifest' : 'no manifest', plural(r.input.scripts, 'script')];
  const workers = r.input.workers.length;
  parts.push(workers ? plural(workers, 'worker') : 'no worker');
  return `${plural(r.input.files.length, 'file')} (${parts.join(', ')})`;
}

const sectionOf = (m) => (m.section === m.page ? m.page : `${m.page}, ${m.section}`);

export function toText(r) {
  const lines = [`pwa-offline-check: ${r.page}`, `read: ${inputLine(r)}`, `findings: ${countsLine(r.counts)}`];
  if (!r.findings.length) lines.push('', 'no findings');
  for (const f of r.findings) {
    lines.push('', `${f.severity.toUpperCase().padEnd(7)}  ${f.id}  ${f.file}:${f.line}`);
    lines.push(`         about: ${f.subject}`);
    lines.push(`         ${f.message}`, `         fix: ${f.fix}`);
    for (const m of f.manual) lines.push(`         source (${sectionOf(m)}): "${m.quote}"`, `           ${m.url}`);
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`note: ${note}`);
  lines.push('', gateLine(r));
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes and pipes escaped, line breaks flattened, and <, > and & written as entities, so
// text from a file name or a manifest cannot break the table or be read as HTML.
export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r) {
  const lines = [`## pwa-offline-check: ${countsLine(r.counts)}`, '', `${mdCell(r.page)}, ${mdCell(inputLine(r))}.`];
  if (!r.findings.length) lines.push('', 'No findings.');
  else {
    lines.push('', '| Severity | Check | Where | About | Message | Fix | Source |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const f of r.findings) {
      const source = f.manual.map((m) => `[${mdCell(sectionOf(m))}](${m.url}): "${mdCell(m.quote)}"`).join('<br>');
      lines.push(`| ${f.severity} | ${mdCell(f.id)} | ${mdCell(`${f.file}:${f.line}`)} | ${mdCell(f.subject)} | ${mdCell(f.message)} | ${mdCell(f.fix)} | ${source || '-'} |`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`- ${mdCell(note)}`);
  lines.push('', r.gate.pass ? `**Gate passed** (--fail-on ${r.gate.failOn}).` : `**Gate failed:** ${mdCell(r.gate.reason)}.`);
  return lines.join('\n') + '\n';
}

export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}

// RFC 4180 quoting, and a leading quote on cells a spreadsheet would read as a formula.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per finding. source_section and source_url name the first sentence the finding quotes; the JSON report has all
// of them.
export function toCsv(r) {
  const rows = [['severity', 'id', 'file', 'line', 'about', 'message', 'fix', 'source_page', 'source_section', 'source_url']];
  for (const f of r.findings) {
    const m = f.manual[0];
    rows.push([f.severity, f.id, f.file, String(f.line), f.subject, f.message, f.fix, m ? m.page : '', m ? m.section : '', m ? m.url : '']);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
