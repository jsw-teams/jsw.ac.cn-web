import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

const root = process.cwd();
const hexoRoot = process.env.HEXO_SOURCE
  ? path.resolve(process.env.HEXO_SOURCE)
  : "D:\\hexo\\cn-blog\\source";
const postsSource = path.join(hexoRoot, "_posts");
const contentDir = path.join(root, "content");
const staticDir = path.join(root, "static");

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s._-]+/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "post";
}

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

function listValue(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function normalizeDate(value) {
  const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : new Date().toISOString().slice(0, 10);
}

function summary(body, description) {
  if (description) return description;
  const source = body.split(/<!--\s*more\s*-->/i)[0] || body;
  const text = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 150 ? `${text.slice(0, 147)}...` : text;
}

function normalizeMarkdown(body) {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/<!--\s*more\s*-->/ig, "")
    .replace(/\n-{6,}\n/g, "\n\n---\n\n")
    .trim() + "\n";
}

async function copyDir(source, target) {
  if (!fss.existsSync(source)) return;
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === "robots.txt") continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

async function migratePosts() {
  const files = (await fs.readdir(postsSource)).filter((file) => file.endsWith(".md"));
  for (const file of files) {
    const slug = slugify(path.basename(file, ".md"));
    const raw = await fs.readFile(path.join(postsSource, file), "utf8");
    const { data, body } = splitFrontmatter(raw);
    const tags = listValue(data.tags);
    const category = listValue(data.categories)[0] || data.categories || "未分类";
    const outDir = path.join(contentDir, "posts", slug);
    await fs.mkdir(outDir, { recursive: true });
    const frontmatter = [
      "---",
      `title: ${yamlString(data.title || slug)}`,
      `date: ${yamlString(normalizeDate(data.date))}`,
      `updated: ${yamlString(normalizeDate(data.updated || data.date))}`,
      `description: ${yamlString(summary(body, data.description))}`,
      `category: ${yamlString(category)}`,
      `tags: [${tags.map(yamlString).join(", ")}]`,
      "draft: false",
      "---",
      ""
    ].join("\n");
    await fs.writeFile(path.join(outDir, "index.md"), frontmatter + normalizeMarkdown(body), "utf8");
  }
}

async function migratePages() {
  const pages = ["about", "privacy-policy", "tools"];
  for (const slug of pages) {
    const source = path.join(hexoRoot, slug, "index.md");
    if (!fss.existsSync(source)) continue;
    const raw = await fs.readFile(source, "utf8");
    const { data, body } = splitFrontmatter(raw);
    const outDir = path.join(contentDir, "pages", slug);
    await fs.mkdir(outDir, { recursive: true });
    const frontmatter = [
      "---",
      `title: ${yamlString(data.title || slug)}`,
      `date: ${yamlString(normalizeDate(data.date))}`,
      `description: ${yamlString(summary(body, data.description))}`,
      "---",
      ""
    ].join("\n");
    await fs.writeFile(path.join(outDir, "index.md"), frontmatter + normalizeMarkdown(body), "utf8");
  }
}

async function main() {
  await fs.mkdir(contentDir, { recursive: true });
  await fs.mkdir(staticDir, { recursive: true });
  await migratePosts();
  await migratePages();
  await copyDir(path.join(hexoRoot, "img"), path.join(staticDir, "img"));
  for (const file of ["favicon.ico", "apple-touch-icon.png", "edgeone.json"]) {
    const source = path.join(hexoRoot, file);
    if (fss.existsSync(source)) await fs.copyFile(source, path.join(staticDir, file));
  }
  console.log(`Migrated Hexo content from ${hexoRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
