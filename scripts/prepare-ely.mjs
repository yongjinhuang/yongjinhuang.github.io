// The input manifest, source HTML, and password must stay outside Git.
// Usage: node --env-file=.env.ely.local scripts/prepare-ely.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const password = process.env.ELY_PASSWORD;
if (!password)
  throw new Error('Set ELY_PASSWORD in the ignored .env.ely.local file.');
const source = resolve(process.argv[2] || '.ely-private/manifest.json');
const manifest = JSON.parse(await readFile(source, 'utf8'));
const memories = [];

for (const entry of manifest.memories) {
  const { file, ...metadata } = entry;
  let html = await readFile(resolve(dirname(source), file), 'utf8');

  // Bundle the old letter's public dependencies locally. The resulting reader
  // never needs to contact font or map CDNs while private content is open.
  if (entry.kind === 'letter') {
    const topo = await readFile(
      resolve(dirname(source), 'topojson.min.js'),
      'utf8'
    );
    const land = await readFile(
      resolve(dirname(source), 'land-110m.json'),
      'utf8'
    );
    html = html.replace(/<link\b[^>]*https:\/\/fonts\.[^>]*>/g, '');
    html = html.replace(
      /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/topojson\/3\.0\.2\/topojson\.min\.js"><\/script>/,
      () => `<script>${topo}</script>`
    );
    const landUrl = `data:application/json;base64,${Buffer.from(land).toString('base64')}`;
    html = html.replace(
      /https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/world-atlas@2\/land-110m\.json/g,
      () => landUrl
    );
    // Make the original click-only envelope keyboard accessible.
    html = html.replace(
      'class="envelope" id="envelope"',
      'class="envelope" id="envelope" role="button" tabindex="0" aria-label="Open your letter"'
    );
    html = html.replace(
      'envelope.addEventListener("click", open);',
      'envelope.addEventListener("click", open); envelope.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });'
    );
  }

  // Each original runs in an opaque-origin sandbox. CSP also prevents outgoing
  // requests, form submissions, and nested embeds from these self-contained pages.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src data:; form-action 'none'; base-uri 'none';"><meta name="referrer" content="no-referrer">`;
  html = html.replace(/<head[^>]*>/i, (head) => head + policy);
  memories.push({ ...metadata, html });
}

const iterations = 600000;
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([
  cipher.update(JSON.stringify({ memories }), 'utf8'),
  cipher.final(),
  cipher.getAuthTag(),
]);
const target = resolve('public/ely/memories.enc.json');
await mkdir(dirname(target), { recursive: true });
await writeFile(
  target,
  JSON.stringify({
    version: 1,
    iterations,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  })
);
console.log(`Prepared ${memories.length} encrypted memories.`);
