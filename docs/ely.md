# Ely's corner

`/ely` has a separate design from the portfolio. Only the entrance is public.
The three original HTML gifts and their card metadata are stored in
`public/ely/memories.enc.json`, encrypted using PBKDF2-SHA-256 (600,000 iterations)
and AES-256-GCM with random salt and IV. The browser decrypts the album after
password entry. Nothing is persisted in browser storage; refreshing or closing
the corner locks it again.

## Updating the collection

Keep source HTML and `.ely-private/manifest.json` in the ignored `.ely-private/`
directory. Each manifest entry has `id`, `date` (YYYY-MM-DD), `title`,
`description`, `label`, `kind` (`letter`, `light`, or `ninety`), and `file` (path
relative to the manifest). Dates describe the occasions being commemorated.
The original gifts retain their own content, including later additions.

The letter also uses local `topojson.min.js` (TopoJSON 3.0.2) and `land-110m.json`
(world-atlas 2). These are embedded during preparation. Original remote font
links are removed so the letter uses its existing system fallback fonts.

Set `ELY_PASSWORD` in the ignored `.env.ely.local`, then run:

```sh
node --env-file=.env.ely.local scripts/prepare-ely.mjs
npm run build
```

Never commit the password, manifest, originals, or decrypted output. Verify
the generated public bundle contains only encryption metadata and ciphertext.
The preparation script is intentionally separate from the standard build so
CI needs neither private source files nor the password.

## Privacy limits

This is encrypted static content, not server-side authentication. Anyone can
download the ciphertext and try passwords offline. A birthday-based password
can be guessed; there is no meaningful client-side rate limit. Changing the
password requires regenerating the bundle and does not revoke old downloaded
copies or versions preserved in Git history. Use a long unique passphrase if
stronger protection is needed.

Original pages run inside `sandbox="allow-scripts"` iframes without same-origin
access. Their CSP blocks external network requests. The route opts out of
search indexing and is absent from the sitemap and portfolio navigation.
