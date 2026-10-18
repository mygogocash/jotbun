// Test probe (parser-runner.spec): a parser that holds 192 MiB outside the
// JS heap for 3 seconds, then answers with a valid parse and its own peak.
const ballast = Buffer.alloc(192 * 1024 * 1024, 1);
setTimeout(() => {
  const usage = process.resourceUsage();
  const result = { ok: true, layout: 'generic', rows: [], file_issues: [], image: null, usage: { max_rss_kb: usage.maxRSS, cpu_ms: 1 } };
  process.stdout.write(JSON.stringify(ballast.length > 0 ? result : null));
}, 3_000);
