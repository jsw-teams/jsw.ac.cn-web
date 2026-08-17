(() => {
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  const normalize = (value) => String(value || "").toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();

  function card(post, index) {
    return `<article class="entry-card">
      <span class="entry-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="entry-main">
        <p class="entry-meta"><time>${escapeHtml(post.date)}</time><span>·</span><span>${escapeHtml(post.category)}</span></p>
        <h3><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h3>
        <p class="entry-excerpt">${escapeHtml(post.description)}</p>
      </div>
      <a class="entry-arrow" href="${escapeHtml(post.url)}" aria-label="阅读 ${escapeHtml(post.title)}">↗</a>
    </article>`;
  }

  async function init() {
    const root = document.querySelector("[data-search-root]");
    const input = root?.querySelector("[data-search-input]");
    const status = root?.querySelector("[data-search-status]");
    const results = root?.querySelector("[data-search-results]");
    if (!root || !input || !status || !results) return;

    let data = [];
    try {
      const response = await fetch("/search.json", { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      data = await response.json();
      status.textContent = "输入关键词开始检索。";
    } catch {
      status.textContent = "搜索索引加载失败。";
      return;
    }

    const run = () => {
      const query = normalize(input.value);
      const tokens = query.split(" ").filter(Boolean);
      const url = new URL(location.href);
      query ? url.searchParams.set("q", input.value.trim()) : url.searchParams.delete("q");
      history.replaceState(null, "", url);

      if (!tokens.length) {
        results.innerHTML = "";
        status.textContent = "输入关键词开始检索。";
        return;
      }

      const matches = data.filter((post) => {
        const haystack = normalize([
          post.title, post.description, post.category,
          ...(post.tags || []), post.text
        ].join(" "));
        return tokens.every((token) => haystack.includes(token));
      }).slice(0, 24);

      status.textContent = matches.length ? `找到 ${matches.length} 条结果。` : "没有找到匹配内容。";
      results.innerHTML = matches.map(card).join("");
    };

    const initial = new URLSearchParams(location.search).get("q");
    if (initial) input.value = initial;
    input.addEventListener("input", run);
    input.addEventListener("search", run);
    run();
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();
})();
