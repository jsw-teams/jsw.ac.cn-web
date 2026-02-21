export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 有些场景 Host 以 header 为准更稳
  const host = (req.headers.get("host") || url.hostname || "").toLowerCase();

  // 只在 www 命中时重定向，避免循环
  if (host === "www.jsw.ac.cn") {
    url.hostname = "jsw.ac.cn";
    url.protocol = "https:"; // 强制 https
    // url.pathname / url.search 会自动保留，所以路径与查询参数都会带过去
    return Response.redirect(url.toString(), 301);
  }

  // 其他请求照常走 Pages 静态资源/路由
  return context.next();
}