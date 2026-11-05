export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printArticleHtml(title: string, bodyHtml: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
      background: white;
      line-height: 1.6;
    }
    h1 { font-size: 24px; color: #111; margin-bottom: 16px; }
    h2 { font-size: 20px; color: #111; margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h3 { font-size: 17px; color: #111; margin-top: 20px; margin-bottom: 8px; }
    h4 { font-size: 15px; color: #111; margin-top: 16px; margin-bottom: 6px; }
    p { margin-bottom: 12px; font-size: 14px; }
    code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 13px; font-family: 'SFMono-Regular', Consolas, monospace; }
    pre { background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; overflow-x: auto; margin: 16px 0; font-size: 12px; line-height: 1.6; }
    pre code { background: none; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { background: #f3f4f6; padding: 8px 12px; text-align: left; border: 1px solid #e5e7eb; font-weight: 600; }
    td { padding: 8px 12px; border: 1px solid #e5e7eb; }
    ul, ol { padding-left: 24px; margin-bottom: 12px; font-size: 14px; }
    li { margin-bottom: 4px; }
    blockquote { border-left: 4px solid #d1d5db; padding: 8px 16px; margin: 16px 0; background: #f9fafb; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    strong { color: #111; }
    a { color: #2563eb; }
    img { max-width: 100%; }
    @media print {
      body { padding: 0; }
      pre { white-space: pre-wrap; word-break: break-all; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      h2, h3 { page-break-after: avoid; }
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);

  printWindow.document.close();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.print();
  };

  printWindow.addEventListener('load', triggerPrint, { once: true });
  setTimeout(triggerPrint, 500);
}
