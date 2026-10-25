// Model layer for the Spend Theater loop: generate, critique, repair.
// MODE=api calls Gemini 4 Argon on the Interactions API; MODE=manual writes
// paste-ready packets for AI Studio and reads RESPONSE.txt back unedited.
//
// Interactions API shapes (read 2026-10-25):
//   https://ai.google.dev/api/interactions             POST /v1beta/interactions, body {model, input, system_instruction, generation_config}, response {id, status, steps[]}; text in steps[type=model_output].content[type=text].text
//   https://ai.google.dev/gemini-api/docs/interactions input may be an array of Content items ({type:"text", text})
//   https://ai.google.dev/gemini-api/docs/thinking     generation_config.thinking_level: minimal|low|medium|high
//   https://ai.google.dev/gemini-api/docs/video-understanding  video item {type:"video", data, mime_type} inline or {type:"video", uri, mime_type}; text after the video
//   https://ai.google.dev/gemini-api/docs/files        resumable upload to /upload/v1beta/files (X-Goog-Upload-* headers, x-goog-upload-url), poll GET /v1beta/<name> until state ACTIVE
// Deviation: @google/genai is not installed in this repo (no new deps), so this
// uses the same REST shapes over node:https, with a 20 minute timeout that
// global fetch cannot give (its headers timeout is 5 minutes).
// Never sent: temperature, top_p, top_k, thinking_budget, cached_content.
// The key is read from GEMINI_API_KEY at call time, sent only in x-goog-api-key, never logged or stored.
import http from 'node:http';
import https from 'node:https';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256, recordCall } from './manifest.mjs';
import { generatePrompt, critiquePrompt, repairPrompt, extractHtml, parseCritique } from './prompts.mjs';

export const INLINE_VIDEO_LIMIT = 15 * 1024 * 1024;
export const MANUAL_UPLOAD_LIMIT = 100 * 1024 * 1024;
const TIMEOUT_MS = 20 * 60 * 1000;
const THINKING = { generate: 'high', repair: 'high', critique: 'medium', 'critique-retry': 'medium' };

export class ManualPending extends Error {
  constructor(packet) { super(`manual_pending ${packet}`); this.packet = packet; }
}

function send(url, { method = 'POST', headers = {}, body } = {}) {
  const target = new URL(url);
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((ok, fail) => {
    const req = lib.request(target, { method, headers, timeout: TIMEOUT_MS }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', fail);
    });
    req.on('timeout', () => req.destroy(new Error('gemini_timeout')));
    req.on('error', error => fail(new Error(error.message === 'gemini_timeout' ? 'gemini_timeout' : 'gemini_unreachable')));
    if (body) req.write(body);
    req.end();
  });
}

export function responseText(value) {
  const texts = [];
  for (const step of Array.isArray(value?.steps) ? value.steps : []) {
    if (step?.type === 'thought') continue;
    if (typeof step?.text === 'string') texts.push(step.text);
    for (const item of Array.isArray(step?.content) ? step.content : []) if (item?.type === 'text' && typeof item.text === 'string') texts.push(item.text);
  }
  if (!texts.length) for (const item of Array.isArray(value?.outputs) ? value.outputs : []) if (item?.type === 'text' && typeof item.text === 'string') texts.push(item.text);
  if (!texts.length && typeof value?.output_text === 'string') texts.push(value.output_text);
  return texts.join('\n').trim();
}

function apiTransport(env) {
  const base = (env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const model = env.GEMINI_MODEL ?? 'gemini-4-argon';
  const key = () => { if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for --mode api'); return env.GEMINI_API_KEY; };
  async function upload(file) {
    // https://ai.google.dev/gemini-api/docs/files (resumable upload, then poll until ACTIVE)
    const uploadBase = base.replace(/\/v1beta$/, '/upload/v1beta');
    const start = await send(`${uploadBase}/files`, { headers: {
      'x-goog-api-key': key(), 'content-type': 'application/json', 'x-goog-upload-protocol': 'resumable', 'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(file.data.length), 'x-goog-upload-header-content-type': file.mime,
    }, body: JSON.stringify({ file: { display_name: file.name } }) });
    const url = start.headers['x-goog-upload-url'];
    if (start.status !== 200 || !url) throw new Error(`gemini_upload_http_${start.status}`);
    const done = await send(url, { headers: { 'content-length': String(file.data.length), 'x-goog-upload-offset': '0', 'x-goog-upload-command': 'upload, finalize' }, body: file.data });
    if (done.status !== 200) throw new Error(`gemini_upload_http_${done.status}`);
    let info = JSON.parse(done.body.toString('utf8')).file;
    for (let i = 0; info?.state !== 'ACTIVE'; i++) {
      if (info?.state === 'FAILED' || i > 120) throw new Error('gemini_file_not_active');
      await new Promise(r => setTimeout(r, 5000));
      const poll = await send(`${base}/${info.name}`, { method: 'GET', headers: { 'x-goog-api-key': key() } });
      if (poll.status !== 200) throw new Error(`gemini_file_http_${poll.status}`);
      info = JSON.parse(poll.body.toString('utf8'));
    }
    return { type: 'video', uri: info.uri, mime_type: file.mime };
  }
  return {
    model,
    async call({ step, prompt, files, thinking }) {
      const input = [];
      for (const file of files) {
        if (file.mime.startsWith('video/')) input.push(file.data.length <= INLINE_VIDEO_LIMIT ? { type: 'video', data: file.data.toString('base64'), mime_type: file.mime } : await upload(file));
      }
      for (const file of files) if (!file.mime.startsWith('video/')) input.push({ type: 'text', text: `--- ${file.name} ---\n${file.data.toString('utf8')}` });
      input.push({ type: 'text', text: prompt });
      const body = JSON.stringify({ model, input, generation_config: { thinking_level: thinking } });
      // High thinking can take minutes with no bytes back; say so instead of hanging silently.
      const started = Date.now();
      const beat = setInterval(() => process.stderr.write(`model: ${step} (${thinking} thinking) waiting, ${Math.round((Date.now() - started) / 1000)}s elapsed\n`), 15000);
      process.stderr.write(`model: ${step} request sent to ${new URL(base).host}, model ${model}, thinking ${thinking}\n`);
      let res;
      try { res = await send(`${base}/interactions`, { headers: { 'content-type': 'application/json', 'x-goog-api-key': key() }, body }); }
      finally { clearInterval(beat); }
      process.stderr.write(`model: ${step} answered HTTP ${res.status} after ${Math.round((Date.now() - started) / 1000)}s\n`);
      // Status only: error bodies are not printed.
      if (res.status !== 200) throw new Error(`gemini_http_${res.status}`);
      const raw = res.body.toString('utf8');
      let value; try { value = JSON.parse(raw); } catch { throw new Error('gemini_bad_response'); }
      if (value.status && value.status !== 'completed') throw new Error(`gemini_status_${value.status}`);
      return { raw, rawName: 'response.json', text: responseText(value) };
    },
  };
}

function packetPrompt(step, prompt, files, note) {
  const thinking = THINKING[step];
  return `# ${step}: paste this into AI Studio\n\nModel: Gemini 4 Argon. Thinking level: ${thinking}.\nAttach these files from this folder: ${files.map(f => f.name).join(', ')}.\n${note ? `\n${note}\n` : ''}\nThen paste everything between the lines below as the prompt. Save the model's answer verbatim, unedited, as RESPONSE.txt in this folder, then run:\n\n    node theater/ingest.mjs <iteration> ${step}\n\n----- PROMPT START -----\n${prompt}\n----- PROMPT END -----\n`;
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

function manualTransport({ packetsDir }) {
  return {
    model: 'gemini-4-argon (AI Studio, manual)',
    async call({ step, iteration, prompt, files }) {
      const dir = join(packetsDir, String(iteration), step);
      const response = join(dir, 'RESPONSE.txt');
      if (await exists(response)) {
        const raw = await readFile(response, 'utf8');
        return { raw, rawName: 'RESPONSE.txt', text: raw };
      }
      await mkdir(dir, { recursive: true });
      let note = '';
      for (const file of files) {
        if (file.path && file.mime.startsWith('video/') && file.data.length > MANUAL_UPLOAD_LIMIT) {
          const small = join(dir, 'render-720p.webm');
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file.path, '-vf', 'scale=1280:720', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', small]);
          note = 'render.webm is over the upload limit; attach render-720p.webm instead (same video, re-encoded at 720p).';
        }
        await writeFile(join(dir, file.name), file.data);
      }
      await writeFile(join(dir, 'PROMPT.md'), packetPrompt(step, prompt, files, note));
      throw new ManualPending(dir);
    },
  };
}

export function createModel({ mode, manifestPath, packetsDir, env = process.env, transport }) {
  if (!['api', 'manual'].includes(mode)) throw new Error('mode must be api or manual');
  const t = transport ?? (mode === 'api' ? apiTransport(env) : manualTransport({ packetsDir }));
  async function ask({ step, iteration, prompt, files, dir, run }) {
    const thinking = THINKING[step];
    const result = await t.call({ step, iteration, prompt, files, thinking });
    await mkdir(dir, { recursive: true });
    const rawFile = join(dir, `${step}.${result.rawName}`);
    await writeFile(rawFile, result.raw);
    await recordCall(manifestPath, {
      mode, run, step, iteration, model: t.model, thinking_level: thinking,
      prompt_sha256: sha256(prompt),
      inputs: Object.fromEntries(files.map(f => [f.name, sha256(f.data)])),
      output_sha256: sha256(result.raw), output_file: rawFile,
    });
    return { ...result, rawFile, prompt };
  }
  const file = (name, data, mime = 'text/plain', path) => ({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data), mime, path });
  return {
    mode,
    async generate({ spec, events, dir, run }) {
      const r = await ask({ step: 'generate', iteration: 0, prompt: generatePrompt(), files: [file('spec.md', spec), file('events.jsonl', events)], dir, run });
      return { html: extractHtml(r.text), ...r };
    },
    async critique({ spec, rubric, events, checks, videoPath, iteration, dir, run }) {
      const video = await readFile(videoPath);
      const files = [file('render.webm', video, 'video/webm', videoPath), file('spec.md', spec), file('rubric.md', rubric), file('events.jsonl', events), file('checks.json', checks)];
      const first = await ask({ step: 'critique', iteration, prompt: critiquePrompt(), files, dir, run });
      try { return { critique: parseCritique(first.text), retried: false, ...first }; }
      catch {
        // One retry on bad JSON, then fail.
        const second = await ask({ step: 'critique-retry', iteration, prompt: critiquePrompt({ retry: true }), files, dir, run });
        return { critique: parseCritique(second.text), retried: true, ...second };
      }
    },
    async repair({ scene, critique, checks, spec, iteration, dir, run }) {
      const r = await ask({ step: 'repair', iteration, prompt: repairPrompt(), files: [file('scene.html', scene), file('critique.json', critique), file('checks.json', checks), file('spec.md', spec)], dir, run });
      return { html: extractHtml(r.text), ...r };
    },
  };
}
