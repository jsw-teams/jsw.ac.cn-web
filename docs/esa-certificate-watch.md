# Alibaba Cloud International ESA certificate watch

This repository includes a daily GitHub Actions watchdog for **Alibaba Cloud International ESA** certificate issuance with **Cloudflare authoritative DNS** for DNS-01 validation.

## Defaults

- ESA region: `ap-southeast-1` (Singapore)
- ESA endpoint: `esa.ap-southeast-1.aliyuncs.com`
- ESA site: `jsw.ac.cn`
- Certificate SAN bundle: `jsw.ac.cn,*.jsw.ac.cn`
- Certificate type: `lets_encrypt`
- Fallback renewal threshold: 14 days before expiry
- Cloudflare zone: `jsw.ac.cn`
- ACME TXT TTL: 120 seconds
- Issuance wait window: 300 seconds
- Schedule: every day at 02:17 UTC (10:17 UTC+8)

Alibaba Cloud International ESA is responsible for checking and applying for certificates. Cloudflare remains the authoritative DNS provider and receives the `_acme-challenge` TXT records returned by ESA DCV.

The target is one Let's Encrypt certificate request containing both the apex domain and wildcard SAN:

```text
jsw.ac.cn
*.jsw.ac.cn
```

The wildcard SAN covers first-level subdomains such as `www.jsw.ac.cn`; `www.jsw.ac.cn` therefore does not need to be requested separately. Both the apex and wildcard DNS-01 validations use `_acme-challenge.jsw.ac.cn`. ESA may require multiple current TXT values at that same name, and the workflow preserves all values belonging to the current application.

## Let's Encrypt cleanup policy

For the configured domain bundle, this workflow treats the current Alibaba Cloud ESA Let's Encrypt application as the source of truth for DNS-01.

When renewal is required:

1. The workflow checks for a single usable ESA certificate that covers **both** `jsw.ac.cn` and `*.jsw.ac.cn`.
2. If no such combined certificate exists, or it is within the renewal threshold, the workflow requests the full bundle again rather than renewing only one SAN.
3. Before a fresh `lets_encrypt` request, stale TXT records at `_acme-challenge.jsw.ac.cn` are removed.
4. After ESA exposes DNS DCV, all TXT values required by the current ESA application are kept simultaneously.
5. Any other TXT value at the same challenge name is treated as stale/conflicting when `CLOUDFLARE_PURGE_CONFLICTING_ACME=true`.
6. TXT values created by this workflow are marked with the Cloudflare comment `github-esa-cert-watch`.
7. Once a combined certificate covering both SANs is confirmed as `Issued` or `OK`, workflow-managed ACME TXT values that are no longer active are deleted.
8. If issuance takes longer than the workflow wait window, current active challenge TXT values are retained for the next cron run.

The cleanup code refuses to modify TXT names outside the configured Cloudflare zone and refuses to modify names that do not begin with `_acme-challenge.`.

Because pre-existing TXT values at the configured challenge name are deliberately purged, do not run a second independent ACME client against `_acme-challenge.jsw.ac.cn` while this mode is enabled. If parallel ACME clients are required, set `CLOUDFLARE_PURGE_CONFLICTING_ACME=false`.

## Required GitHub Actions secrets

Create these repository secrets:

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `CLOUDFLARE_API_TOKEN`

Use Alibaba Cloud International credentials from the account that owns the ESA site.

Create the Cloudflare API Token with access only to the target zone when possible. It needs DNS read/write access because the workflow lists, creates and deletes TXT records. Do not use a Global API Key and do not store credentials in repository files or GitHub variables.

## Suggested Alibaba Cloud RAM actions

The Alibaba Cloud identity only needs the ESA operations used by the script:

- `esa:ListSites`
- `esa:ListCertificates`
- `esa:ApplyCertificate`

DNS changes are made through Cloudflare, not through ESA DNS APIs.

## Optional repository variables

- `ESA_SITE_ID` — optional; skips site-name lookup when set.
- `ESA_SITE_NAME` — default `jsw.ac.cn`.
- `ESA_DOMAINS` — comma-separated certificate SAN bundle; default `jsw.ac.cn,*.jsw.ac.cn`.
- `ESA_REGION_ID` — default `ap-southeast-1`.
- `ESA_ENDPOINT` — optional explicit International ESA endpoint.
- `ESA_RENEW_BEFORE_DAYS` — default `14`.
- `ESA_CERT_TYPE` — default `lets_encrypt`.
- `ESA_ISSUANCE_WAIT_SECONDS` — default `300`.
- `CLOUDFLARE_ZONE_ID` — optional. If omitted, the script resolves the active zone by name.
- `CLOUDFLARE_ZONE_NAME` — default `jsw.ac.cn`.
- `CLOUDFLARE_DCV_TTL` — default `120`.
- `CLOUDFLARE_PURGE_CONFLICTING_ACME` — default `true`.
- `CLOUDFLARE_CLEAN_AFTER_ISSUE` — default `true`.

## Manual test

After adding the three secrets, open **Actions → ESA certificate watch → Run workflow**.

The workflow runs Python in unbuffered mode, so certificate checks, DCV polling, Cloudflare TXT creation and cleanup appear in the Actions log immediately instead of looking stalled for several minutes.

A healthy renewal run should show this sequence:

1. Resolve the Alibaba Cloud International ESA site and Cloudflare zone.
2. Print `Certificate SAN bundle: jsw.ac.cn, *.jsw.ac.cn`.
3. Check whether one current certificate covers both SANs.
4. Remove stale `_acme-challenge.jsw.ac.cn` TXT values when renewal is actually required.
5. Call ESA `ApplyCertificate` with `jsw.ac.cn,*.jsw.ac.cn` and `lets_encrypt`.
6. Read ESA DCV and create the current TXT value or values in Cloudflare.
7. Poll ESA while printing progress every 10 seconds.
8. When one certificate covering both SANs becomes `Issued` or `OK`, remove temporary workflow-managed ACME TXT records.

If ESA is still validating when the five-minute wait ends, required current TXT values remain in Cloudflare and the next scheduled run continues monitoring.
