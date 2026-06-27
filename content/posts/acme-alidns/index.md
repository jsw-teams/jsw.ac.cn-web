---
title: "acme.sh 安装及使用指南"
date: "2025-05-26"
updated: "2025-05-26"
description: "acme.sh 是一个用于申请和管理 CA 证书的轻量级 ACME 客户端，支持自动续订。"
category: "SSL 证书"
tags: ["acme.sh", "云解析", "阿里云"]
draft: false
---
acme.sh 是一个用于申请和管理 CA 证书的轻量级 ACME 客户端，支持自动续订。

## 1. acme.sh 安装
### **1.1 安装 socat


```bash
apt install socat -y  # Ubuntu/Debian
yum install socat -y  # CentOS
```
### **1.2 安装 acme.sh**

使用以下命令安装 acme.sh：

```bash
curl https://get.acme.sh | sh
```

安装完成后，可能需要重新加载 shell 以生效：

```bash
source ~/.bashrc
```

## 2. 申请泛域名证书（使用 阿里云DNS 验证）

### **2.1 配置 阿里云DNS API**
[登录阿里云账户管理](https://ram.console.aliyun.com/users/create)，创建一个具有DNS管理权限的RAM用户

在申请证书前，需要提供 阿里云DNS 的 API Key 和 Email：

```bash
export Ali_Key="sddi*********daf"
export Ali_Secret="jls******************lsa"
```

### **2.2 申请泛域名证书**

注意`yourdomain.com`填写的是你的域名

使用 阿里云 DNS 验证方式申请：

```bash
acme.sh --issue --dns dns_ali -d yourdomain.com -d '*.yourdomain.com'
```

**参数说明**：

- `--dns dns_ali`：使用 Cloudflare DNS 进行域名验证。
- `-d yourdomain.com -d '*.yourdomain.com'`：申请主域名和泛域名证书。

## 3. 证书安装及自动续订

### **3.1 安装证书到指定目录**

将证书安装到 `/etc/nginx/cert/` 目录，并自动续订：

```bash
acme.sh --install-cert -d yourdomain.com \
    --key-file /etc/nginx/cert/private.key \
    --fullchain-file /etc/nginx/cert/cert.crt \
    --reloadcmd "systemctl reload nginx"
```

### **3.2 确保证书自动续订**

acme.sh 会自动续订证书，无需手动干预。可以使用以下命令检查续订任务：

```bash
crontab -l | grep acme.sh
```

如果需要手动触发续订：

```bash
acme.sh --renew -d yourdomain.com
```

## 4. 其他常用命令

### **4.1 查看证书列表**

```bash
acme.sh --list
```

### **4.2 强制更新 acme.sh**

```bash
acme.sh --upgrade
```

### **4.3 卸载 acme.sh**

如果不再使用，可以卸载：

```bash
acme.sh --uninstall
rm -rf ~/.acme.sh
```

## 5. 最后

使用 acme.sh，可以轻松申请和管理 CA 证书，结合 阿里云 DNS 验证，支持泛域名证书，并且自动续订，适用于大多数网站的 HTTPS 配置需求。
