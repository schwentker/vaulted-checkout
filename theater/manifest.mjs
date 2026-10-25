// theater/manifest.json: every model input hash, output hash and mode, plus the
// frozen iteration 0 record. Hashes only; no prompt text, no keys.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const THEATER = fileURLToPath(new URL('.', import.meta.url));
export const ROOT = resolve(THEATER, '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const sha256File = async path => sha256(await readFile(path));

export async function loadManifest(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, iteration0: null, calls: [] }; throw error; }
}
export async function saveManifest(path, manifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
}
export async function recordCall(path, entry) {
  const manifest = await loadManifest(path);
  manifest.calls.push({ at: new Date().toISOString(), ...entry });
  await saveManifest(path, manifest);
}
