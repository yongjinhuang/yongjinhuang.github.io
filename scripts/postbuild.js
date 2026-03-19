const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');

// 1. Create .nojekyll
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

// 2. Inject XSL stylesheet into sitemap.xml
const sitemapPath = path.join(outDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  fs.writeFileSync(
    sitemapPath,
    sitemap.replace(
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>'
    )
  );
}

// 3. Fix html lang attribute for non-English locales
const localeMap = { zh: 'zh' };
for (const [locale, lang] of Object.entries(localeMap)) {
  const htmlPath = path.join(outDir, `${locale}.html`);
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    fs.writeFileSync(
      htmlPath,
      html.replace('<html lang="en">', `<html lang="${lang}">`)
    );
  }
  // Also fix nested pages (e.g., zh/docs.html)
  const localeDir = path.join(outDir, locale);
  if (fs.existsSync(localeDir) && fs.statSync(localeDir).isDirectory()) {
    for (const file of fs.readdirSync(localeDir)) {
      if (file.endsWith('.html')) {
        const filePath = path.join(localeDir, file);
        const html = fs.readFileSync(filePath, 'utf8');
        fs.writeFileSync(
          filePath,
          html.replace('<html lang="en">', `<html lang="${lang}">`)
        );
      }
    }
  }
}

console.log('postbuild: .nojekyll, sitemap XSL, lang attributes done');
