(() => {
const configElement = document.getElementById("theme-consent-config");
const consentConfig = configElement ? JSON.parse(configElement.textContent || "{}") : {};
const categories = consentConfig.categories || {};
const storageKey = consentConfig.storageKey || "site-consent";
const revision = consentConfig.revision || 1;
const optionalCategoryKeys = Object.keys(categories).filter((key) => !categories[key].required);
const loadedScripts = new Set();
let lastFocusedElement = null;
let memoryConsent = null;

function storageGet() {
  try {
    return window.localStorage?.getItem(storageKey) || null;
  } catch {
    return memoryConsent;
  }
}

function storageSet(value) {
  memoryConsent = value;
  try {
    window.localStorage?.setItem(storageKey, value);
  } catch {
    // Ignore storage failures; the current page still receives the choice.
  }
}

function defaultState(value = false) {
  return Object.fromEntries(Object.keys(categories).map((key) => [key, categories[key].required ? true : value]));
}

function readConsent() {
  try {
    const saved = JSON.parse(storageGet() || "null");
    if (!saved || saved.revision !== revision || typeof saved.categories !== "object") return null;
    return { ...defaultState(false), ...saved.categories, necessary: true };
  } catch {
    return null;
  }
}

function writeConsent(state) {
  const normalized = { ...defaultState(false), ...state, necessary: true };
  storageSet(JSON.stringify({
    revision,
    categories: normalized,
    savedAt: new Date().toISOString()
  }));
  applyConsent(normalized);
}

function applyConsent(state) {
  document.documentElement.dataset.consent = "saved";
  for (const [key, value] of Object.entries(state)) {
    document.documentElement.dataset[`consent${key[0].toUpperCase()}${key.slice(1)}`] = value ? "granted" : "denied";
  }
  for (const item of consentConfig.scripts || []) {
    if (!state[item.category] || loadedScripts.has(item.id || item.src)) continue;
    const script = document.createElement("script");
    script.src = item.src;
    script.defer = item.defer !== false;
    for (const [name, value] of Object.entries(item.attrs || {})) {
      if (value != null) script.setAttribute(name, String(value));
    }
    document.head.append(script);
    loadedScripts.add(item.id || item.src);
  }
}

function categoryRows(state) {
  return Object.entries(categories).map(([key, category]) => {
    const checked = state[key] ? " checked" : "";
    const disabled = category.required ? " disabled" : "";
    const status = category.required ? "始终启用" : "可选";
    return `<label class="consent-category">
      <span>
        <strong>${escapeHtml(category.label || key)} · ${status}</strong>
        <span>${escapeHtml(category.description || "")}</span>
      </span>
      <span class="consent-switch">
        <input type="checkbox" data-consent-category="${escapeHtml(key)}"${checked}${disabled}>
        <span>${category.required ? "必要" : "允许"}</span>
      </span>
    </label>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function createConsentPanel(state = defaultState(false)) {
  let backdrop = document.querySelector(".consent-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "consent-backdrop";
    document.body.append(backdrop);
  }
  const existing = document.querySelector(".consent-panel");
  if (existing) existing.remove();
  const panel = document.createElement("section");
  panel.className = "consent-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "consent-title");
  panel.innerHTML = `
    <h2 id="consent-title">隐私与 Cookie 偏好</h2>
    <p>本站会加载必要脚本来提供页面、安全和偏好保存。统计、营销或共享类脚本默认关闭，只有在你明确同意后才会加载。</p>
    <p class="consent-note">你可以随时在页脚打开“隐私偏好”修改选择。营销/共享类别包含加州隐私法语境下的“出售或共享个人信息”相关用途；本站当前未启用该类别。</p>
    <div class="consent-categories">${categoryRows(state)}</div>
    <div class="consent-actions">
      <button type="button" data-consent-reject>拒绝可选</button>
      <button type="button" data-consent-save>保存选择</button>
      <button type="button" data-consent-accept>接受全部</button>
    </div>
  `;
  document.body.append(panel);
  panel.querySelector("[data-consent-reject]").addEventListener("click", () => {
    writeConsent(defaultState(false));
    closeConsentPanel(panel, backdrop);
  });
  panel.querySelector("[data-consent-accept]").addEventListener("click", () => {
    writeConsent(defaultState(true));
    closeConsentPanel(panel, backdrop);
  });
  panel.querySelector("[data-consent-save]").addEventListener("click", () => {
    const next = defaultState(false);
    panel.querySelectorAll("[data-consent-category]").forEach((input) => {
      next[input.dataset.consentCategory] = input.checked;
    });
    writeConsent(next);
    closeConsentPanel(panel, backdrop);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  return panel;
}

function openConsentPanel(state, blocking = false) {
  lastFocusedElement = document.activeElement;
  const panel = createConsentPanel(state);
  const backdrop = document.querySelector(".consent-backdrop");
  panel.classList.add("is-open");
  backdrop?.classList.add("is-open");
  document.body.classList.add("consent-modal-open");
  document.body.dataset.consentBlocking = blocking ? "true" : "false";
  setPageInert(true);
  panel.querySelector("[data-consent-reject]")?.focus();
  return panel;
}

function closeConsentPanel(panel, backdrop) {
  panel.classList.remove("is-open");
  backdrop?.classList.remove("is-open");
  document.body.classList.remove("consent-modal-open");
  delete document.body.dataset.consentBlocking;
  setPageInert(false);
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function setPageInert(value) {
  document.querySelectorAll("body > *:not(.consent-panel):not(.consent-backdrop)").forEach((element) => {
    if (value) {
      element.setAttribute("aria-hidden", "true");
      element.inert = true;
    } else {
      element.removeAttribute("aria-hidden");
      element.inert = false;
    }
  });
}

const saved = readConsent();
if (saved) {
  applyConsent(saved);
} else {
  openConsentPanel(defaultState(false), true);
}

document.querySelector("[data-consent-open]")?.addEventListener("click", () => {
  openConsentPanel(readConsent() || defaultState(false), false);
});
})();
