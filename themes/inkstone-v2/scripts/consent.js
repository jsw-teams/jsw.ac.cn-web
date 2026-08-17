(() => {
  const configNode = document.getElementById("theme-consent-config");
  const config = configNode ? JSON.parse(configNode.textContent || "{}") : {};
  const categories = config.categories || {};
  const key = config.storageKey || "inkstone-consent";
  const revision = Number(config.revision || 1);
  const loaded = new Set();

  function defaults(value = false) {
    return Object.fromEntries(Object.entries(categories).map(([name, item]) => [name, item.required ? true : value]));
  }

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (!saved || saved.revision !== revision) return null;
      return { ...defaults(false), ...(saved.categories || {}) };
    } catch {
      return null;
    }
  }

  function loadScripts(state) {
    for (const item of config.scripts || []) {
      const id = item.id || item.src;
      if (!state[item.category] || loaded.has(id)) continue;
      const script = document.createElement("script");
      script.src = item.src;
      script.defer = item.defer !== false;
      for (const [name, value] of Object.entries(item.attrs || {})) {
        if (value != null) script.setAttribute(name, String(value));
      }
      document.head.append(script);
      loaded.add(id);
    }
  }

  function save(state) {
    const next = { ...defaults(false), ...state };
    try {
      localStorage.setItem(key, JSON.stringify({ revision, categories: next, savedAt: new Date().toISOString() }));
    } catch {}
    loadScripts(next);
    document.querySelector("[data-consent-ui]")?.remove();
  }

  function rows(state) {
    return Object.entries(categories).map(([name, item]) => `
      <label class="consent-row">
        <span><strong>${item.label || name}</strong><small>${item.description || ""}</small></span>
        <input type="checkbox" data-consent-category="${name}" ${state[name] ? "checked" : ""} ${item.required ? "disabled" : ""}>
      </label>`).join("");
  }

  function openSettings(state) {
    document.querySelector("[data-consent-ui]")?.remove();
    const layer = document.createElement("div");
    layer.className = "consent-layer";
    layer.dataset.consentUi = "";
    layer.innerHTML = `<section class="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div class="consent-dialog-head"><div><span>PRIVACY</span><h2 id="consent-title">隐私偏好</h2></div><button type="button" data-consent-close aria-label="关闭">×</button></div>
      <p>必要功能始终启用；其他类别只有在你选择允许后才会加载。</p>
      <div class="consent-rows">${rows(state)}</div>
      <div class="consent-actions">
        <button type="button" class="button-quiet" data-consent-reject>仅必要</button>
        <button type="button" class="button-primary" data-consent-save>保存选择</button>
      </div>
    </section>`;
    document.body.append(layer);
    layer.querySelector("[data-consent-close]").addEventListener("click", () => layer.remove());
    layer.querySelector("[data-consent-reject]").addEventListener("click", () => save(defaults(false)));
    layer.querySelector("[data-consent-save]").addEventListener("click", () => {
      const next = defaults(false);
      layer.querySelectorAll("[data-consent-category]").forEach((input) => {
        next[input.dataset.consentCategory] = input.checked;
      });
      save(next);
    });
  }

  function openBanner() {
    const banner = document.createElement("aside");
    banner.className = "consent-banner";
    banner.dataset.consentUi = "";
    banner.innerHTML = `<div><strong>隐私偏好</strong><p>统计功能默认关闭。你可以只保留必要功能，也可以自行选择。</p></div>
      <div class="consent-banner-actions">
        <button type="button" class="button-quiet" data-consent-settings>设置</button>
        <button type="button" class="button-quiet" data-consent-reject>仅必要</button>
        <button type="button" class="button-primary" data-consent-accept>全部允许</button>
      </div>`;
    document.body.append(banner);
    banner.querySelector("[data-consent-settings]").addEventListener("click", () => openSettings(defaults(false)));
    banner.querySelector("[data-consent-reject]").addEventListener("click", () => save(defaults(false)));
    banner.querySelector("[data-consent-accept]").addEventListener("click", () => save(defaults(true)));
  }

  const saved = read();
  if (saved) loadScripts(saved);
  else openBanner();

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-consent-open]")) openSettings(read() || defaults(false));
  });
})();
