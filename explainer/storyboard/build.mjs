import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storyboard } from './storyboard.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
await fs.writeFile(path.join(dir,'storyboard.json'),JSON.stringify(storyboard,null,2)+'\n');
console.log(`${storyboard.frames.length} beats, ${storyboard.durationSeconds} seconds, ${storyboard.portraitFrames.length} portrait states`);
