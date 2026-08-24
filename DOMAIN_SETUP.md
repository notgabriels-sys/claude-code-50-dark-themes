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

After DNS propagates, confirm that GitHub Pages has HTTPS enabled for the custom domain.
