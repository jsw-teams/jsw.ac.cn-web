---
title: "手把手教你安装和运行 Hexo 博客框架"
date: "2026-06-27"
updated: "2026-06-27"
description: "Hexo 是一个快速、简洁且强大的静态博客框架，非常适合个人博客搭建。本文将带你一步步完成 Hexo 的安装和运行，新手也能轻松上手！"
category: "静态框架"
tags: ["Hexo"]
draft: false
---
Hexo 是一个快速、简洁且强大的静态博客框架，非常适合个人博客搭建。本文将带你一步步完成 Hexo 的安装和运行，新手也能轻松上手！



## **环境准备**

在开始之前，请确保你的电脑已安装以下工具：
1. **Node.js 和 npm** 
   下载地址：[Node.js 官方网站](https://nodejs.org/) 
   **推荐版本：LTS**

## **安装 Hexo**

1. 打开终端，安装 Hexo 的命令行工具：
   ```bash
   npm install -g hexo-cli
   ```

2. **创建博客项目** 
   选择一个空文件夹作为你的博客目录，例如 `hexo-blog`，然后执行以下命令：
   
   ```bash
   mkdir hexo-blog
   cd hexo-blog
   hexo init
   ```
   
   安装完成后，目录结构如下：
   ```
   hexo-blog/
   ├── _config.yml    # 站点配置文件
   ├── package.json   # 项目信息
   ├── scaffolds/     # 模板文件
   ├── source/        # 博客内容
   └── themes/        # 主题文件
   ```
   
3. 安装依赖：
   ```bash
   npm install
   ```

## **运行 Hexo**

1. 启动本地服务器：
   ```bash
   hexo server
   ```

2. 打开浏览器，访问 [http://localhost:4000](http://localhost:4000)，你将看到 Hexo 的默认页面。


## **撰写博客文章**

1. **新建文章** 
   使用命令：
   
   ```bash
   hexo new "文章标题"
   ```
   文章文件会保存在 `source/_posts/` 文件夹下，文件格式为 `.md`。
   
2. **编辑文章** 
   打开新建的 Markdown 文件，在其中撰写你的内容。例如：
   ```markdown
   ---
   title: 我的第一篇博客
   date: 2025-06-18 10:00:00
   tags: [Hexo, 博客]
   ---
   这是我的第一篇 Hexo 博客文章！欢迎阅读！
   ```

3. **生成静态页面** 
   在终端运行：
   
   ```bash
   hexo generate
   ```
   
4. **再次启动服务器** 
   如果服务器已经关闭，请重新运行：
   
   ```bash
   hexo server
   ```

## **常用命令汇总**

| 命令              | 作用                   |
| ----------------- | ---------------------- |
| `hexo new <标题>` | 新建文章               |
| `hexo generate`   | 生成静态文件           |
| `hexo server`     | 本地预览               |
| `hexo deploy`     | 部署                   |
| `hexo clean`      | 清理缓存与旧的静态文件 |

---

## **部署网站**

1. （推荐）SSH登入后上传到nginx指向路径即可
2. （不太推荐）使用hexo-deployer-sftp插件上传，因为太久没维护了，不安全，上传推送可能不支持。[使用方法](https://hexo.io/zh-cn/docs/one-command-deployment#SFTP)



## **结语**

恭喜你完成了 Hexo 博客的安装和运行！通过 Hexo，你可以轻松记录生活和技术点滴，还可以通过丰富的主题和插件打造个性化博客。快去试试吧！
