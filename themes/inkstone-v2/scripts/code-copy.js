(() => {
  const buttons = document.querySelectorAll("[data-code-copy]");

  async function writeText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.inset = "-9999px auto auto -9999px";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    if (!ok) throw new Error("copy failed");
  }

  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const shell = button.closest("[data-code-block]");
      const code = shell?.querySelector("pre code");
      const label = button.querySelector("[data-copy-label]");
      if (!code || !label || button.disabled) return;

      button.disabled = true;
      try {
        await writeText(code.textContent || "");
        button.classList.add("is-copied");
        label.textContent = "已复制";
        button.setAttribute("aria-label", "代码已复制");
      } catch {
        button.classList.add("is-error");
        label.textContent = "复制失败";
        button.setAttribute("aria-label", "复制失败");
      }

      window.setTimeout(() => {
        button.disabled = false;
        button.classList.remove("is-copied", "is-error");
        label.textContent = "复制";
        button.setAttribute("aria-label", "复制代码");
      }, 1600);
    });
  }
})();
