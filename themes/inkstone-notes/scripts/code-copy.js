(() => {
  const COPY_LABEL = "复制";
  const COPIED_LABEL = "已复制";
  const FAILED_LABEL = "复制失败";

  function ensureButton(pre) {
    if (pre.closest(".code-block")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "code-block code-block-legacy";
    const toolbar = document.createElement("div");
    toolbar.className = "code-block-toolbar";
    const language = pre.querySelector("code")?.className.match(/language-([\w+.#-]+)/)?.[1] || "code";
    toolbar.innerHTML = `<span class="code-language">${language}</span><button class="code-copy" type="button" data-code-copy aria-label="复制代码">${COPY_LABEL}</button>`;
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(toolbar, pre);
  }

  async function copyCode(button) {
    const block = button.closest(".code-block");
    const code = block?.querySelector("pre code");
    if (!code) return;
    const text = code.textContent || "";
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        if (!ok) throw new Error("copy command failed");
      }
      button.textContent = COPIED_LABEL;
      button.dataset.state = "copied";
    } catch {
      button.textContent = FAILED_LABEL;
      button.dataset.state = "error";
    }
    window.setTimeout(() => {
      button.textContent = COPY_LABEL;
      delete button.dataset.state;
    }, 1600);
  }

  document.querySelectorAll(".prose pre").forEach(ensureButton);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-code-copy]");
    if (button) copyCode(button);
  });
})();
