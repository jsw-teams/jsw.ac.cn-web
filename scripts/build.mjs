import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = normalizeConfig(await fs.readFile(path.join(root, "config.yml"), "utf8"));
const contentDir = path.join(root, "content");
const staticDir = path.join(root, "static");
const themeDir = path.join(root, "themes", config.theme.name);
const theme = JSON.parse(await fs.readFile(path.join(themeDir, "theme.json"), "utf8"));
const distDir = path.join(root, "dist");

function readScalar(raw, key, fallback = "") {
  const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : fallback;
}

function readLocalized(raw, key, locale, fallback = "") {
  const match = raw.match(new RegExp(`^${key}:\\s*\\n(?:\\s+[^\\n]+\\n)*?\\s+${locale}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : fallback;
}

function readNav(raw) {
  const block = raw.match(/^nav:\s*\n([\s\S]*?)(?=^\S|\Z)/m)?.[1] || "";
  const items = [];
  for (const item of block.split(/\n\s*-\s+key:\s+/).slice(1)) {
    const key = item.match(/^([^\n]+)/)?.[1]?.trim() || "";
    const href = item.match(/\n\s+href:\s*(.+)/)?.[1]?.trim() || "/";
    const label = item.match(/\n\s+label:\s*(.+)/)?.[1]?.trim() || key;
    items.push({ key, href, label });
  }
  return items;
}

function readRobots(raw) {
  const block = raw.match(/^robots:\s*\n([\s\S]*?)(?=^\S|\Z)/m)?.[1] || "";
  const contentSignal = block.match(/^\s+contentSignal:\s*(.+)$/m)?.[1]?.trim() || "";
  return {
    contentSignal,
    rules: [{ userAgent: "*", allow: ["/"], disallow: [] }]
  };
}

function readSection(raw, key) {
  return raw.match(new RegExp(`^${key}:\\s*\\n([\\s\\S]*?)(?=^\\S|\\Z)`, "m"))?.[1] || "";
}

function readSectionValue(raw, section, key, fallback = "") {
  const block = readSection(raw, section);
  const value = block.match(new RegExp(`^\\s+${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return value ? value.replace(/^['"]|['"]$/g, "") : fallback;
}

function readSectionBool(raw, section, key, fallback = false) {
  const value = readSectionValue(raw, section, key, String(fallback));
  return /^(true|yes|on|1)$/i.test(value);
}

function normalizeConfig(raw) {
  return {
    siteUrl: readScalar(raw, "siteUrl", "https://www.jsw.ac.cn"),
    siteName: readLocalized(raw, "siteName", "zh-CN", "技术网"),
    description: readLocalized(raw, "description", "zh-CN", ""),
    author: readLocalized(raw, "author", "zh-CN", ""),
    language: readScalar(raw, "defaultLocale", "zh-CN"),
    theme: {
      name: raw.match(/^theme:\s*\n\s+name:\s*(.+)$/m)?.[1]?.trim() || "inkstone-notes"
    },
    postsPerPage: Number(readScalar(raw, "postsPerPage", "10")) || 10,
    nav: readNav(raw),
    robots: readRobots(raw),
    icp: {
      enable: readSectionBool(raw, "icp", "enable"),
      number: readSectionValue(raw, "icp", "number"),
      link: readSectionValue(raw, "icp", "link", "https://beian.miit.gov.cn/")
    },
    psb: {
      enable: readSectionBool(raw, "psb", "enable"),
      number: readSectionValue(raw, "psb", "number"),
      code: readSectionValue(raw, "psb", "code"),
      icon: readSectionValue(raw, "psb", "icon", "/img/ghs.png")
    },
    feed: {
      title: raw.match(/^feed:\s*\n\s+title:\s*(.+)$/m)?.[1]?.trim() || "技术网"
    }
  };
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asset(file) {
  return `/assets/theme/${config.theme.name}/${String(file).replace(/^\/+/, "")}`;
}

function slugify(value) {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase().normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return /^[a-z0-9][a-z0-9-]*$/i.test(normalized) ? normalized : encodeURIComponent(text);
}

function splitFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) continue;
    let value = item[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    } else {
      value = value.replace(/^['"]|['"]$/g, "");
    }
    data[item[1]] = value;
  }
  return { data, body: match[2] };
}

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isStandaloneImage(line) {
  return /^!\[[^\]]*]\([^)]+\)\s*$/.test(line.trim());
}

function isRawHtmlLine(line) {
  return /^<\/?(?:div|span|p|br|img|figure|figcaption|iframe|video|audio|table|thead|tbody|tr|td|th|details|summary)\b/i.test(line.trim());
}

function jsonScript(value) {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}

function markdown(markdownText) {
  const lines = markdownText.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = [];
  let orderedList = [];
  let orderedStart = 1;
  let code = [];
  let codeIndent = 0;
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  const flushOrderedList = () => {
    if (orderedList.length) {
      const start = orderedStart > 1 ? ` start="${orderedStart}"` : "";
      out.push(`<ol${start}>${orderedList.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`);
    }
    orderedList = [];
    orderedStart = 1;
  };
  const flushCode = () => {
    if (code.length) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
    code = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
        codeIndent = 0;
      } else {
        flushParagraph();
        flushList();
        flushOrderedList();
        inCode = true;
        codeIndent = line.match(/^(\s*)```/)?.[1].length || 0;
      }
      continue;
    }
    if (inCode) {
      code.push(line.startsWith(" ".repeat(codeIndent)) ? line.slice(codeIndent) : line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushOrderedList();
      continue;
    }
    if (isRawHtmlLine(line)) {
      flushParagraph();
      flushList();
      flushOrderedList();
      out.push(line.trim());
      continue;
    }
    if (isStandaloneImage(line)) {
      flushParagraph();
      flushList();
      flushOrderedList();
      out.push(`<p class="image-block">${inline(line.trim())}</p>`);
      continue;
    }
    if (lines[index + 1] && isTableDivider(lines[index + 1])) {
      flushParagraph();
      flushList();
      flushOrderedList();
      const headers = splitTableRow(line);
      const rows = [];
      let offset = index + 2;
      while (offset < lines.length && /\|/.test(lines[offset]) && lines[offset].trim()) {
        rows.push(splitTableRow(lines[offset]));
        offset += 1;
      }
      out.push(`<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      index = offset - 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushOrderedList();
      out.push("<hr>");
      continue;
    }
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushOrderedList();
      const level = heading[1].length;
      out.push(`<h${level} id="${slugify(heading[2])}">${inline(heading[2])}</h${level}>`);
      continue;
    }
    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      flushOrderedList();
      out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushOrderedList();
      list.push(bullet[1]);
      continue;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushList();
      if (!orderedList.length) orderedStart = Number(ordered[1]) || 1;
      orderedList.push(ordered[2]);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushOrderedList();
  if (inCode) flushCode();
  return out.join("\n");
}

async function copyDir(from, to) {
  if (!fss.existsSync(from)) return;
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
  if (!fss.existsSync(base)) return [];
  const entries = [];
  for (const slug of await fs.readdir(base)) {
    const file = path.join(base, slug, "index.md");
    if (!fss.existsSync(file)) continue;
    const raw = await fs.readFile(file, "utf8");
    const parsed = splitFrontmatter(raw);
    if (parsed.data.draft === "true") continue;
    const body = parsed.body.trim();
    entries.push({
      slug,
      title: parsed.data.title || slug,
      description: parsed.data.description || body.replace(/[#>*_`~|-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150),
      date: String(parsed.data.date || "1970-01-01").slice(0, 10),
      updated: String(parsed.data.updated || parsed.data.date || "1970-01-01").slice(0, 10),
      category: parsed.data.category || "未分类",
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
      html: markdown(body),
      text: body.replace(/\s+/g, " "),
      url: kind === "posts" ? `/post/${slug}/` : `/${slug}/`
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

async function readTemplate(name) {
  const file = path.join(themeDir, theme.templates || "templates", `${name}.html`);
  return fs.readFile(file, "utf8");
}

function renderTemplate(source, data) {
  return source
    .replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, key) => data[key] ?? "")
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => esc(data[key] ?? ""));
}

function nav(current = "") {
  return `<header class="site-header">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">记</span><span>${esc(config.siteName)}</span></a>
    <nav class="site-nav" aria-label="主导航">
      ${config.nav.map((item) => `<a href="${item.href}"${current === item.href ? ' aria-current="page"' : ""}>${esc(item.label)}</a>`).join("")}
      <a href="/search/"${current === "/search/" ? ' aria-current="page"' : ""}>搜索</a>
    </nav>
  </header>`;
}

function themeFiles(map, key) {
  const value = map?.[key] || [];
  return Array.isArray(value) ? value : [value];
}

function footerRecords() {
  const records = [];
  if (config.icp.enable && config.icp.number) {
    records.push(`<a href="${esc(config.icp.link)}" target="_blank" rel="noopener noreferrer">${esc(config.icp.number)}</a>`);
  }
  if (config.psb.enable && config.psb.number) {
    const href = config.psb.code
      ? `https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${encodeURIComponent(config.psb.code)}`
      : "https://www.beian.gov.cn/";
    const icon = config.psb.icon ? `<img src="${esc(config.psb.icon)}" alt="" loading="lazy" decoding="async">` : "";
    records.push(`<a class="psb-record" href="${href}" target="_blank" rel="noopener noreferrer">${icon}<span>${esc(config.psb.number)}</span></a>`);
  }
  return records.length ? `<span class="footer-records">${records.join(" · ")}</span>` : "";
}

function layout({ title, description, current = "", body, type = "website", pageType = "", extraStyles = [], extraScripts = [] }) {
  const fullTitle = title === config.siteName ? title : `${title} | ${config.siteName}`;
  const styleFiles = [
    theme.style,
    ...themeFiles(theme.featureStyles, "consent"),
    ...themeFiles(theme.pageStyles, pageType),
    ...extraStyles
  ].filter(Boolean);
  const scriptFiles = [
    theme.script,
    ...themeFiles(theme.pageScripts, pageType),
    ...extraScripts
  ].filter(Boolean);
  return `<!doctype html>
<html lang="${config.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description || config.description)}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description || config.description)}">
  <link rel="canonical" href="${new URL(current || "/", config.siteUrl).href}">
  ${styleFiles.map((file) => `<link rel="stylesheet" href="${asset(file)}">`).join("\n  ")}
  <link rel="icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/img/favicon/favicon-16x16.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="${esc(config.siteName)}">
</head>
<body data-page-type="${esc(pageType)}">
  <a class="skip-link" href="#main">跳到正文</a>
  ${nav(current)}
  ${body}
  <footer class="site-footer">
    <span class="footer-identity">© ${new Date().getFullYear()} ${esc(config.siteName)}${footerRecords()}</span>
    <span><a href="/feed.xml">订阅</a> · <a href="/sitemap.xml">站点地图</a> · <a href="/privacy-policy/">隐私政策</a> · <button class="footer-consent-button" type="button" data-consent-open>隐私偏好</button></span>
  </footer>
  <script id="theme-consent-config" type="application/json">${jsonScript(buildConsentConfig())}</script>
  ${scriptFiles.map((file) => `<script src="${asset(file)}" defer></script>`).join("\n  ")}
</body>
</html>`;
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
      attrs: {
        "data-cf-beacon": JSON.stringify(cloudflare.beacon || {})
      }
    });
  }
  return {
    storageKey: theme.consent?.storageKey || "site-consent",
    revision: theme.consent?.revision || 1,
    categories: theme.consent?.categories || {},
    scripts
  };
}

async function writePage(url, html) {
  const file = path.join(distDir, url, "index.html");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, "utf8");
}

function postCard(post) {
  const tags = post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">${esc(tag)}</a>`).join("");
  return `<article class="post-card">
    <h3><a href="${post.url}">${esc(post.title)}</a></h3>
    <p class="post-meta">${esc(post.date)} · <a href="/categories/${slugify(post.category)}/">${esc(post.category)}</a></p>
    <p>${esc(post.description)}</p>
    <div class="tag-row">${tags}</div>
  </article>`;
}

function postList(posts) {
  return `<div class="post-list">${posts.map(postCard).join("\n") || '<p class="post-meta">暂无文章。</p>'}</div>`;
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
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await copyDir(staticDir, distDir);
  await copyDir(themeDir, path.join(distDir, "assets", "theme", config.theme.name));

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

  await writePage("/", layout({
    title: config.siteName,
    description: config.description,
    current: "/",
    pageType: "home",
    body: renderTemplate(templates.home, {
      siteName: config.siteName,
      description: config.description,
      latestPosts: "最新笔记",
      archiveUrl: "/archives/",
      mascotPng: asset(theme.assets?.mascot?.png || "source-assets/jie-paopao-mascot.png"),
      mascotWebp: asset(theme.assets?.mascot?.webp || "source-assets/jie-paopao-mascot.webp"),
      postList: postList(posts.slice(0, config.postsPerPage || 10))
    })
  }));

  for (const post of posts) {
    await writePage(post.url, layout({
      title: post.title,
      description: post.description,
      current: post.url,
      type: "article",
      pageType: "post",
      extraStyles: themeFiles(theme.featureStyles, "lightbox"),
      body: renderTemplate(templates.post, {
        title: post.title,
        description: post.description,
        date: post.date,
        category: post.category,
        categoryUrl: `/categories/${slugify(post.category)}/`,
        tags: post.tags.map((tag) => `<a href="/tags/${slugify(tag)}/">${esc(tag)}</a>`).join(""),
        content: post.html
      })
    }));
  }

  for (const page of pages) {
    await writePage(page.url, layout({
      title: page.title,
      description: page.description,
      current: page.url,
      pageType: "page",
      body: renderTemplate(templates.page, {
        title: page.title,
        description: page.description,
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
      archiveList: posts.map((post) => `<li><time datetime="${post.date}">${post.date}</time><a href="${post.url}">${esc(post.title)}</a></li>`).join("")
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
        terms: terms.map(([name, list]) => `<li><a href="${base}${slugify(name)}/"><span>${esc(name)}</span><strong>${list.length}</strong></a></li>`).join("")
      })
    }));
    for (const [name, list] of terms) {
      await writePage(`${base}${slugify(name)}/`, layout({
        title: `${title}: ${name}`,
        current: base,
        pageType: "terms",
        body: renderTemplate(templates.termsPage, {
          title: name,
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
  await fs.writeFile(path.join(distDir, "search.json"), JSON.stringify(posts.map(({ title, description, url, date, category, tags, text }) => ({ title, description, url, date, category, tags, text })), null, 2));

  const urls = ["/", "/archives/", "/categories/", "/tags/", "/search/", ...pages.map((p) => p.url), ...posts.map((p) => p.url)];
  await fs.writeFile(path.join(distDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${new URL(url, config.siteUrl).href}</loc></url>`).join("")}</urlset>`);
  await fs.writeFile(path.join(distDir, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(config.feed.title || config.siteName)}</title><link>${config.siteUrl}</link><description>${esc(config.description)}</description>${posts.slice(0, 20).map((post) => `<item><title>${esc(post.title)}</title><link>${new URL(post.url, config.siteUrl).href}</link><description>${esc(post.description)}</description><pubDate>${new Date(post.date).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`);
  await fs.writeFile(path.join(distDir, "404.html"), layout({
    title: "404",
    pageType: "page",
    body: renderTemplate(templates.notFound, {})
  }));
  await fs.writeFile(path.join(distDir, "robots.txt"), buildRobotsTxt());
  console.log(`Built ${posts.length} posts and ${pages.length} pages into dist/`);
}

function buildRobotsTxt() {
  const lines = [];
  if (config.robots.contentSignal) {
    lines.push(`Content-Signal: ${config.robots.contentSignal}`, "");
  }
  for (const rule of config.robots.rules) {
    lines.push(`User-agent: ${rule.userAgent || "*"}`);
    for (const value of rule.allow || []) lines.push(`Allow: ${value}`);
    for (const value of rule.disallow || []) lines.push(`Disallow: ${value}`);
    lines.push("");
  }
  lines.push(`Sitemap: ${new URL("/sitemap.xml", config.siteUrl).href}`, "");
  return lines.join("\n");
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
