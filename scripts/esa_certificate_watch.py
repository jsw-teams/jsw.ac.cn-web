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
DOMAINS = [v.strip().lower().rstrip(".") for v in os.getenv("ESA_DOMAINS", "www.jsw.ac.cn").split(",") if v.strip()]
RENEW_BEFORE_DAYS = int(os.getenv("ESA_RENEW_BEFORE_DAYS", "14"))
CERT_TYPE = os.getenv("ESA_CERT_TYPE", "lets_encrypt").strip() or "lets_encrypt"

CF_API_BASE = "https://api.cloudflare.com/client/v4"
CF_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
CF_ZONE_ID_ENV = os.getenv("CLOUDFLARE_ZONE_ID", "").strip()
CF_ZONE_NAME = os.getenv("CLOUDFLARE_ZONE_NAME", SITE_NAME).strip().lower().rstrip(".") or SITE_NAME.lower().rstrip(".")
CF_DCV_TTL = int(os.getenv("CLOUDFLARE_DCV_TTL", "120"))


def body_map(response: Any) -> dict[str, Any]:
    body = getattr(response, "body", None)
    if body is None:
        return {}
    return body.to_map() if hasattr(body, "to_map") else dict(body)


def build_esa_client() -> EsaClient:
    access_key_id = os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID", "").strip()
    access_key_secret = os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "").strip()
    if not access_key_id or not access_key_secret:
        raise RuntimeError("Missing ALIBABA_CLOUD_ACCESS_KEY_ID or ALIBABA_CLOUD_ACCESS_KEY_SECRET")
    config = open_api_models.Config(
        access_key_id=access_key_id,
        access_key_secret=access_key_secret,
        region_id=REGION_ID,
        endpoint=ENDPOINT,
    )
    return EsaClient(config)


def cf_request(method: str, path: str, *, query: dict[str, Any] | None = None, payload: dict[str, Any] | None = None) -> Any:
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
        raise RuntimeError(f"Cloudflare API {method} {path} failed with HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Cloudflare API {method} {path} failed: {exc}") from exc

    if not result.get("success", False):
        raise RuntimeError(f"Cloudflare API {method} {path} failed: {result.get('errors') or result}")
    return result.get("result")


def resolve_cloudflare_zone_id() -> str:
    if CF_ZONE_ID_ENV:
        return CF_ZONE_ID_ENV
    zones = cf_request(
        "GET",
        "/zones",
        query={"name": CF_ZONE_NAME, "status": "active", "per_page": 50},
    ) or []
    exact = [z for z in zones if str(z.get("name") or "").lower().rstrip(".") == CF_ZONE_NAME]
    if len(exact) != 1:
        raise RuntimeError(f"Expected exactly one active Cloudflare zone named {CF_ZONE_NAME}, found {len(exact)}")
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
        if str(site.get("SiteName", "")).lower().rstrip(".") == SITE_NAME.lower().rstrip("."):
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


def name_covers(pattern: str, domain: str) -> bool:
    pattern = pattern.lower().rstrip(".")
    domain = domain.lower().rstrip(".")
    if pattern == domain:
        return True
    if pattern.startswith("*."):
        suffix = pattern[2:]
        return domain.endswith("." + suffix) and domain.count(".") == suffix.count(".") + 1
    return False


def cert_covers(cert: dict[str, Any], domain: str) -> bool:
    return any(name_covers(name, domain) for name in cert_names(cert))


def parse_not_after(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    return None


def days_left(cert: dict[str, Any]) -> float | None:
    expiry = parse_not_after(cert.get("NotAfter"))
    if not expiry:
        return None
    return (expiry - datetime.now(timezone.utc)).total_seconds() / 86400


def validate_dcv_name(record_name: str) -> str:
    name = record_name.lower().rstrip(".")
    if name != CF_ZONE_NAME and not name.endswith("." + CF_ZONE_NAME):
        raise RuntimeError(f"Refusing to modify Cloudflare TXT outside zone {CF_ZONE_NAME}: {record_name}")
    return name


def list_cloudflare_txt(zone_id: str, record_name: str) -> list[dict[str, Any]]:
    result = cf_request(
        "GET",
        f"/zones/{zone_id}/dns_records",
        query={"type": "TXT", "name": record_name, "per_page": 100},
    )
    return result or []


def ensure_cloudflare_txt(zone_id: str, record_name: str, value: str) -> None:
    record_name = validate_dcv_name(record_name)
    records = list_cloudflare_txt(zone_id, record_name)

    for record in records:
        if str(record.get("content") or "") == value:
            print(f"Cloudflare DCV TXT already present: {record_name}")
            return

    managed = next((r for r in records if str(r.get("comment") or "") == MANAGED_COMMENT), None)
    payload = {
        "type": "TXT",
        "name": record_name,
        "content": value,
        "ttl": CF_DCV_TTL,
        "comment": MANAGED_COMMENT,
    }

    if managed:
        cf_request("PATCH", f"/zones/{zone_id}/dns_records/{managed['id']}", payload=payload)
        print(f"Updated Cloudflare DCV TXT: {record_name}")
        return

    cf_request("POST", f"/zones/{zone_id}/dns_records", payload=payload)
    print(f"Created Cloudflare DCV TXT: {record_name}")


def reconcile_dcv(certificates: list[dict[str, Any]], cloudflare_zone_id: str) -> int:
    changes = 0
    for cert in certificates:
        if str(cert.get("Status") or "") != "Applying":
            continue
        for dcv in cert.get("DCV") or []:
            if str(dcv.get("Type") or "").upper() != "DNS":
                continue
            if str(dcv.get("Status") or "").lower() in {"success", "verified", "ok", "passed"}:
                continue
            key = str(dcv.get("Key") or "").strip().rstrip(".")
            value = str(dcv.get("Value") or "").strip()
            if not key or not value:
                continue
            ensure_cloudflare_txt(cloudflare_zone_id, key, value)
            changes += 1
    return changes


def renewal_domains(certificates: list[dict[str, Any]]) -> list[str]:
    result: list[str] = []
    for domain in DOMAINS:
        matching = [c for c in certificates if cert_covers(c, domain)]
        if any(str(c.get("Status") or "") == "Applying" for c in matching):
            print(f"{domain}: certificate application already in progress")
            continue

        usable = [c for c in matching if str(c.get("Status") or "") in {"OK", "Issued", "Expiring"}]
        if not usable:
            print(f"{domain}: no usable certificate found")
            result.append(domain)
            continue

        usable.sort(
            key=lambda c: parse_not_after(c.get("NotAfter")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        best = usable[0]
        remaining = days_left(best)
        status = str(best.get("Status") or "")
        if remaining is None:
            if status == "Expiring":
                print(f"{domain}: ESA reports Expiring; renewing because expiry timestamp is unavailable")
                result.append(domain)
            else:
                print(f"{domain}: certificate status {status}; expiry timestamp unavailable, leaving unchanged")
            continue

        print(f"{domain}: certificate {best.get('Id')} status={status}, {remaining:.1f} days remaining")
        if remaining <= RENEW_BEFORE_DAYS:
            result.append(domain)
    return result


def apply_certificate(client: EsaClient, site_id: int, domains: list[str]) -> None:
    if not domains:
        return
    response = client.apply_certificate(
        esa_models.ApplyCertificateRequest(
            site_id=site_id,
            domains=",".join(domains),
            type=CERT_TYPE,
        )
    )
    result = body_map(response).get("Result") or []
    print("Applied for certificates:", ", ".join(domains))
    for item in result:
        print(f"  {item.get('Domain')}: id={item.get('Id')} status={item.get('Status')}")


def main() -> int:
    if not DOMAINS:
        raise RuntimeError("ESA_DOMAINS is empty")
    if not CF_TOKEN:
        raise RuntimeError("Missing CLOUDFLARE_API_TOKEN")

    esa_client = build_esa_client()
    site_id = resolve_site_id(esa_client)
    cloudflare_zone_id = resolve_cloudflare_zone_id()

    print(f"Alibaba Cloud International ESA endpoint: {ENDPOINT}")
    print(f"ESA site: {SITE_NAME} ({site_id}); domains: {', '.join(DOMAINS)}")
    print(f"Cloudflare DNS zone: {CF_ZONE_NAME} ({cloudflare_zone_id})")

    certificates = list_certificates(esa_client, site_id)
    reconcile_dcv(certificates, cloudflare_zone_id)

    due = renewal_domains(certificates)
    if due:
        apply_certificate(esa_client, site_id, due)
        # ESA may need a few seconds before exposing the new DCV challenge.
        for attempt in range(4):
            time.sleep(6)
            refreshed = list_certificates(esa_client, site_id)
            changed = reconcile_dcv(refreshed, cloudflare_zone_id)
            if changed:
                break
            if attempt < 3:
                print("Waiting for ESA to expose DNS DCV information...")
    else:
        print("No certificate renewal is required.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
