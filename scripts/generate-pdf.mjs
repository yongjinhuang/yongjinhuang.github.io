import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { PUBLIC_DIR, LOCALES_DIR, SCHEMES } from './pdf/schemes.mjs';
import { buildResumeHtml } from './pdf/template.mjs';

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function downscaleRasterImages(page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      if (
        !img.src.startsWith('data:image/png') &&
        !img.src.startsWith('data:image/jpeg') &&
        !img.src.startsWith('data:image/webp')
      ) {
        continue;
      }
      await img.decode().catch(() => {});
      const targetW = Math.max((img.clientWidth || 68) * 4, 160);
      const targetH = Math.max((img.clientHeight || 68) * 4, 160);
      if (img.naturalWidth <= targetW) continue;
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);
        img.src = canvas.toDataURL('image/webp', 0.92);
      }
    }
  });
}

async function main() {
  const schemeArg = process.argv
    .find((a) => a.startsWith('--scheme='))
    ?.split('=')[1];
  const scheme = SCHEMES[schemeArg] || SCHEMES.amber;

  const executablePath = findChromeExecutable();
  const browser = await chromium.launch(
    executablePath ? { executablePath } : undefined
  );

  try {
    for (const locale of ['en', 'zh']) {
      const jsonPath = path.join(LOCALES_DIR, `${locale}.json`);
      const translations = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const html = buildResumeHtml(translations, locale, scheme);

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      await downscaleRasterImages(page);

      const outPath = path.join(PUBLIC_DIR, locale, 'resume.pdf');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await page.pdf({
        path: outPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });

      const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`Generated ${outPath} (${sizeKb} KB)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Failed to generate resume PDFs:', err);
  process.exit(1);
});
