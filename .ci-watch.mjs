const H = { 'User-Agent': 'dsh' };
const api = 'https://api.github.com/repos/fingtest6/ProjectNote';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => { const r = await fetch(u, { headers: H }); return r.ok ? r.json() : null; };

const HEAD = '9c76745';
const runs = await getJson(`${api}/actions/runs?per_page=5`);
const run = (runs?.workflow_runs || []).find((r) => r.head_sha.startsWith(HEAD));
if (!run) { console.log('run for', HEAD, 'not found yet'); process.exit(0); }
console.log(`run #${run.run_number} (${run.head_sha.slice(0,7)}) status=${run.status}`);

for (let i = 0; i < 20; i += 1) {
  const data = await getJson(`${api}/actions/runs/${run.id}/jobs`);
  const jobs = data?.jobs || [];
  const line = jobs.map((j) => `${j.name}=${j.status === 'completed' ? j.conclusion : j.status}`).join(' | ');
  console.log(`[${new Date().toLocaleTimeString()}] ${line || 'no jobs yet'}`);
  if (jobs.length >= 4 && jobs.every((j) => j.status === 'completed')) {
    console.log('--- final ---');
    for (const j of jobs) {
      console.log(`${j.name}: ${j.conclusion}`);
      if (j.conclusion !== 'success') {
        for (const s of j.steps || []) {
          if (s.conclusion && s.conclusion !== 'success' && s.conclusion !== 'skipped') console.log(`  step failed: ${s.name} (${s.conclusion})`);
        }
      }
    }
    break;
  }
  await sleep(30000);
}
