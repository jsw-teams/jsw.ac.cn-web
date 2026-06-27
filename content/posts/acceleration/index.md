---
title: "将 Hexo 站点部署到阿里云 OSS 并绑定 ESA 加速"
date: "2025-09-10"
updated: "2025-09-10"
description: "使用 Hexo 搭建博客后，我们通常会得到一个 public/ 文件夹，其中就是最终的静态站点文件。本文介绍如何将这些文件上传到阿里云 OSS，并开启静态网站托管，再通过 ESA（Edge Side Acceleration）进行全球加速。"
category: "阿里云"
tags: ["OSS", "ESA", "阿里云"]
draft: false
---
使用 Hexo 搭建博客后，我们通常会得到一个 `public/` 文件夹，其中就是最终的静态站点文件。本文介绍如何将这些文件上传到阿里云 OSS，并开启静态网站托管，再通过 ESA（Edge Side Acceleration）进行全球加速。


## 一、生成站点文件

进入 Hexo 项目根目录，执行命令：

```
hexo g
```

生成的静态文件会存放在 `public/` 目录下。


---


## 二、配置并使用 `ossutil`

### 1. 安装 `ossutil`

前往[阿里云 OSS 官方下载页面](https://help.aliyun.com/zh/oss/developer-reference/install-ossutil)，下载对应系统的 `ossutil` 工具。
 Windows 用户下载 `.exe` 文件后放到 PATH 路径下，方便调用。

### 2. 初始化配置

执行：

```
ossutil config
```

依次输入：

- **Config file path**：直接回车默认即可
- **AccessKey ID / Secret**：RAM 用户的凭证
- **Region**：如 `cn-hangzhou`、`ap-southeast-1`
- **Endpoint**：可留空，默认使用公网域名，例如 `oss-cn-hangzhou.aliyuncs.com`

### 3. 上传 Hexo 静态文件

推荐使用同步方式上传：

```
ossutil sync 需要上传目录位置 oss://你的Bucket名/ --delete
```

- `-f`：强制覆盖
- `--delete`：让远端和本地完全一致，会删除 OSS 上多余文件

这样，`public` 内的内容就会直接部署到 Bucket 的根目录。


---


## 三、开启 OSS 静态网站托管

为了让 OSS 直接作为网站访问，需要开启 **静态网站托管**：

1. 打开 OSS 控制台 → 选择对应 Bucket → 数据管理 → 静态页面
2. 配置：
   - **索引页面**：`index.html`
   - **错误页面**：`404.html`
![OSS静态页面设置](/img/post/OSS-1.png)

---


## 四、绑定阿里云 ESA 加速

为了加速境内外访问速度，可以绑定阿里云 ESA：

1. 在 ESA 控制台新建加速实例
2. 绑定自定义域名
3. 在源站地址选择 **OSS Bucket 域名**
![ESA绑定自定义域名](/img/post/ESA-1.png)
4. 配置 HTTPS（可在NS托管下让其生成免费的SSL证书）
![让ESA生成免费HTTPS证书](/img/post/ESA-2.png)
之后就会通过 ESA 节点加速，提升国内外访问体验。
