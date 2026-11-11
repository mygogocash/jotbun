// A backend CI run's job times and wall time, for the receipt's "after" numbers.
//
//   node run-times.mjs <run-id>
//
// Reads the run's jobs with `gh api` (repo mygogocash/jotbun) and prints each job's queue and run
// seconds, and the wall time from the first job created to the last job completed.
import { spawnSync } from 'node:child_process';

const [run] = process.argv.slice(2);
if (!/^\d+$/.test(run ?? '')) {
  console.error('usage: node run-times.mjs <run-id>');
  process.exit(2);
}
const result = spawnSync('gh', ['api', `repos/mygogocash/jotbun/actions/runs/${run}/jobs?per_page=50`], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(1);
}
const { jobs } = JSON.parse(result.stdout);
const secs = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
for (const job of jobs) {
  console.log(`${String(secs(job.started_at, job.completed_at)).padStart(5)} s run, ${String(secs(job.created_at, job.started_at)).padStart(3)} s queued  ${job.conclusion}  ${job.name}`);
}
const wall = (Math.max(...jobs.map((job) => Date.parse(job.completed_at))) - Math.min(...jobs.map((job) => Date.parse(job.created_at)))) / 1000;
console.log(`wall ${Math.round(wall)} s over ${jobs.length} jobs`);
