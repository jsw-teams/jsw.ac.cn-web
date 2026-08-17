#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

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
TXT_TTL = int(os.getenv("ESA_DCV_TTL", "60"))


def body_map(response: Any) -> dict[str, Any]:
    body = getattr(response, "body", None)
    if body is None:
        return {}
    return body.to_map() if hasattr(body, "to_map") else dict(body)


def build_client() -> EsaClient:
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


def list_txt_records(client: EsaClient, site_id: int, record_name: str) -> list[dict[str, Any]]:
    response = client.list_records(
        esa_models.ListRecordsRequest(
            site_id=site_id,
            record_name=record_name,
            record_match_type="exact",
            type="TXT",
            page_number=1,
            page_size=500,
        )
    )
    return body_map(response).get("Records") or []


def ensure_txt_record(client: EsaClient, site_id: int, record_name: str, value: str) -> None:
    records = list_txt_records(client, site_id, record_name)
    for record in records:
        current = str((record.get("Data") or {}).get("Value") or "")
        if current == value:
            print(f"DCV TXT already present: {record_name}")
            return

    managed = next((r for r in records if str(r.get("Comment") or "") == MANAGED_COMMENT), None)
    if managed:
        request = esa_models.UpdateRecordRequest(
            record_id=int(managed["RecordId"]),
            type="TXT",
            ttl=TXT_TTL,
            proxied=False,
            comment=MANAGED_COMMENT,
            data=esa_models.UpdateRecordRequestData(value=value),
        )
        client.update_record(request)
        print(f"Updated managed DCV TXT: {record_name}")
        return

    request = esa_models.CreateRecordRequest(
        site_id=site_id,
        record_name=record_name,
        type="TXT",
        ttl=TXT_TTL,
        proxied=False,
        comment=MANAGED_COMMENT,
        data=esa_models.CreateRecordRequestData(value=value),
    )
    client.create_record(request)
    print(f"Created DCV TXT: {record_name}")


def reconcile_dcv(client: EsaClient, site_id: int, certificates: list[dict[str, Any]]) -> int:
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
            ensure_txt_record(client, site_id, key, value)
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
    client = build_client()
    site_id = resolve_site_id(client)
    print(f"Alibaba Cloud International ESA endpoint: {ENDPOINT}")
    print(f"Site: {SITE_NAME} ({site_id}); domains: {', '.join(DOMAINS)}")

    certificates = list_certificates(client, site_id)
    reconcile_dcv(client, site_id, certificates)

    due = renewal_domains(certificates)
    if due:
        apply_certificate(client, site_id, due)
        time.sleep(8)
        reconcile_dcv(client, site_id, list_certificates(client, site_id))
    else:
        print("No certificate renewal is required.")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
