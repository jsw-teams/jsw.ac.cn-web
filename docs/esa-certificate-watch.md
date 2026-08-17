# Alibaba Cloud International ESA certificate watch

This repository includes a daily GitHub Actions watchdog for **Alibaba Cloud International ESA** certificate issuance with **Cloudflare authoritative DNS** for DNS-01 validation.

## Defaults

- ESA region: `ap-southeast-1` (Singapore)
- ESA endpoint: `esa.ap-southeast-1.aliyuncs.com`
- ESA site: `jsw.ac.cn`
- Certificate domain: `www.jsw.ac.cn`
- Certificate type: `lets_encrypt`
- Fallback renewal threshold: 14 days before expiry
- Cloudflare zone: `jsw.ac.cn`
- ACME TXT TTL: 120 seconds
- Issuance wait window: 300 seconds
- Schedule: every day at 02:17 UTC (10:17 UTC+8)

Alibaba Cloud International ESA is responsible for checking and applying for certificates. Cloudflare remains the authoritative DNS provider and receives the `_acme-challenge` TXT records returned by ESA DCV.

## Let's Encrypt cleanup policy

For the configured domains, this workflow treats the current Alibaba Cloud ESA Let's Encrypt application as the source of truth for DNS-01.

When renewal is required:

1. Before a fresh `lets_encrypt` request, TXT records at the exact `_acme-challenge.<domain>` name are removed so stale values do not accumulate.
2. After ESA exposes DNS DCV, all TXT values required by the current ESA application are kept. This supports the Let's Encrypt case where multiple current TXT values are required at the same challenge name.
3. Any other TXT value at that same `_acme-challenge` name is treated as stale/conflicting and removed when `CLOUDFLARE_PURGE_CONFLICTING_ACME=true`.
4. TXT values created by this workflow are marked with the Cloudflare comment `github-esa-cert-watch`.
5. Once the certificate is confirmed as `Issued` or `OK`, managed ACME TXT records that are no longer part of an active ESA challenge are deleted.
6. If issuance takes longer than the workflow wait window, current active challenge TXT records are retained. A later cron run rechecks ESA and removes them after the challenge is no longer active.

The cleanup code refuses to modify TXT names outside the configured Cloudflare zone and refuses to modify names that do not begin with `_acme-challenge.`.

Because pre-existing TXT values at the configured challenge names are deliberately purged, do not run a second independent ACME client against the same `_acme-challenge` names while this mode is enabled. If parallel ACME clients are required, set `CLOUDFLARE_PURGE_CONFLICTING_ACME=false`.

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

DNS changes are no longer made through ESA DNS APIs; Cloudflare handles authoritative DNS.

## Optional repository variables

- `ESA_SITE_ID` — optional; skips site-name lookup when set.
- `ESA_SITE_NAME` — default `jsw.ac.cn`.
- `ESA_DOMAINS` — comma-separated certificate domains; default `www.jsw.ac.cn`.
- `ESA_REGION_ID` — default `ap-southeast-1`.
- `ESA_ENDPOINT` — optional explicit International ESA endpoint.
- `ESA_RENEW_BEFORE_DAYS` — default `14`.
- `ESA_CERT_TYPE` — default `lets_encrypt`.
- `ESA_ISSUANCE_WAIT_SECONDS` — default `300`.
- `CLOUDFLARE_ZONE_ID` — optional. If omitted, the script resolves the active zone by name.
- `CLOUDFLARE_ZONE_NAME` — default `jsw.ac.cn`.
- `CLOUDFLARE_DCV_TTL` — default `120`.
- `CLOUDFLARE_PURGE_CONFLICTING_ACME` — default `true`; removes stale TXT values at the exact active Let's Encrypt challenge name and pre-cleans the configured challenge name before a fresh request.
- `CLOUDFLARE_CLEAN_AFTER_ISSUE` — default `true`; deletes workflow-managed ACME TXT records after ESA no longer reports them as active.

## Manual test

After adding the three secrets, open **Actions → ESA certificate watch → Run workflow**.

A healthy renewal run should show this sequence:

1. Existing certificate status and remaining validity are printed.
2. Stale `_acme-challenge` TXT values for a due domain are removed.
3. ESA `ApplyCertificate` is called with `lets_encrypt`.
4. ESA DCV TXT values are created in Cloudflare.
5. The workflow polls ESA for issuance.
6. After ESA reports the new certificate as `Issued` or `OK`, workflow-managed ACME TXT records are deleted.

If ESA is still validating when the five-minute wait ends, the required current TXT values remain in Cloudflare and the next scheduled run continues monitoring rather than deleting an active challenge.
