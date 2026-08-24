# Domain setup — gabs-utilities.com

This GitHub Pages shop is prepared to use:

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

Current status: DNS was checked on 2026-08-24 and `gabs-utilities.com`
did not resolve yet, so the repository should not contain `CNAME` until the
records above are live. Re-add the `CNAME` file only after DNS propagates, then
confirm that GitHub Pages has HTTPS enabled for the custom domain.
