import fs from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import YAML from "yaml";

const root = process.cwd();
const config = YAML.parse(await fs.readFile(path.join(root, "config.yml"), "utf8")) || {};
const themeName = config.theme?.name || "inkstone-v2";
const contentDir = path.join(root, "content");
const staticDir = path.join(root, "static");
const themeDir = path.join(root, "themes", themeName);
const outputDir = path.join(root, "public");
const theme = JSON.parse(await fs.readFile(path.join(themeDir, "theme.json"), "utf8"));

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function xml(value = "") {
  return esc(value);
}

function slugify(value) {
  const base = String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]+/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "section";
}

function codeLanguage(info = "") {
  return String(info).trim().split(/\s+/)[0].replace(/[^A-Za-z0-9_+.#-]/g, "");
}

const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"></path></svg>`;

function codeBlock(content, info = "") {
  const language = codeLanguage(info);
  const label = language || "code";
  const className = language ? ` class="language-${esc(language)}"` : "";
  return `<figure class="code-shell" data-code-block>
    <figcaption class="code-toolbar">
      <span class="code-language"><span class="code-dot" aria-hidden="true"></span>${esc(label)}</span>
      <button class="code-copy" type="button" data-code-copy aria-label="复制代码">
        <span class="code-copy-icon code-copy-icon-default">${COPY_ICON}</span>
        <span class="code-copy-icon code-copy-icon-success">${CHECK_ICON}</span>
        <span data-copy-label>复制</span>
      </button>
    </figcaption>
    <pre><code${className}>${md.utils.escapeHtml(content)}</code></pre>
  </figure>\n`;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false
}).use(taskLists, { enabled: true, label: true, labelAfter: true });

md.renderer.rules.fence = (tokens, index) => codeBlock(tokens[index].content, tokens[index].info);
md.renderer.rules.code_block = (tokens, index) => codeBlock(tokens[index].content);
md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const inline = tokens[index + 1];
  const base = slugify(inline?.content || "section");
  env.headingIds ||= new Map();
  const count = (env.headingIds.get(base) || 0) + 1;
  env.headingIds.set(base, count);
  tokens[index].attrSet("id", count === 1 ? base : `${base}-${count}`);
  return self.renderToken(tokens, index, options);
};
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  tokens[index].attrSet("loading", "lazy");
  tokens[index].attrSet("decoding", "async");
  return defaultImage ? defaultImage(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
};
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

const STRONG_STAR_CJK_BOUNDARY = /(\*\*[^*\n]+[\p{P}\p{S}]\*\*)(?=[\p{Letter}\p{Number}])/gu;
const STRONG_UNDERSCORE_CJK_BOUNDARY = /(__[^_\n]+[\p{P}\p{S}]__)(?=[\p{Letter}\p{Number}])/gu;

function normalizeCjkEmphasisBoundaries(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  let fenceChar = "";

  return lines.map((line) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const current = fence[1][0];
      if (!fenceChar) fenceChar = current;
      else if (fenceChar === current) fenceChar = "";
      return line;
    }

    if (fenceChar || line.includes("`")) return line;

    return line
      .replace(STRONG_STAR_CJK_BOUNDARY, "$1<!--md-cjk-boundary-->")
      .replace(STRONG_UNDERSCORE_CJK_BOUNDARY, "$1<!--md-cjk-boundary-->");
  }).join("\n");
}

function markdown(source) {
  return md.render(normalizeCjkEmphasisBoundaries(source), { headingIds: new Map() });
}

const cjkEmphasisProbe = markdown("> **说明：**本文");
if (!cjkEmphasisProbe.includes("<strong>说明：</strong>")) {
  throw new Error("Markdown CJK strong-emphasis compatibility regression: **说明：**本文 did not render as <strong>.");
}

function plainText(source = "") {
  return String(source)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  return { data: YAML.parse(match[1]) || {}, body: match[2] };
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from, to) {
  if (!(await exists(from))) return;
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(source, target);
    else await fs.copyFile(source, target);
  }
}

async function readEntries(kind) {
  const base = path.join(contentDir, kind);
  if (!(await exists(base))) return [];
  const entries = [];
  for (const entry of await fs.readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(base, entry.name, "index.md");
    if (!(await exists(file))) continue;
    const parsed = splitFrontmatter(await fs.readFile(file, "utf8"));
    if (parsed.data.draft === true || String(parsed.data.draft).toLowerCase() === "true") continue;
    const body = parsed.body.trim();
    const date = String(parsed.data.date || "1970-01-01").slice(0, 10);
    const updated = String(parsed.data.updated || parsed.data.date || "1970-01-01").slice(0, 10);
    const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [];
    entries.push({
      slug: entry.name,
      title: String(parsed.data.title || entry.name),
      description: String(parsed.data.description || plainText(body).slice(0, 180)),
      date,
      updated,
      category: String(parsed.data.category || "未分类"),
      tags,
      html: markdown(body),
      text: plainText(body),
      url: kind === "posts" ? `/post/${entry.name}/` : `/${entry.name}/`
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

async function readTemplate(name) {
  return fs.readFile(path.join(themeDir, theme.templates || "templates", `${name}.html`), "utf8");
}

function renderTemplate(source, data) {
  return source
    .replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, key) => data[key] ?? "")
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => esc(data[key] ?? ""));
}

function asset(file) {
  return `/assets/theme/${themeName}/${String(file).replace(/^\/+/, "")}`;
}

function themeFiles(map, key) {
  const value = map?.[key] || [];
  return Array.isArray(value) ? value : [value];
}

function nav(current = "") {
  const links = config.nav?.links || [];
  const siteName = config.siteName?.["zh-CN"] || "技术网";
  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="${esc(siteName)}首页">
        <span class="brand-mark" aria-hidden="true">记</span>
        <span class="brand-copy"><strong>${esc(siteName)}</strong><small>Inkstone / Technical Notes</small></span>
      </a>
      <nav class="site-nav" aria-label="主导航">
        ${links.map((item) => `<a href="${esc(item.href || "/")}"${current === item.href ? ' aria-current="page"' : ""}>${esc(item.label || item.key || "")}</a>`).join("")}
        <a href="/search/"${current === "/search/" ? ' aria-current="page"' : ""}>搜索</a>
      </nav>
    </div>
  </header>`;
}

function footerRecords() {
  const records = [];
  if (config.icp?.enable && config.icp.number) {
    records.push(`<a href="${esc(config.icp.link || "https://beian.miit.gov.cn/")}" target="_blank" rel="noopener noreferrer">${esc(config.icp.number)}</a>`);
  }
  if (config.psb?.enable && config.psb.number) {
    const href = config.psb.code
      ? `https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${encodeURIComponent(config.psb.code)}`
      : "https://www.beian.gov.cn/";
    const icon = config.psb.icon ? `<img src="${esc(config.psb.icon)}" alt="" loading="lazy" decoding="async">` : "";
    records.push(`<a class="psb-record" href="${href}" target="_blank" rel="noopener noreferrer">${icon}<span>${esc(config.psb.number)}</span></a>`);
  }
  return records.join('<span class="footer-sep">·</span>');
}

function buildConsentConfig() {
  const scripts = [];
  const cloudflare = theme.plugins?.analytics?.cloudflareWebAnalytics;
  if (cloudflare?.enabled && cloudflare?.src) {
    scripts.push({
      id: "cloudflare-web-analytics",
      category: cloudflare.consent || "analytics",
      src: cloudflare.src,
      defer: cloudflare.defer !== false,
      attrs: { "data-cf-beacon": JSON.stringify(cloudflare.beacon || {}) }
    });
  }
  return {
    storageKey: theme.consent?.storageKey || "inkstone-consent",
    revision: theme.consent?.revision || 1,
    categories: theme.consent?.categories || {},
    scripts
  };
}

function layout({ title, description, current = "", body, pageType = "page", type = "website" }) {
  const siteName = config.siteName?.["zh-CN"] || "技术网";
  const siteDescription = config.description?.["zh-CN"] || "";
  const fullTitle = title === siteName ? title : `${title} | ${siteName}`;
  const styles = [theme.style, ...themeFiles(theme.pageStyles, pageType)].filter(Boolean);
  const scripts = [
    ...(Array.isArray(theme.scripts) ? theme.scripts : theme.script ? [theme.script] : []),
    ...themeFiles(theme.pageScripts, pageType)
  ].filter(Boolean);
  const canonical = new URL(current || "/", config.siteUrl || "https://www.jsw.ac.cn").href;
  return `<!doctype html>
<html lang="${esc(config.defaultLocale || "zh-CN")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#f1eee5">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description || siteDescription)}">
  <meta property="og:type" content="${esc(type)}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description || siteDescription)}">
  <link rel="canonical" href="${esc(canonical)}">
  ${styles.map((file) => `<link rel="stylesheet" href="${asset(file)}">`).join("\n  ")}
  <link rel="icon" href="/favicon.ico">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="${esc(siteName)}">
</head>
<body data-page-type="${esc(pageType)}">
  <a class="skip-link" href="#main">跳到正文</a>
  ${nav(current)}
  ${body}
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand"><strong>${esc(siteName)}</strong><span>记录问题，也记录问题是怎样被解决的。</span></div>
      <div class="footer-meta">
        <span>© ${new Date().getFullYear()} ${esc(siteName)}</span>
        ${footerRecords()}
        <span class="footer-sep">·</span><a href="/feed.xml">RSS</a>
        <span class="footer-sep">·</span><a href="/sitemap.xml">Sitemap</a>
        <span class="footer-sep">·</span><button class="footer-consent" type="button" data-consent-open>隐私偏好</button>
      </div>
    </div>
  </footer>
  <script id="theme-consent-config" type="application/json">${JSON.stringify(buildConsentConfig()).replaceAll("</", "<\\/")}</script>
  ${scripts.map((file) => `<script src="${asset(file)}" defer></script>`).join("\n  ")}
</body>
</html>`;
}

async function writePage(url, html) {
  const relative = String(url || "/").replace(/^\/+|\/+$/g, "");
  const dir = relative ? path.join(outputDir, relative) : outputDir;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
}

function postCard(post, index = 0) {
  return `<article class="entry-card">
    <span class="entry-index">${String(index + 1).padStart(2, "0")}</span>
    <div class="entry-main">
      <p class="entry-meta"><time datetime="${esc(post.date)}">${esc(post.date)}</time><span>·</span><a href="/categories/${slugify(post.category)}/">${esc(post.category)}</a></p>
      <h3><a href="${esc(post.url)}">${esc(post.title)}</a></h3>
      <p class="entry-excerpt">${esc(post.description)}</p>
      <div class="tag-row">${post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">#${esc(tag)}</a>`).join("")}</div>
    </div>
    <a class="entry-arrow" href="${esc(post.url)}" aria-label="阅读 ${esc(post.title)}">↗</a>
  </article>`;
}

function postList(posts) {
  return `<div class="entry-list">${posts.length ? posts.map(postCard).join("\n") : '<p class="empty-state">这里暂时还没有内容。</p>'}</div>`;
}

function groupTerms(posts, field) {
  const map = new Map();
  for (const post of posts) {
    const values = field === "category" ? [post.category] : post.tags;
    for (const value of values) {
      if (!map.has(value)) map.set(value, []);
      map.get(value).push(post);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
}

function robotsTxt() {
  const lines = [];
  if (config.robots?.contentSignal) lines.push(`Content-Signal: ${config.robots.contentSignal}`, "");
  for (const rule of config.robots?.rules || [{ userAgent: "*", allow: ["/"] }]) {
    lines.push(`User-agent: ${rule.userAgent || "*"}`);
    for (const value of rule.allow || []) lines.push(`Allow: ${value}`);
    for (const value of rule.disallow || []) lines.push(`Disallow: ${value}`);
    lines.push("");
  }
  lines.push(`Sitemap: ${new URL("/sitemap.xml", config.siteUrl || "https://www.jsw.ac.cn").href}`, "");
  return lines.join("\n");
}

async function build() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await copyDir(staticDir, outputDir);
  await copyDir(themeDir, path.join(outputDir, "assets", "theme", themeName));

  const templates = {
    home: await readTemplate("home"),
    post: await readTemplate("post"),
    page: await readTemplate("page"),
    archive: await readTemplate("archive"),
    termsIndex: await readTemplate("terms-index"),
    termsPage: await readTemplate("terms-page"),
    search: await readTemplate("search"),
    notFound: await readTemplate("404")
  };

  const posts = await readEntries("posts");
  const pages = await readEntries("pages");
  const urls = new Set(["/", "/archives/", "/categories/", "/tags/", "/search/"]);
  const siteName = config.siteName?.["zh-CN"] || "技术网";
  const siteDescription = config.description?.["zh-CN"] || "";

  await writePage("/", layout({
    title: siteName,
    description: siteDescription,
    current: "/",
    pageType: "home",
    body: renderTemplate(templates.home, {
      siteName,
      description: siteDescription,
      postCount: posts.length,
      latestPosts: postList(posts.slice(0, Number(config.postsPerPage || 10)))
    })
  }));

  for (const post of posts) {
    urls.add(post.url);
    await writePage(post.url, layout({
      title: post.title,
      description: post.description,
      current: post.url,
      type: "article",
      pageType: "post",
      body: renderTemplate(templates.post, {
        title: post.title,
        description: post.description,
        date: post.date,
        updated: post.updated,
        category: post.category,
        categoryUrl: `/categories/${slugify(post.category)}/`,
        tags: post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">#${esc(tag)}</a>`).join(""),
        content: post.html
      })
    }));
  }

  for (const page of pages) {
    urls.add(page.url);
    await writePage(page.url, layout({
      title: page.title,
      description: page.description,
      current: page.url,
      pageType: "page",
      body: renderTemplate(templates.page, {
        title: page.title,
        content: page.html
      })
    }));
  }

  await writePage("/archives/", layout({
    title: "归档",
    current: "/archives/",
    pageType: "archive",
    body: renderTemplate(templates.archive, {
      title: "归档",
      count: posts.length,
      archiveList: posts.map((post) => `<li><time datetime="${esc(post.date)}">${esc(post.date)}</time><a href="${esc(post.url)}">${esc(post.title)}</a><span>${esc(post.category)}</span></li>`).join("")
    })
  }));

  for (const [field, title, base] of [["category", "分类", "/categories/"], ["tags", "标签", "/tags/"]]) {
    const terms = groupTerms(posts, field);
    await writePage(base, layout({
      title,
      current: base,
      pageType: "terms",
      body: renderTemplate(templates.termsIndex, {
        title,
        count: terms.length,
        terms: terms.map(([name, list]) => {
          const url = `${base}${slugify(name)}/`;
          urls.add(url);
          return `<li><a href="${url}"><span>${esc(name)}</span><strong>${list.length}</strong></a></li>`;
        }).join("")
      })
    }));
    for (const [name, list] of terms) {
      const url = `${base}${slugify(name)}/`;
      await writePage(url, layout({
        title: `${title}: ${name}`,
        current: base,
        pageType: "terms",
        body: renderTemplate(templates.termsPage, {
          title: name,
          count: list.length,
          postList: postList(list)
        })
      }));
    }
  }

  await writePage("/search/", layout({
    title: "搜索",
    current: "/search/",
    pageType: "search",
    body: renderTemplate(templates.search, { title: "搜索" })
  }));

  await fs.writeFile(
    path.join(outputDir, "search.json"),
    JSON.stringify(posts.map(({ title, description, url, date, category, tags, text }) => ({ title, description, url, date, category, tags, text })), null, 2)
  );

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls].map((url) => `<url><loc>${xml(new URL(url, config.siteUrl || "https://www.jsw.ac.cn").href)}</loc></url>`).join("")}</urlset>`;
  await fs.writeFile(path.join(outputDir, "sitemap.xml"), sitemap, "utf8");

  const feedTitle = config.feed?.title || siteName;
  const feed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(feedTitle)}</title><link>${xml(config.siteUrl || "")}</link><description>${xml(siteDescription)}</description>${posts.slice(0, 20).map((post) => `<item><title>${xml(post.title)}</title><link>${xml(new URL(post.url, config.siteUrl || "https://www.jsw.ac.cn").href)}</link><description>${xml(post.description)}</description><pubDate>${new Date(post.date).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
  await fs.writeFile(path.join(outputDir, "feed.xml"), feed, "utf8");
  await fs.writeFile(path.join(outputDir, "robots.txt"), robotsTxt(), "utf8");

  const notFound = layout({
    title: "404",
    pageType: "page",
    body: renderTemplate(templates.notFound, {})
  });
  await fs.writeFile(path.join(outputDir, "404.html"), notFound, "utf8");

  console.log(`Inkstone built ${posts.length} posts and ${pages.length} pages directly into public/.`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});