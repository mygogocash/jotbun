// Test probe (parser-runner.spec): a parser that exits cleanly with output
// that is not the protocol (as a compromised or broken child might), or with
// a failure status when asked to.
const mode = process.argv[2];
if (mode === 'xlsx') {
  process.exitCode = 3;
} else {
  process.stdout.write(
    mode === 'png'
      ? JSON.stringify({ ok: true, layout: 'generic', rows: [{ source_row_id: 'row:2', occurred_on: '2026-01-01', type: 'expense', amount_minor: '00100', wallet_label: null, category_label: null, merchant: null, note: null, issues: [] }], file_issues: [], image: null, usage: { max_rss_kb: 1, cpu_ms: 1 } })
      : '{"ok":true, "rows": [ not json',
  );
}
