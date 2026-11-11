// Print each job's and step's duration (seconds) from a GitHub jobs API JSON file.
import { readFileSync } from 'node:fs';
const secs = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 1000) : null);
for (const file of process.argv.slice(2)) {
  const { jobs } = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`== ${file}`);
  const starts = jobs.map((j) => Date.parse(j.started_at));
  const ends = jobs.map((j) => Date.parse(j.completed_at));
  const created = jobs.map((j) => Date.parse(j.created_at));
  console.log(`   wall (first created -> last completed): ${Math.round((Math.max(...ends) - Math.min(...created)) / 1000)} s`);
  for (const job of jobs) {
    console.log(`-- ${job.name}  [${job.conclusion}]  queued ${secs(job.created_at, job.started_at)} s, ran ${secs(job.started_at, job.completed_at)} s, runner ${job.runner_name}`);
    for (const step of job.steps) {
      console.log(`   ${String(secs(step.started_at, step.completed_at)).padStart(5)} s  ${step.number}. ${step.name}  [${step.conclusion}]`);
    }
  }
}
