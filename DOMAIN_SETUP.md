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

HTTPS status note from 2026-08-24 03:01 CEST: the root page returned `HTTP/2
200` over normal HTTPS with certificate validation enabled. Use the custom
domain for public promotion. Recheck with:

```bash
curl -sSIL https://gabs-utilities.com/
```

GitHub Pages certificate provisioning may take time after DNS or `CNAME`
changes; confirm that Pages reports the custom domain and HTTPS as active before
treating future DNS or domain changes as complete.
