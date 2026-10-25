import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const frozenFiles = ['theater/eval/checks.mjs', 'theater/eval/rubric.md', 'theater/eval/metrics.mjs', 'contracts/events.schema.json'];
export async function verifyFrozen(root = ROOT) {
  try {
    const lines = (await readFile(resolve(root, 'theater/eval/FROZEN.sha256'), 'utf8')).trimEnd().split('\n');
    if (lines.length !== frozenFiles.length) return false;
    const found = new Map();
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);
      if (!match || !frozenFiles.includes(match[2]) || found.has(match[2])) return false;
      found.set(match[2], match[1]);
    }
    for (const file of frozenFiles) {
      const hash = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
      if (hash !== found.get(file)) return false;
    }
    return true;
  } catch { return false; }
}
const isMain = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const valid = await verifyFrozen();
  process.stdout.write(JSON.stringify({ frozen:valid })+'\n'); process.exitCode = valid ? 0 : 2;
}
