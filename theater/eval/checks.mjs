import { realpathSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CATEGORIES = ['contradictions', 'order_errors', 'amount_errors', 'render_failures'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = () => ({ contradictions: 0, order_errors: 0, amount_errors: 0, render_failures: 0, total_bad: 0, issues: [] });
function issue(result, category, code, index) {
  result[category]++;
  result.issues.push({ category, code, ...(index === undefined ? {} : { index }) });
}
function finish(result) {
  result.total_bad = CATEGORIES.reduce((n, category) => n + result[category], 0);
  return result;
}
export function failure(code) {
  const result = empty(); issue(result, 'render_failures', code); return finish(result);
}
export async function validateEvents(events) {
  const schema = JSON.parse(await readFile(resolve(ROOT, 'contracts/events.schema.json'), 'utf8'));
  const validate = new AjvJsonSchemaValidator().getValidator(schema);
  if (!Array.isArray(events) || events.length === 0) return false;
  return events.every((event, index) => validate(event).valid && (index === 0 || event.t >= events[index - 1].t));
}
export async function readEvents(path) {
  const text = await readFile(path, 'utf8');
  const lines = text.trimEnd().split(/\r?\n/);
  const events = lines.map(line => JSON.parse(line));
  if (!await validateEvents(events)) throw new Error('invalid_events');
  return events;
}

// Chromium screenshots: non-interlaced, 8-bit RGB/RGBA PNG. No image dependency.
// Variance is over spatial luminance, so a uniform colored screen is still blank.
export function pixelVariance(png) {
  if (!Buffer.isBuffer(png) || png.length > 16 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('invalid_png');
  let width, height, channels, ended = false; const chunks = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > png.length) throw new Error('invalid_png');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      if (length !== 13 || data[8] !== 8 || ![2,6].includes(data[9]) || data[10] || data[11] || data[12]) throw new Error('unsupported_png');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') { ended = true; break; }
    offset += length + 12;
  }
  if (!ended || !width || !height || width * height > 4_000_000 || !chunks.length) throw new Error('invalid_png');
  const stride = width * channels, bytes = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  if (bytes.length !== (stride + 1) * height) throw new Error('invalid_png');
  let previous = Buffer.alloc(stride), sum = 0, square = 0;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride), offset = y * (stride + 1), filter = bytes[offset];
    if (filter > 4) throw new Error('invalid_png_filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a+b)/2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      row[x] = (bytes[offset + 1 + x] + predictor) & 255;
    }
    for (let x = 0; x < stride; x += channels) {
      const value = (54 * row[x] + 183 * row[x+1] + 19 * row[x+2]) / 256;
      sum += value; square += value * value;
    }
    previous = row;
  }
  const n = width * height;
  return { width, height, variance: Math.max(0, square/n - (sum/n)**2) };
}
function atomic(amount) {
  if (typeof amount !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amount) || amount.length > 80) return null;
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
const key = event => `${event.kind}\0${event.orderId ?? ''}`;
const role = name => typeof name === 'string' ? name.split(':')[0] : '';

function evaluateUnsafe(events, observation) {
  const result = empty();
  if (!Array.isArray(events) || !events.length || !object(observation)) return failure('invalid_input');
  const { duration, done, marks, snapshot } = observation;
  if (!finite(duration) || duration < 30 || duration > 45) issue(result, 'render_failures', 'duration_outside_30_45_seconds');
  if (done !== true) issue(result, 'render_failures', 'done_not_reached');
  if (!finite(observation.elapsedMs) || observation.elapsedMs < 30_000 || observation.elapsedMs > 45_000) issue(result, 'render_failures', 'measured_duration_outside_30_45_seconds');
  for (const field of ['consoleErrors', 'pageErrors']) {
    if (!Array.isArray(observation[field])) issue(result, 'render_failures', `missing_${field}`);
    else observation[field].forEach((_, i) => issue(result, 'render_failures', field, i));
  }
  if (observation.captureError) issue(result, 'render_failures', 'capture_failed');
  const frames = Array.isArray(observation.frames) ? observation.frames : [];
  if (frames.length !== 6) issue(result, 'render_failures', 'expected_six_frames');
  frames.forEach((frame, i) => {
    try {
      if (!object(frame) || typeof frame.pngBase64 !== 'string') throw new Error('invalid_frame');
      const pixels = pixelVariance(Buffer.from(frame.pngBase64, 'base64'));
      if (pixels.width !== 1280 || pixels.height !== 720) issue(result, 'render_failures', 'frame_size', i);
      if (pixels.variance < 4) issue(result, 'render_failures', 'blank_frame', i);
    } catch { issue(result, 'render_failures', 'invalid_frame', i); }
  });
  if (!Array.isArray(marks) || !object(snapshot) || !Array.isArray(snapshot.labels) || !Array.isArray(snapshot.elements)) {
    issue(result, 'render_failures', 'missing_scene_telemetry'); return finish(result);
  }
  const queues = new Map();
  events.forEach((event, index) => { const k = key(event); if (!queues.has(k)) queues.set(k, []); queues.get(k).push(index); });
  const matched = [], byEvent = new Map();
  marks.forEach((mark, index) => {
    if (!object(mark) || !finite(mark.t) || mark.t < 0 || mark.t > duration * 1000 || typeof mark.element !== 'string' || !mark.element) {
      issue(result, 'render_failures', 'invalid_mark', index); return;
    }
    const eventIndex = queues.get(key(mark))?.shift();
    if (eventIndex === undefined) { issue(result, 'order_errors', 'extra_mark', index); return; }
    const entry = { ...mark, eventIndex, markIndex: index };
    matched.push(entry); byEvent.set(eventIndex, entry);
  });
  events.forEach((_, index) => { if (!byEvent.has(index)) issue(result, 'order_errors', 'missing_mark', index); });
  // Each reversed pair counts once, even if both array order and timestamps reverse it.
  const eventOrdered = [...matched].sort((a,b) => a.eventIndex-b.eventIndex);
  for (let i = 0; i < eventOrdered.length; i++) for (let j = i+1; j < eventOrdered.length; j++) {
    if (eventOrdered[i].markIndex > eventOrdered[j].markIndex || eventOrdered[i].t > eventOrdered[j].t) issue(result, 'order_errors', 'reversed_event_pair', eventOrdered[j].eventIndex);
  }
  const orderIds = [...new Set(events.map(event => event.orderId).filter(Boolean))];
  function binding(item, time, name) {
    if (item.orderId !== undefined) return orderIds.includes(item.orderId) ? item.orderId : null;
    const named = typeof name === 'string' ? orderIds.filter(id => name === id || name.endsWith(`:${id}`)) : [];
    if (named.length === 1) return named[0];
    const embedded = typeof item.text === 'string' ? orderIds.filter(id => new RegExp(`(^|[^A-Za-z0-9_-])${id}($|[^A-Za-z0-9_-])`).test(item.text)) : [];
    if (embedded.length === 1) return embedded[0];
    const ids = [...new Set(matched.filter(mark => mark.t === time && mark.orderId).map(mark => mark.orderId))];
    return ids.length === 1 ? ids[0] : null;
  }
  const outcomes = id => events.filter(event => event.orderId === id);
  function eventTime(id, kind, name, time) {
    const candidates = matched.filter(mark => mark.orderId === id && (kind ? mark.kind === kind : role(mark.element) === role(name)));
    const exact = candidates.filter(mark => mark.t === time);
    if (exact.length === 1) return exact[0].t;
    return candidates.length === 1 ? candidates[0].t : null;
  }
  const seenAmounts = new Set(), seenTx = new Set();
  snapshot.elements.forEach((element, index) => {
    if (!object(element) || typeof element.name !== 'string' || !finite(element.visibleFrom) || element.visibleFrom < 0 || !finite(element.visibleTo) || element.visibleTo <= element.visibleFrom || element.visibleTo > duration * 1000) {
      issue(result, 'render_failures', 'invalid_element', index); return;
    }
    const name = role(element.name), id = binding(element, element.visibleFrom, element.name);
    const semantic = ['coin', 'settled', 'refusal'].includes(name);
    if (semantic && !id) { issue(result, 'render_failures', 'unbound_payment_element', index); return; }
    const order = outcomes(id), settled = order.some(event => event.kind === 'settled'), refused = order.some(event => event.kind === 'refused');
    if ((['coin','settled'].includes(name) && refused) || (name === 'refusal' && settled)) issue(result, 'contradictions', 'opposite_outcome_element', index);
    const kind = ['coin','settled'].includes(name) ? 'settled' : name === 'refusal' ? 'refused' : undefined;
    let expected = id ? eventTime(id, kind, element.name, element.visibleFrom) : null;
    if (!id && !semantic) {
      const candidates = matched.filter(mark => mark.element === element.name);
      if (candidates.length === 1) expected = candidates[0].t;
      // Static stations may be visible from zero. Other unbound arrivals fail closed.
      else if (element.visibleFrom === 0 && ['agent','spend','vault','merchant','chain','buyer'].includes(name)) return;
    }
    if (expected !== null && element.visibleFrom < expected) issue(result, 'order_errors', 'element_before_event', index);
    else if (semantic && !settled && !refused) issue(result, 'contradictions', 'unobserved_outcome_element', index);
    else if (expected === null && !(semantic && (settled || refused))) issue(result, 'render_failures', 'unbound_element_event', index);
  });
  snapshot.labels.forEach((label, index) => {
    if (!object(label) || typeof label.text !== 'string' || !finite(label.t) || label.t < 0 || label.t > duration * 1000) {
      issue(result, 'render_failures', 'invalid_label', index); return;
    }
    const text = label.text, id = binding(label, label.t), order = outcomes(id);
    const amountTokens = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*USDC\b/gi)].map(match => match[1]);
    const txTokens = text.match(/0x[0-9a-fA-F]+/g) ?? [];
    const paidLabel = /\b(settled|paid)\b/i.test(text), refusalLabel = /\b(refused|refusal|rejected|rule_[a-z_]+)\b/i.test(text);
    if ((amountTokens.length || txTokens.length || paidLabel || refusalLabel) && !id) { issue(result, 'render_failures', 'unbound_payment_label', index); return; }
    const settled = order.find(event => event.kind === 'settled'), refused = order.find(event => event.kind === 'refused');
    if ((paidLabel && refused) || (refusalLabel && settled)) issue(result, 'contradictions', 'opposite_outcome_label', index);
    if ((paidLabel && !settled && !refused) || (refusalLabel && !refused && !settled)) issue(result, 'contradictions', 'unobserved_outcome_label', index);
    for (const token of txTokens) {
      if (!settled || token.toLowerCase() !== settled.txHash.slice(0,10).toLowerCase()) issue(result, 'contradictions', 'tx_label_mismatch', index);
      if (settled) seenTx.add(id);
    }
    const amounts = [...new Set(order.filter(event => event.amount !== undefined).map(event => atomic(event.amount)))];
    for (const token of amountTokens) {
      if (amounts.length !== 1 || atomic(token) === null || atomic(token) !== amounts[0]) {
        issue(result, 'contradictions', 'amount_label_mismatch', index);
        issue(result, 'amount_errors', 'amount_label_mismatch', index);
      }
      seenAmounts.add(id);
    }
    const kind = paidLabel || txTokens.length ? 'settled' : refusalLabel ? 'refused' : undefined;
    if (kind) {
      const expected = eventTime(id, kind, '', label.t);
      if (expected !== null && label.t < expected) issue(result, 'order_errors', 'label_before_event', index);
    } else if (amountTokens.length) {
      const eventIndex = events.findIndex(event => event.orderId === id && event.amount !== undefined);
      const expected = byEvent.get(eventIndex)?.t;
      if (expected !== undefined && label.t < expected) issue(result, 'order_errors', 'amount_before_event', index);
    }
  });
  for (const id of new Set(events.filter(event => event.kind === 'settled').map(event => event.orderId))) {
    if (!seenAmounts.has(id)) issue(result, 'amount_errors', 'missing_settled_amount');
    if (!seenTx.has(id)) issue(result, 'contradictions', 'missing_settled_tx');
  }
  return finish(result);
}
// Bad scene data never throws to the caller and never yields a clean result.
export function evaluate(events, observation) {
  try { return evaluateUnsafe(events, observation); } catch { return failure('malformed_scene_data'); }
}

async function deadline(promise, ms = 5000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('capture_timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}

// Optional shared renderer. Argon may also capture the documented observation shape.
// https://playwright.dev/docs/library and https://playwright.dev/docs/clock
export async function captureScene(scene, { videoDir, clock = false } = {}) {
  const { chromium } = await import('playwright');
  const observation = { duration: null, elapsedMs: null, done: false, marks: [], snapshot: null, consoleErrors: [], pageErrors: [], frames: [] };
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width:1280, height:720 }, ...(videoDir ? { recordVideo: { dir:resolve(videoDir), size:{width:1280,height:720} } } : {}) });
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') observation.consoleErrors.push('console_error'); });
    page.on('pageerror', () => observation.pageErrors.push('page_error'));
    if (clock) { await page.clock.install(); await page.clock.pauseAt(new Date()); }
    await page.addInitScript(() => {
      const tick = () => {
        if (window.__theater && window.__evalStart === undefined) window.__evalStart = performance.now();
        if (window.__theater?.done && window.__evalDone === undefined) window.__evalDone = performance.now() - window.__evalStart;
        requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    });
    await page.goto(pathToFileURL(resolve(scene)).href, { waitUntil:'load', timeout:10_000 });
    if (clock) await page.clock.runFor(20);
    await page.waitForFunction(() => !!window.__theater, { }, { timeout:5000 });
    const declared = await deadline(page.evaluate(() => window.__theater.duration));
    const duration = finite(declared) && declared >= 30 && declared <= 45 ? declared : 30;
    const start = performance.now(); let advanced = 0;
    for (const fraction of [0.05,0.2,0.4,0.6,0.8,0.95]) {
      const target = duration * 1000 * fraction;
      if (clock) { await page.clock.fastForward(Math.max(0, target-advanced)); advanced = target; }
      else await new Promise(resolve => setTimeout(resolve, Math.max(0, target-(performance.now()-start))));
      observation.frames.push({ pngBase64:(await page.screenshot({ type:'png', timeout:5000 })).toString('base64') });
    }
    if (clock) await page.clock.fastForward(duration*1000 + 100 - advanced);
    await page.waitForFunction(() => window.__theater?.done === true, {}, { timeout:Math.max(1000, 46_000-(performance.now()-start)) }).catch(() => {});
    // Let the independent observer see done even if the scene sets it between frames.
    if (clock) await page.clock.runFor(20);
    const state = await deadline(page.evaluate(() => ({ duration:window.__theater.duration, done:window.__theater.done, marks:window.__theater.marks, snapshot:window.__theater.snapshot(), elapsedMs:window.__evalDone ?? null })));
    Object.assign(observation, state);
    if (videoDir) { const video = page.video(); await context.close(); await mkdir(videoDir, { recursive:true }); await video.saveAs(resolve(videoDir, 'render.webm')); }
  } catch { observation.captureError = true; }
  finally { await browser?.close().catch(() => {}); }
  return observation;
}

async function main(args) {
  const options = {}; let result;
  try {
    if (args.length === 2 && !args[0].startsWith('--')) { options.events = args[0]; options.observation = args[1]; }
    else for (let i = 0; i < args.length; i += 2) {
      if (!['--events','--observation','--scene','--out'].includes(args[i]) || !args[i+1]) throw new Error('invalid_arguments');
      options[args[i].slice(2)] = args[i+1];
    }
    if (!options.events || Boolean(options.scene) === Boolean(options.observation)) throw new Error('invalid_arguments');
    const events = await readEvents(options.events);
    const observation = options.scene ? await captureScene(options.scene) : JSON.parse(await readFile(options.observation, 'utf8'));
    result = evaluate(events, observation);
  } catch { result = failure('input_or_capture_failed'); }
  if (options.out) {
    try { await mkdir(dirname(resolve(options.out)), { recursive:true }); await writeFile(options.out, JSON.stringify(result, null, 2)+'\n'); }
    catch { result = failure('output_write_failed'); }
  }
  return result;
}
const isMain = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const result = await main(process.argv.slice(2)).catch(() => failure('evaluation_failed'));
  process.stdout.write(JSON.stringify(result, null, 2)+'\n');
  process.exitCode = 0;
}
