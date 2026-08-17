# Alibaba Cloud International ESA certificate watch

This repository includes a daily GitHub Actions watchdog for the **Alibaba Cloud International** Edge Security Acceleration (ESA) service.

## Defaults

- Region: `ap-southeast-1` (Singapore)
- API endpoint: `esa.ap-southeast-1.aliyuncs.com`
- ESA site: `jsw.ac.cn`
- Certificate domain: `www.jsw.ac.cn`
- Certificate type: `lets_encrypt`
- Fallback renewal threshold: 14 days before expiry
- DNS DCV TXT TTL: 60 seconds
- Schedule: every day at 02:17 UTC (10:17 UTC+8)

The script first checks current certificates. It does not repeatedly request certificates while a usable certificate has more than the configured number of days remaining or while a certificate application is already in progress. When renewal is required it calls `ApplyCertificate`, then reconciles pending DNS DCV challenges into ESA DNS.

For TXT challenges, records created by this workflow are tagged with the comment `github-esa-cert-watch`. Existing TXT values that already satisfy the challenge are left unchanged. If a managed record already exists, only that managed record is updated; unrelated TXT records are not overwritten.

## Required GitHub Actions secrets

Create these repository secrets:

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`

Use credentials from the same Alibaba Cloud International account that owns the ESA site. Do not store AccessKey values in repository files or GitHub variables.

## Suggested RAM actions

Grant the automation identity only the ESA operations it uses:

- `esa:ListSites`
- `esa:ListCertificates`
- `esa:ApplyCertificate`
- `esa:ListRecords`
- `esa:CreateRecord`
- `esa:UpdateRecord`

Scope permissions to the target ESA site where the API supports resource-level authorization.

## Optional repository variables

The workflow works with the defaults above. These GitHub repository variables can override them:

- `ESA_SITE_ID` — optional; skips site-name lookup when set.
- `ESA_SITE_NAME` — default `jsw.ac.cn`.
- `ESA_DOMAINS` — comma-separated certificate domains; default `www.jsw.ac.cn`.
- `ESA_REGION_ID` — default `ap-southeast-1`.
- `ESA_RENEW_BEFORE_DAYS` — default `14`.
- `ESA_CERT_TYPE` — default `lets_encrypt`.
- `ESA_DCV_TTL` — default `60`.

If a non-default International ESA endpoint is required, set `ESA_ENDPOINT` in the workflow environment or script environment. When omitted, it is derived as `esa.<ESA_REGION_ID>.aliyuncs.com`.

## Manual test

After adding the two secrets, open **Actions → ESA certificate watch → Run workflow**. The same job also runs daily from cron.
