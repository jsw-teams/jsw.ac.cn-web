(() => {
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
}

function renderResult(post) {
  return `<article class="post-card">
    <h3><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h3>
    <p class="post-meta">${escapeHtml(post.date)} · ${escapeHtml(post.category)}</p>
    <p>${escapeHtml(post.description)}</p>
  </article>`;
}

async function initSearch() {
  const root = document.querySelector("[data-search-root]");
  const input = root?.querySelector("[data-search-input]");
  const results = root?.querySelector("[data-search-results]");
  const status = root?.querySelector("[data-search-status]");
  if (!root || !input || !results || !status) return;

  let data = [];
  try {
    const response = await fetch("/search.json", { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    status.textContent = "输入关键词后显示结果。";
  } catch {
    status.textContent = "搜索索引加载失败，请稍后刷新页面。";
    return;
  }

  const run = () => {
    const query = normalize(input.value);
    const tokens = query.split(" ").filter(Boolean);
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", input.value.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);

    if (!tokens.length) {
      status.textContent = "输入关键词后显示结果。";
      results.innerHTML = "";
      return;
    }

    const matches = data.filter((post) => {
      const haystack = normalize([post.title, post.description, post.category, (post.tags || []).join(" "), post.text].join(" "));
      return tokens.every((token) => haystack.includes(token));
    }).slice(0, 20);

    status.textContent = matches.length ? `找到 ${matches.length} 条结果。` : "没有找到匹配内容。";
    results.innerHTML = matches.map(renderResult).join("");
  };

  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) input.value = initialQuery;
  input.addEventListener("input", run);
  input.addEventListener("search", run);
  run();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearch, { once: true });
} else {
  initSearch();
}
})();
