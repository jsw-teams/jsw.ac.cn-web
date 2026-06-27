---
title: "如何申请免费的阿里云域名邮箱"
date: "2025-12-15"
updated: "2025-12-15"
description: "本文介绍如何白嫖阿里云邮箱的免费版本，创建一个常用日常用的邮箱，开启第三方邮件客户端登陆"
category: "邮箱"
tags: ["阿里邮箱"]
draft: false
---
本文介绍如何白嫖阿里云邮箱的免费版本，创建一个常用日常用的邮箱，开启第三方邮件客户端登陆

首先给个阿里云免费企业邮箱申请入口链接：[阿里云免费企业邮箱申请](https://common-buy.aliyun.com/?userCode=r3yteowb?spm=a2c6h.13066369.question.5.221a49eb7cbpCQ&commodityCode=alimail&specCode=lx_18482&request=%7B%22ord_time%22:%223:Year%22,%22account_num%22:%225%22%7D#/buy)
填入绑定邮箱域名才能生成价格，价格会显示0元
![购买免费的阿里云免费企业邮箱](/img/post/emails-buy.png)
然后点击支付，支付完成后，进入控制台配置解析记录
![配置解析](/img/post/set-emails-dns.png)
解析记录配对好且有效时候就可以访问邮箱访问地址使用初始的 postmaster账户登录进行邮箱分配
![进行账户分配](/img/post/Account-allocation.png)
登陆后点击域管理
![点击顶部域管理](/img/post/Domain-management.png)
点击组织与用户>员工账户>创建账户，输入账户和密码和选择是否要求初始化密码，最后保存配置
![分配邮箱](/img/post/create-Account.png)
点击安全管理>账户安全策略，下拉找到三方客户端安全登录，选择允许使用第三方客户端，然后点击保存配置
![允许第三方登录](/img/post/Allow-third-party-login.png)
第三方客户端登录配置可以参考[这里](https://help.aliyun.com/document_detail/36596.html)
