const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');

if (!fs.existsSync(outDir)) {
  console.warn('postbuild: out directory does not exist, skipping');
  process.exit(0);
}

// 1. Create .nojekyll
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

// 2. Inject XSL stylesheet into sitemap.xml (idempotent)
const sitemapPath = path.join(outDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes('sitemap.xsl')) {
    fs.writeFileSync(
      sitemapPath,
      sitemap.replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>'
      )
    );
  }
}

// 3. Recursively fix html lang attribute for non-English locales
function patchHtmlLangFile(filePath, lang) {
  const html = fs.readFileSync(filePath, 'utf8');
  const updated = html.replace('<html lang="en">', `<html lang="${lang}">`);
  if (updated !== html) {
    fs.writeFileSync(filePath, updated);
  }
}

function patchHtmlLangInDir(dirPath, lang) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      patchHtmlLangInDir(fullPath, lang);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      patchHtmlLangFile(fullPath, lang);
    }
  }
}

const localeMap = { zh: 'zh' };
for (const [locale, lang] of Object.entries(localeMap)) {
  const htmlPath = path.join(outDir, `${locale}.html`);
  if (fs.existsSync(htmlPath)) {
    patchHtmlLangFile(htmlPath, lang);
  }
  patchHtmlLangInDir(path.join(outDir, locale), lang);
}

console.log('postbuild: .nojekyll, sitemap XSL, lang attributes done');
