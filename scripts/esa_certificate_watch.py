#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any
from urllib import error, parse, request

from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_esa20240910.client import Client as EsaClient
from alibabacloud_esa20240910 import models as esa_models

MANAGED_COMMENT = "github-esa-cert-watch"
REGION_ID = os.getenv("ESA_REGION_ID", "ap-southeast-1").strip() or "ap-southeast-1"
ENDPOINT = os.getenv("ESA_ENDPOINT", "").strip() or f"esa.{REGION_ID}.aliyuncs.com"
SITE_NAME = os.getenv("ESA_SITE_NAME", "jsw.ac.cn").strip() or "jsw.ac.cn"
SITE_ID_ENV = os.getenv("ESA_SITE_ID", "").strip()
DOMAINS = [
    value.strip().lower().rstrip(".")
    for value in os.getenv("ESA_DOMAINS", "jsw.ac.cn,*.jsw.ac.cn").split(",")
    if value.strip()
]
RENEW_BEFORE_DAYS = int(os.getenv("ESA_RENEW_BEFORE_DAYS", "14"))
CERT_TYPE = os.getenv("ESA_CERT_TYPE", "lets_encrypt").strip() or "lets_encrypt"
ISSUANCE_WAIT_SECONDS = int(os.getenv("ESA_ISSUANCE_WAIT_SECONDS", "300"))

CF_API_BASE = "https://api.cloudflare.com/client/v4"
CF_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
CF_ZONE_ID_ENV = os.getenv("CLOUDFLARE_ZONE_ID", "").strip()
CF_ZONE_NAME = (
    os.getenv("CLOUDFLARE_ZONE_NAME", SITE_NAME).strip().lower().rstrip(".")
    or SITE_NAME.lower().rstrip(".")
)
CF_DCV_TTL = int(os.getenv("CLOUDFLARE_DCV_TTL", "120"))


def log(message: str) -> None:
    print(message, flush=True)


def env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


CF_PURGE_CONFLICTING_ACME = env_flag("CLOUDFLARE_PURGE_CONFLICTING_ACME", True)
CF_CLEAN_AFTER_ISSUE = env_flag("CLOUDFLARE_CLEAN_AFTER_ISSUE", True)


def body_map(response: Any) -> dict[str, Any]:
    body = getattr(response, "body", None)
    if body is None:
        return {}
    return body.to_map() if hasattr(body, "to_map") else dict(body)


def build_esa_client() -> EsaClient:
    access_key_id = os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID", "").strip()
    access_key_secret = os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "").strip()
    if not access_key_id or not access_key_secret:
        raise RuntimeError(
            "Missing ALIBABA_CLOUD_ACCESS_KEY_ID or ALIBABA_CLOUD_ACCESS_KEY_SECRET"
        )
    return EsaClient(
        open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret,
            region_id=REGION_ID,
            endpoint=ENDPOINT,
        )
    )


def cf_request(
    method: str,
    path: str,
    *,
    query: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    if not CF_TOKEN:
        raise RuntimeError("Missing CLOUDFLARE_API_TOKEN")

    url = CF_API_BASE + path
    if query:
        url += "?" + parse.urlencode(query)

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {CF_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "siteforge-inkstone-theme/esa-certificate-watch",
        },
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = raw
        raise RuntimeError(
            f"Cloudflare API {method} {path} failed with HTTP {exc.code}: {detail}"
        ) from exc
    except error.URLError as exc:
        raise RuntimeError(f"Cloudflare API {method} {path} failed: {exc}") from exc

    if not result.get("success", False):
        raise RuntimeError(
            f"Cloudflare API {method} {path} failed: {result.get('errors') or result}"
        )
    return result.get("result")


def resolve_cloudflare_zone_id() -> str:
    if CF_ZONE_ID_ENV:
        return CF_ZONE_ID_ENV

    zones = cf_request(
        "GET",
        "/zones",
        query={"name": CF_ZONE_NAME, "status": "active", "per_page": 50},
    ) or []
    exact = [
        zone
        for zone in zones
        if str(zone.get("name") or "").lower().rstrip(".") == CF_ZONE_NAME
    ]
    if len(exact) != 1:
        raise RuntimeError(
            f"Expected exactly one active Cloudflare zone named {CF_ZONE_NAME}, found {len(exact)}"
        )
    return str(exact[0]["id"])


def resolve_site_id(client: EsaClient) -> int:
    if SITE_ID_ENV:
        return int(SITE_ID_ENV)

    response = client.list_sites(
        esa_models.ListSitesRequest(
            site_name=SITE_NAME,
            site_search_type="exact",
            page_number=1,
            page_size=20,
        )
    )
    sites = body_map(response).get("Sites") or []
    for site in sites:
        if (
            str(site.get("SiteName", "")).lower().rstrip(".")
            == SITE_NAME.lower().rstrip(".")
        ):
            return int(site["SiteId"])
    raise RuntimeError(f"ESA site not found: {SITE_NAME}")


def list_certificates(client: EsaClient, site_id: int) -> list[dict[str, Any]]:
    response = client.list_certificates(
        esa_models.ListCertificatesRequest(
            site_id=site_id,
            page_number=1,
            page_size=500,
            valid_only=False,
        )
    )
    return body_map(response).get("Result") or []


def cert_names(cert: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for key in ("CommonName", "SAN", "Name"):
        raw = str(cert.get(key) or "")
        for value in raw.replace(";", ",").split(","):
            value = value.strip().lower().rstrip(".")
            if value:
                names.add(value)
    return names


def cert_covers_target(cert: dict[str, Any], target: str) -> bool:
    target = target.lower().rstrip(".")
    names = cert_names(cert)
    if target.startswith("*."):
        return target in names
    return target in names or any(
        name.startswith("*.")
        and target.endswith("." + name[2:])
        and target.count(".") == name[2:].count(".") + 1
        for name in names
    )


def cert_covers_bundle(cert: dict[str, Any]) -> bool:
    return all(cert_covers_target(cert, domain) for domain in DOMAINS)


def parse_not_after(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
    ):
        try:
            parsed = datetime.strptime(text, fmt)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def days_left(cert: dict[str, Any]) -> float | None:
    expiry = parse_not_after(cert.get("NotAfter"))
    if not expiry:
        return None
    return (expiry - datetime.now(timezone.utc)).total_seconds() / 86400


def validate_dcv_name(record_name: str) -> str:
    name = record_name.lower().rstrip(".")
    if name != CF_ZONE_NAME and not name.endswith("." + CF_ZONE_NAME):
        raise RuntimeError(
            f"Refusing to modify Cloudflare DNS outside zone {CF_ZONE_NAME}: {record_name}"
        )
    if not name.startswith("_acme-challenge."):
        raise RuntimeError(f"Refusing to modify non-ACME TXT record: {record_name}")
    return name


def challenge_name_for_domain(domain: str) -> str:
    clean = domain.lower().rstrip(".")
    if clean.startswith("*."):
        clean = clean[2:]
    return validate_dcv_name(f"_acme-challenge.{clean}")


def challenge_names_for_bundle() -> set[str]:
    return {challenge_name_for_domain(domain) for domain in DOMAINS}


def list_cloudflare_txt(zone_id: str, record_name: str) -> list[dict[str, Any]]:
    result = cf_request(
        "GET",
        f"/zones/{zone_id}/dns_records",
        query={"type": "TXT", "name.exact": record_name, "per_page": 100},
    )
    return result or []


def delete_cloudflare_record(
    zone_id: str, record: dict[str, Any], reason: str
) -> None:
    record_id = str(record.get("id") or "")
    if not record_id:
        raise RuntimeError(f"Cloudflare record missing id: {record}")
    cf_request("DELETE", f"/zones/{zone_id}/dns_records/{record_id}")
    log(f"Deleted Cloudflare TXT {record.get('name')} ({reason})")


def purge_challenge_name(
    zone_id: str, record_name: str, keep_values: set[str] | None = None
) -> None:
    record_name = validate_dcv_name(record_name)
    keep_values = keep_values or set()
    for record in list_cloudflare_txt(zone_id, record_name):
        content = str(record.get("content") or "")
        if content in keep_values:
            continue
        delete_cloudflare_record(
            zone_id,
            record,
            "stale/conflicting Let's Encrypt ACME value",
        )


def active_esa_dns_challenges(
    certificates: list[dict[str, Any]],
) -> dict[str, set[str]]:
    active: dict[str, set[str]] = {}
    for cert in certificates:
        if str(cert.get("Status") or "") != "Applying":
            continue
        for dcv in cert.get("DCV") or []:
            if str(dcv.get("Type") or "").upper() != "DNS":
                continue
            if str(dcv.get("Status") or "").lower() in {
                "success",
                "verified",
                "ok",
                "passed",
            }:
                continue
            key = str(dcv.get("Key") or "").strip().rstrip(".")
            value = str(dcv.get("Value") or "").strip()
            if not key or not value:
                continue
            key = validate_dcv_name(key)
            active.setdefault(key, set()).add(value)
    return active


def ensure_cloudflare_txt(zone_id: str, record_name: str, value: str) -> None:
    record_name = validate_dcv_name(record_name)
    records = list_cloudflare_txt(zone_id, record_name)
    if any(str(record.get("content") or "") == value for record in records):
        log(f"Cloudflare DCV TXT already present: {record_name}")
        return

    cf_request(
        "POST",
        f"/zones/{zone_id}/dns_records",
        payload={
            "type": "TXT",
            "name": record_name,
            "content": value,
            "ttl": CF_DCV_TTL,
            "comment": MANAGED_COMMENT,
        },
    )
    log(f"Created Cloudflare DCV TXT: {record_name}")


def reconcile_dcv(
    certificates: list[dict[str, Any]], zone_id: str
) -> dict[str, set[str]]:
    active = active_esa_dns_challenges(certificates)
    for key, values in active.items():
        if CERT_TYPE == "lets_encrypt" and CF_PURGE_CONFLICTING_ACME:
            purge_challenge_name(zone_id, key, keep_values=values)
        for value in values:
            ensure_cloudflare_txt(zone_id, key, value)
    return active


def list_managed_cloudflare_txt(zone_id: str) -> list[dict[str, Any]]:
    result = cf_request(
        "GET",
        f"/zones/{zone_id}/dns_records",
        query={"type": "TXT", "comment.exact": MANAGED_COMMENT, "per_page": 500},
    )
    return result or []


def cleanup_orphaned_managed_txt(
    zone_id: str, active: dict[str, set[str]]
) -> None:
    if not CF_CLEAN_AFTER_ISSUE:
        return
    for record in list_managed_cloudflare_txt(zone_id):
        name = str(record.get("name") or "").lower().rstrip(".")
        if name not in challenge_names_for_bundle():
            continue
        content = str(record.get("content") or "")
        if content in active.get(name, set()):
            continue
        delete_cloudflare_record(
            zone_id, record, "ACME challenge no longer active"
        )


def preclean_bundle(zone_id: str) -> None:
    if CERT_TYPE != "lets_encrypt" or not CF_PURGE_CONFLICTING_ACME:
        return
    for record_name in challenge_names_for_bundle():
        purge_challenge_name(zone_id, record_name)


def newest_usable_bundle(
    certificates: list[dict[str, Any]],
) -> dict[str, Any] | None:
    usable = [
        cert
        for cert in certificates
        if cert_covers_bundle(cert)
        and str(cert.get("Status") or "") in {"OK", "Issued", "Expiring"}
    ]
    if not usable:
        return None
    usable.sort(
        key=lambda cert: parse_not_after(cert.get("NotAfter"))
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return usable[0]


def renewal_required(certificates: list[dict[str, Any]]) -> bool:
    applying_related = [
        cert
        for cert in certificates
        if str(cert.get("Status") or "") == "Applying"
        and any(cert_covers_target(cert, domain) for domain in DOMAINS)
    ]
    if applying_related:
        log("An apex/wildcard certificate application is already in progress; no duplicate request will be created.")
        return False

    best = newest_usable_bundle(certificates)
    if best is None:
        log(
            "No single usable certificate covers both jsw.ac.cn and *.jsw.ac.cn; renewal is required."
        )
        return True

    remaining = days_left(best)
    status = str(best.get("Status") or "")
    cert_id = best.get("Id")
    if remaining is None:
        if status == "Expiring":
            log(
                f"Combined certificate {cert_id} is Expiring and has no parsable expiry time; renewal is required."
            )
            return True
        log(
            f"Combined certificate {cert_id} status={status}; expiry timestamp unavailable, leaving unchanged."
        )
        return False

    log(
        f"Combined certificate {cert_id} status={status}, {remaining:.1f} days remaining."
    )
    return remaining <= RENEW_BEFORE_DAYS


def apply_bundle_certificate(client: EsaClient, site_id: int) -> None:
    response = client.apply_certificate(
        esa_models.ApplyCertificateRequest(
            site_id=site_id,
            domains=",".join(DOMAINS),
            type=CERT_TYPE,
        )
    )
    result = body_map(response).get("Result") or []
    log("Requested one Let's Encrypt bundle for: " + ", ".join(DOMAINS))
    for item in result:
        log(
            f"  ESA result domain={item.get('Domain')} id={item.get('Id')} status={item.get('Status')}"
        )


def bundle_issued(certificates: list[dict[str, Any]]) -> bool:
    best = newest_usable_bundle(certificates)
    if best is None:
        return False
    remaining = days_left(best)
    return remaining is None or remaining > RENEW_BEFORE_DAYS


def wait_for_issuance(client: EsaClient, site_id: int, zone_id: str) -> None:
    deadline = time.monotonic() + max(0, ISSUANCE_WAIT_SECONDS)
    attempt = 0

    while True:
        attempt += 1
        certificates = list_certificates(client, site_id)
        active = reconcile_dcv(certificates, zone_id)
        cleanup_orphaned_managed_txt(zone_id, active)

        if active:
            summary = ", ".join(
                f"{name}({len(values)} TXT)"
                for name, values in sorted(active.items())
            )
            log(f"DCV active: {summary}")
        else:
            log(
                f"Waiting for ESA DCV/issuance (poll {attempt}); no active DNS challenge exposed yet."
            )

        if bundle_issued(certificates):
            log(
                "Combined jsw.ac.cn + *.jsw.ac.cn certificate is Issued/OK; cleaning temporary ACME TXT."
            )
            cleanup_orphaned_managed_txt(zone_id, {})
            return

        if time.monotonic() >= deadline:
            if active:
                log(
                    "Issuance wait window ended; active ACME TXT is retained for the next cron run."
                )
            else:
                log(
                    "Issuance wait window ended before ESA exposed an active DNS challenge. No TXT was deleted."
                )
            return

        time.sleep(10)


def main() -> int:
    if DOMAINS != ["jsw.ac.cn", "*.jsw.ac.cn"]:
        log("Configured ESA_DOMAINS: " + ", ".join(DOMAINS))
    if not DOMAINS:
        raise RuntimeError("ESA_DOMAINS is empty")
    if not CF_TOKEN:
        raise RuntimeError("Missing CLOUDFLARE_API_TOKEN")
    if CERT_TYPE != "lets_encrypt":
        log(
            f"Warning: ESA_CERT_TYPE={CERT_TYPE}; aggressive ACME cleanup is intended for lets_encrypt."
        )

    esa_client = build_esa_client()
    site_id = resolve_site_id(esa_client)
    zone_id = resolve_cloudflare_zone_id()

    log(f"Alibaba Cloud International ESA endpoint: {ENDPOINT}")
    log(f"ESA site: {SITE_NAME} ({site_id})")
    log("Certificate SAN bundle: " + ", ".join(DOMAINS))
    log(f"Cloudflare authoritative zone: {CF_ZONE_NAME} ({zone_id})")
    log(
        "ACME challenge name(s): "
        + ", ".join(sorted(challenge_names_for_bundle()))
    )

    certificates = list_certificates(esa_client, site_id)
    active = reconcile_dcv(certificates, zone_id)
    cleanup_orphaned_managed_txt(zone_id, active)

    if renewal_required(certificates):
        preclean_bundle(zone_id)
        apply_bundle_certificate(esa_client, site_id)
        wait_for_issuance(esa_client, site_id, zone_id)
    else:
        log("No combined certificate renewal is required.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
