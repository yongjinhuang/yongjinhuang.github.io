<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <title>Sitemap — yongjinhuang.github.io</title>
        <meta name="robots" content="noindex,follow"/>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 40px 20px;
          }
          .container { max-width: 900px; margin: 0 auto; }
          h1 {
            font-size: 24px;
            font-weight: 700;
            color: #f59e0b;
            margin-bottom: 8px;
          }
          .subtitle {
            font-size: 14px;
            color: #94a3b8;
            margin-bottom: 32px;
          }
          .subtitle a { color: #f59e0b; text-decoration: none; }
          .subtitle a:hover { text-decoration: underline; }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #1e293b;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #334155;
          }
          th {
            background: #334155;
            text-align: left;
            padding: 12px 16px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #94a3b8;
          }
          td {
            padding: 12px 16px;
            font-size: 14px;
            border-top: 1px solid #334155;
          }
          tr:hover td { background: #263348; }
          td a {
            color: #60a5fa;
            text-decoration: none;
          }
          td a:hover { text-decoration: underline; }
          .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
          }
          .badge-high { background: #166534; color: #4ade80; }
          .badge-mid { background: #854d0e; color: #fbbf24; }
          .badge-low { background: #7f1d1d; color: #fca5a5; }
          .lang-tag {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            background: #1e293b;
            border: 1px solid #475569;
            color: #cbd5e1;
            margin-right: 4px;
          }
          .meta {
            font-size: 12px;
            color: #64748b;
            margin-top: 24px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Sitemap</h1>
          <p class="subtitle">
            <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> URLs ·
            <a href="https://yongjinhuang.github.io">yongjinhuang.github.io</a>
          </p>

          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Languages</th>
                <th>Priority</th>
                <th>Change Freq</th>
                <th>Last Modified</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a href="{sitemap:loc}">
                      <xsl:value-of select="sitemap:loc"/>
                    </a>
                  </td>
                  <td>
                    <xsl:for-each select="xhtml:link[@rel='alternate']">
                      <span class="lang-tag">
                        <xsl:value-of select="@hreflang"/>
                      </span>
                    </xsl:for-each>
                  </td>
                  <td>
                    <xsl:choose>
                      <xsl:when test="sitemap:priority &gt;= 0.8">
                        <span class="badge badge-high"><xsl:value-of select="sitemap:priority"/></span>
                      </xsl:when>
                      <xsl:when test="sitemap:priority &gt;= 0.5">
                        <span class="badge badge-mid"><xsl:value-of select="sitemap:priority"/></span>
                      </xsl:when>
                      <xsl:otherwise>
                        <span class="badge badge-low"><xsl:value-of select="sitemap:priority"/></span>
                      </xsl:otherwise>
                    </xsl:choose>
                  </td>
                  <td><xsl:value-of select="sitemap:changefreq"/></td>
                  <td><xsl:value-of select="substring(sitemap:lastmod, 1, 10)"/></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>

          <p class="meta">
            Generated by Next.js · Styled with XSL
          </p>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
