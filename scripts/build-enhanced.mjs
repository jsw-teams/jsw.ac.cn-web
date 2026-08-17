import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

const root = process.cwd();
const distDir = path.join(root, "dist");
const contentDir = path.join(root, "content");

function splitFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) continue;
    data[item[1]] = item[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return { data, body: match[2] };
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

function codeBlock(content, info = "") {
  const language = codeLanguage(info);
  const label = language || "code";
  const className = language ? ` class="language-${language}"` : "";
  return `<div class="code-block" data-language="${md.utils.escapeHtml(label)}">
  <div class="code-block-toolbar"><span class="code-language">${md.utils.escapeHtml(label)}</span><button class="code-copy" type="button" data-code-copy aria-label="复制代码">复制</button></div>
  <pre><code${className}>${md.utils.escapeHtml(content)}</code></pre>
</div>\n`;
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

function renderMarkdown(source) {
  return md.render(String(source || ""), { headingIds: new Map() });
}

async function runBaseBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "build.mjs")], {
      cwd: root,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Base build exited with code ${code}`)));
  });
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function enhanceEntry(kind, slug) {
  const sourceFile = path.join(contentDir, kind, slug, "index.md");
  if (!(await exists(sourceFile))) return;
  const parsed = splitFrontmatter(await fs.readFile(sourceFile, "utf8"));
  if (String(parsed.data.draft).toLowerCase() === "true") return;

  const outputFile = kind === "posts"
    ? path.join(distDir, "post", slug, "index.html")
    : path.join(distDir, slug, "index.html");
  if (!(await exists(outputFile))) return;

  const document = await fs.readFile(outputFile, "utf8");
  const startToken = '<div class="prose">';
  const endToken = "</div>\n  </article>";
  const start = document.indexOf(startToken);
  const end = document.lastIndexOf(endToken);
  if (start < 0 || end < start) {
    throw new Error(`Unable to locate prose container in ${path.relative(root, outputFile)}`);
  }

  const rendered = renderMarkdown(parsed.body.trim());
  const next = `${document.slice(0, start + startToken.length)}\n${rendered}${document.slice(end)}`;
  await fs.writeFile(outputFile, next, "utf8");
}

async function enhanceKind(kind) {
  const base = path.join(contentDir, kind);
  if (!(await exists(base))) return;
  for (const entry of await fs.readdir(base, { withFileTypes: true })) {
    if (entry.isDirectory()) await enhanceEntry(kind, entry.name);
  }
}

await runBaseBuild();
await enhanceKind("posts");
await enhanceKind("pages");
console.log("Enhanced Markdown rendering for posts and pages.");
