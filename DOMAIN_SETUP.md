# Domain setup — gabs-utilities.com

This GitHub Pages shop is configured to use:

```text
gabs-utilities.com
```

## DNS records to set at the registrar

For the apex/root domain, add these `A` records:

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

Also add these `AAAA` records for IPv6:

| Type | Name | Value |
|---|---|---|
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |

For `www`, add:

| Type | Name | Value |
|---|---|---|
| CNAME | www | notgabriels-sys.github.io |

Do not add wildcard records such as `*.gabs-utilities.com`.

Current status: all four apex `A` records, all four apex `AAAA` records, and
the `www` CNAME were verified in public DNS on 2026-08-24. Keep the repository
root `CNAME` file set to `gabs-utilities.com`.

HTTPS status note from 2026-08-24 02:54 CEST: HTTP served the GitHub Pages site
successfully, but HTTPS returned a certificate-name mismatch for
`gabs-utilities.com`. Do not promote the custom domain until both of these pass
without certificate errors:

```bash
curl -sSIL https://gabs-utilities.com/
curl -sSIL https://gabs-utilities.com/audio-delivery-preflight-cli.html
```

GitHub Pages certificate provisioning may take time after DNS or `CNAME`
changes; confirm that Pages reports the custom domain and HTTPS as active before
treating setup as complete. Until then, use the working GitHub Pages URL for
public submissions and promotion.
