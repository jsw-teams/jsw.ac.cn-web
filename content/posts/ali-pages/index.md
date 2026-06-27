---
title: "如何将hexo部署到阿里云pages上"
date: "2025-12-09"
updated: "2025-12-09"
description: "最近阿里云开放了pages服务，所以本网站搭个车将网站迁移到阿里云pages上面。本文介绍如何通过hexo d上传到GitHub，然后让阿里云pages拉取github项目完成部署。"
category: "阿里云"
tags: ["阿里云ESA"]
draft: false
---
最近阿里云开放了pages服务，所以本网站搭个车将网站迁移到阿里云pages上面。本文介绍如何通过hexo d上传到GitHub，然后让阿里云pages拉取github项目完成部署。

![阿里云推广图片](https://img.alicdn.com/imgextra/i4/O1CN01w6RRv21Z6Skr6Y40E_!!2216683083145-2-fleamarket.png)
在原先你的hexo目录中`_config.yml`的deploy部分填入：

```yaml
deploy:
  type: git
  repo: git@github.com:你的GitHub账号/项目名称.git
  branch: main
  message: "Site updated: {{ now('YYYY-MM-DD HH:mm:ss') }}"
```
* 本地 `hexo d` 时，会自动把 `public` 的内容推到 `main`。
* 仓库的 `main` 分支里就是“纯静态站点”。

在阿里云 ESA：

* 导入这个 `blog` 仓库，
* 分支选 `main`，
* 同样配置：

  * 安装命令：`echo skip`
  * 构建命令：`echo skip`
  * 静态目录：`./`
![pages部署设置](/img/post/pages-1.png)

完成部署后可以绑定自定义域名，同时建议将NS交给ESA托管
![pages绑定自定义域名](/img/post/pages-2.png)

等待DNS记录传播生效，同时留意pages目前只提供ipv4访问，少部分纯ipv6环境不完全支持，所以itdog提供ipv6 https测试部分地区出现解析失败无法访问是正常现象
![ipv4测试](/img/post/itdog-pages-v4.png)
![ipv6测试](/img/post/itdog-pages-v6.png)
![海外DNS查询AAAA记录](/img/post/oversea-dnsquery-v6.png)
