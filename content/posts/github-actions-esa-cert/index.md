---
title: "GitHub Actions 续签 ESA 证书"
date: "2026-08-17"
updated: "2026-08-17"
description: "用 GitHub Actions 串联 Alibaba Cloud International ESA 与 Cloudflare DNS，自动续订 jsw.ac.cn 与 *.jsw.ac.cn 的 Let’s Encrypt 边缘证书。"
category: "SSL 证书"
tags: ["GitHub Actions", "ESA", "Cloudflare", "Let's Encrypt", "自动续订"]
draft: false
---

> **说明：**本文使用模型辅助整理与润色，但文中涉及的 GitHub Actions、Alibaba Cloud International ESA、Cloudflare DNS 配置、证书申请逻辑与实际签发结果均已核对并确认可行。

这次先从 GitHub Actions 开始。

该网站现在每天会运行一次名为 `ESA certificate watch` 的 Workflow。证书正常时，它检查完就退出；当证书缺失或进入续订窗口后，它会向 Alibaba Cloud International ESA 申请新的 Let’s Encrypt 证书，取得 DNS-01 验证值，再通过 Cloudflare API 写入 TXT。签发完成后，临时 `_acme-challenge` 记录也会被清掉。

最终维护的是同一张同时覆盖下面两个名称的边缘证书：

```text
jsw.ac.cn
*.jsw.ac.cn
```

这样 `jsw.ac.cn` 根域与 `www.jsw.ac.cn`、`blog.jsw.ac.cn`、`files.jsw.ac.cn` 这类一级子域可以放在同一张证书里处理。

## Action 本身怎么写

目前该网站实际使用的 Workflow 如下：

```yaml
name: ESA certificate watch

on:
  schedule:
    - cron: "17 2 * * *"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: esa-certificate-watch
  cancel-in-progress: false

jobs:
  monitor-and-renew:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    env:
      PYTHONUNBUFFERED: "1"
      ALIBABA_CLOUD_ACCESS_KEY_ID: ${{ secrets.ALIBABA_CLOUD_ACCESS_KEY_ID }}
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: ${{ secrets.ALIBABA_CLOUD_ACCESS_KEY_SECRET }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      ESA_REGION_ID: ${{ vars.ESA_REGION_ID || 'ap-southeast-1' }}
      ESA_ENDPOINT: ${{ vars.ESA_ENDPOINT }}
      ESA_SITE_ID: ${{ vars.ESA_SITE_ID }}
      ESA_SITE_NAME: ${{ vars.ESA_SITE_NAME || 'jsw.ac.cn' }}
      ESA_DOMAINS: ${{ vars.ESA_DOMAINS || 'jsw.ac.cn,*.jsw.ac.cn' }}
      ESA_RENEW_BEFORE_DAYS: ${{ vars.ESA_RENEW_BEFORE_DAYS || '14' }}
      ESA_CERT_TYPE: ${{ vars.ESA_CERT_TYPE || 'lets_encrypt' }}
      ESA_ISSUANCE_WAIT_SECONDS: ${{ vars.ESA_ISSUANCE_WAIT_SECONDS || '300' }}

      CLOUDFLARE_ZONE_ID: ${{ vars.CLOUDFLARE_ZONE_ID }}
      CLOUDFLARE_ZONE_NAME: ${{ vars.CLOUDFLARE_ZONE_NAME || 'jsw.ac.cn' }}
      CLOUDFLARE_DCV_TTL: ${{ vars.CLOUDFLARE_DCV_TTL || '120' }}
      CLOUDFLARE_PURGE_CONFLICTING_ACME: ${{ vars.CLOUDFLARE_PURGE_CONFLICTING_ACME || 'true' }}
      CLOUDFLARE_CLEAN_AFTER_ISSUE: ${{ vars.CLOUDFLARE_CLEAN_AFTER_ISSUE || 'true' }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install Alibaba Cloud International ESA SDK
        run: python -m pip install --disable-pip-version-check alibabacloud_esa20240910

      - name: Monitor ESA certificate and reconcile Cloudflare DNS DCV
        run: python -u scripts/esa_certificate_watch.py
```

Workflow 本身很薄。GitHub Actions 主要负责四件事：定时启动、注入 Secret 与 Variable、准备 Python 环境、运行真正的续订脚本。

也就是说，核心其实是最后这一行：

```bash
python -u scripts/esa_certificate_watch.py
```

## 为什么还要接 Cloudflare

该网站使用 Alibaba Cloud International ESA 做边缘加速，HTTPS 最终在 ESA 边缘结束，所以 ESA 上需要可用的边缘证书。

不过该网站并没有把 NS 托管给 ESA，权威 DNS 仍然在 Cloudflare。这样一来，ESA 可以负责申请 Let’s Encrypt 证书，却不能直接替 Cloudflare 完成 DNS-01 验证。

于是续订链路自然变成：

```text
GitHub Actions
      ↓
Alibaba Cloud International ESA
      ↓
读取 DNS DCV
      ↓
Cloudflare DNS
      ↓
Let's Encrypt 验证
      ↓
ESA 获得新证书
```

原来需要在 ESA 和 Cloudflare 之间手动复制 TXT，现在由 Action 来做。

## 先检查，不急着申请

脚本启动后先读取当前证书，并检查有没有一张证书同时覆盖 `jsw.ac.cn` 和 `*.jsw.ac.cn`。

```python
def cert_covers_bundle(cert):
    return all(
        cert_covers_target(cert, domain)
        for domain in DOMAINS
    )
```

然后从可用证书中找有效期最靠后的那一张：

```python
def newest_usable_bundle(certificates):
    usable = [
        cert
        for cert in certificates
        if cert_covers_bundle(cert)
        and str(cert.get("Status") or "")
        in {"OK", "Issued", "Expiring"}
    ]

    if not usable:
        return None

    usable.sort(
        key=lambda cert:
            parse_not_after(cert.get("NotAfter")),
        reverse=True,
    )

    return usable[0]
```

默认续订阈值是 14 天。因此每天运行并不会每天申请证书，大部分运行实际上只是：

```text
找到证书
→ SAN 正确
→ 状态正常
→ 距离到期还很久
→ 退出
```

只有没有完整证书，或者进入续订窗口，才继续调用 ESA。

## 申请一张根域 + 泛域证书

申请部分并不长：

```python
def apply_bundle_certificate(client, site_id):
    response = client.apply_certificate(
        esa_models.ApplyCertificateRequest(
            site_id=site_id,
            domains=",".join(DOMAINS),
            type=CERT_TYPE,
        )
    )

    result = body_map(response).get("Result") or []

    log(
        "Requested one Let's Encrypt bundle for: "
        + ", ".join(DOMAINS)
    )

    for item in result:
        log(
            f"ESA result domain={item.get('Domain')} "
            f"id={item.get('Id')} "
            f"status={item.get('Status')}"
        )
```

当前 `DOMAINS` 默认值是：

```text
jsw.ac.cn,*.jsw.ac.cn
```

这里要求的是一张同时覆盖根域与 wildcard 的证书，而不是分别维护两张证书。`*.jsw.ac.cn` 可以覆盖一级子域，却不会自动覆盖 `jsw.ac.cn` 本身，所以根域仍然需要出现在 SAN 中。

## ESA 给验证值，Cloudflare 负责落地

进入 `Applying` 后，ESA 会暴露 DNS DCV。脚本把当前仍有效的验证值收集起来：

```python
def active_esa_dns_challenges(certificates):
    active = {}

    for cert in certificates:
        if str(cert.get("Status") or "") != "Applying":
            continue

        for dcv in cert.get("DCV") or []:
            if str(dcv.get("Type") or "").upper() != "DNS":
                continue

            key = str(dcv.get("Key") or "").strip().rstrip(".")
            value = str(dcv.get("Value") or "").strip()

            if not key or not value:
                continue

            key = validate_dcv_name(key)
            active.setdefault(key, set()).add(value)

    return active
```

这里用了 `set()`，因为 `jsw.ac.cn` 与 `*.jsw.ac.cn` 的 DNS-01 验证都可能落在：

```text
_acme-challenge.jsw.ac.cn
```

同一个名字下面可能同时需要两个 TXT：

```text
_acme-challenge.jsw.ac.cn TXT "value-a"
_acme-challenge.jsw.ac.cn TXT "value-b"
```

如果直接把 TXT 当作单值更新，第二个 challenge 很容易把第一个覆盖掉。现在的逻辑是先把 ESA 当前这一轮要求的值全部收集起来，再让 Cloudflare 同时保留。

Cloudflare 这边没有额外装 SDK，直接用 API v4：

```python
def cf_request(method, path, *, query=None, payload=None):
    url = "https://api.cloudflare.com/client/v4" + path

    if query:
        url += "?" + parse.urlencode(query)

    data = (
        json.dumps(payload).encode("utf-8")
        if payload is not None
        else None
    )

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

    with request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))

    if not result.get("success", False):
        raise RuntimeError(result.get("errors"))

    return result.get("result")
```

写 TXT 也就变成普通的 API 请求：

```python
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
```

## 签完就把 TXT 收掉

ACME 验证记录没有必要长期留在 DNS 里。

脚本只允许操作目标 Zone 内、名称以 `_acme-challenge.` 开头的 TXT：

```python
def validate_dcv_name(record_name):
    name = record_name.lower().rstrip(".")

    if (
        name != CF_ZONE_NAME
        and not name.endswith("." + CF_ZONE_NAME)
    ):
        raise RuntimeError(
            "Refusing to modify Cloudflare DNS outside zone"
        )

    if not name.startswith("_acme-challenge."):
        raise RuntimeError(
            "Refusing to modify non-ACME TXT record"
        )

    return name
```

所以 SPF、DKIM、DMARC、MX 等记录不在脚本的操作范围里。

当前 ESA 申请需要的 TXT 会被保留，同名但已经不属于本轮申请的旧 challenge 可以删除。等 ESA 确认证书已经 `Issued` 或 `OK`，脚本再清掉自己管理的临时 ACME TXT。

如果五分钟内 ESA 仍然在验证，当前 challenge 不会被强制删除，下一轮 cron 会继续检查。

```python
def wait_for_issuance(client, site_id, zone_id):
    deadline = (
        time.monotonic()
        + max(0, ISSUANCE_WAIT_SECONDS)
    )

    while True:
        certificates = list_certificates(client, site_id)
        active = reconcile_dcv(certificates, zone_id)

        cleanup_orphaned_managed_txt(
            zone_id,
            active,
        )

        if bundle_issued(certificates):
            cleanup_orphaned_managed_txt(
                zone_id,
                {},
            )
            return

        if time.monotonic() >= deadline:
            return

        time.sleep(10)
```

## Action 运行时能看见它在干什么

第一次调试时遇到过一个很简单的问题：Python stdout 缓冲让 Action 长时间没有新日志，看起来像任务卡住。

所以 Workflow 里现在同时有：

```yaml
PYTHONUNBUFFERED: "1"
```

以及：

```bash
python -u scripts/esa_certificate_watch.py
```

脚本日志也主动 `flush`：

```python
def log(message):
    print(message, flush=True)
```

现在运行时可以直接看到证书 SAN、Site、Cloudflare Zone、当前 challenge、轮询状态等信息。自动化本身不一定要复杂，但至少应该知道它现在卡在哪一步。

## 换成别的域名还能跑吗

可以。现在大部分站点相关值都通过 GitHub Repository Variables 注入，而不是写死在 Action 里。

例如要换成：

```text
example.com
*.example.com
```

可以设置：

```text
ESA_SITE_NAME=example.com
ESA_DOMAINS=example.com,*.example.com
CLOUDFLARE_ZONE_NAME=example.com
```

凭据仍然放在 Repository Secrets：

```text
ALIBABA_CLOUD_ACCESS_KEY_ID
ALIBABA_CLOUD_ACCESS_KEY_SECRET
CLOUDFLARE_API_TOKEN
```

如果已经知道具体 ID，还可以直接提供：

```text
ESA_SITE_ID
CLOUDFLARE_ZONE_ID
```

需要更换 ESA 地域时，则修改：

```text
ESA_REGION_ID
```

或者直接指定：

```text
ESA_ENDPOINT
```

因此在同样使用 **Alibaba Cloud International ESA + Cloudflare 权威 DNS** 的站点上，主要替换域名、Zone、Site 与凭据就可以复用。

如果连证书平台也换掉，例如不再使用 ESA，那么 Cloudflare DNS 这一半依然可以保留，但 `ListCertificates`、`ApplyCertificate` 和读取 ESA DCV 的部分需要替换成对应平台的 API。

GitHub Actions 也不是必须的。脚本本身只是普通 Python 程序，把同样的环境变量放到 VPS 上，再用 cron 运行同一个脚本也可以。GitHub Actions 的价值主要是省掉一台专门跑定时任务的机器。

## 现在它每天做的事情很少

最终该网站的续订链路已经变成：

```text
GitHub Actions
       ↓
检查 ESA 证书
       ↓
还没到续订时间 → 退出
       ↓
需要续订
       ↓
申请 jsw.ac.cn + *.jsw.ac.cn
       ↓
获取 ESA DNS DCV
       ↓
写入 Cloudflare TXT
       ↓
等待 Let's Encrypt 验证
       ↓
ESA 获得新边缘证书
       ↓
删除临时 TXT
```

它没有重新发明一套证书管理平台，只是把 ESA 和 Cloudflare 之间原本需要手动处理的那一小段接起来。

对于该网站这种 **ESA 负责边缘 HTTPS、Cloudflare 继续负责权威 DNS** 的结构，一个 Workflow 加一个 Python 脚本已经足够。