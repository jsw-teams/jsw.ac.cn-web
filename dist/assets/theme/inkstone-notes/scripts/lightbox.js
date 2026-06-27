const article = document.querySelector(".prose");

if (article) {
  const box = document.createElement("div");
  box.className = "image-lightbox";
  box.innerHTML = '<button type="button" aria-label="关闭">×</button><img alt="">';
  document.body.append(box);

  const preview = box.querySelector("img");
  const close = () => box.classList.remove("is-open");

  box.querySelector("button").addEventListener("click", close);
  box.addEventListener("click", (event) => {
    if (event.target === box) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  article.querySelectorAll("img").forEach((image) => {
    image.tabIndex = 0;
    image.addEventListener("click", () => {
      preview.src = image.currentSrc || image.src;
      preview.alt = image.alt || "";
      box.classList.add("is-open");
    });
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        image.click();
      }
    });
  });
}
