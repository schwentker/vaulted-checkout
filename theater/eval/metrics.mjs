import { realpathSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const columns = ['contradictions', 'order_errors', 'amount_errors', 'render_failures'];
export function combine(entries) {
  const rows = entries.map(({ iteration, checks }) => {
    if (!Number.isSafeInteger(iteration) || iteration < 0 || !checks || columns.some(column => !Number.isSafeInteger(checks[column]) || checks[column] < 0)) throw new Error('invalid_checks');
    const total = columns.reduce((sum, column) => sum + checks[column], 0);
    if (!Number.isSafeInteger(total) || checks.total_bad !== total || (checks.iteration !== undefined && checks.iteration !== iteration)) throw new Error('inconsistent_checks');
    return { iteration, ...Object.fromEntries(columns.map(column => [column, checks[column]])), total_bad: total };
  }).sort((a,b) => a.iteration-b.iteration);
  if (!rows.length || rows.some((row, index) => row.iteration !== index)) throw new Error('missing_or_duplicate_iteration');
  return rows;
}
async function main(args) {
  let iterations = resolve(ROOT, 'theater/iterations'), out = resolve(ROOT, 'theater/eval/results.json');
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i+1] || !['--iterations', '--out'].includes(args[i])) throw new Error('invalid_arguments');
    if (args[i] === '--iterations') iterations = resolve(args[i+1]); else out = resolve(args[i+1]);
  }
  const dirs = (await readdir(iterations, { withFileTypes:true })).filter(entry => entry.isDirectory() && /^(0|[1-9][0-9]*)$/.test(entry.name));
  const entries = await Promise.all(dirs.map(async entry => ({ iteration:Number(basename(entry.name)), checks:JSON.parse(await readFile(resolve(iterations, entry.name, 'checks.json'), 'utf8')) })));
  const rows = combine(entries);
  await mkdir(dirname(out), { recursive:true }); await writeFile(out, JSON.stringify(rows, null, 2)+'\n');
  process.stdout.write(JSON.stringify(rows, null, 2)+'\n');
}
const isMain = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  await main(process.argv.slice(2)).catch(() => { process.stderr.write('metrics: invalid or missing iteration evidence; results not updated\n'); process.exitCode = 1; });
}
