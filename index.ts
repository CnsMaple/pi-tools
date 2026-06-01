/** pi-tools — 统一入口（并行加载 + 懒加载优化） */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// 智能抓取：代理工具注册，首次调用才载入 54MB wreq-js
function lazySmartFetch(pi: ExtensionAPI): void {
  let realExecutes: Map<string, Function> | null = null;
  let loading: Promise<void> | null = null;

  async function ensureLoaded(): Promise<Map<string, Function>> {
    if (realExecutes) return realExecutes;
    if (!loading) {
      loading = (async () => {
        const mod = await import("./pi-smart-fetch/dist/index.js");
        const captures = new Map<string, any>();
        mod.default({
          registerTool: (def: any) => captures.set(def.name, def),
        });
        realExecutes = new Map();
        for (const [name, def] of captures) {
          realExecutes.set(name, def.execute);
          pi.registerTool(def);
        }
      })();
    }
    await loading;
    return realExecutes!;
  }

  pi.registerTool({
    name: "web_fetch",
    label: "web_fetch",
    description: [
      "Fetch a URL with browser-grade TLS fingerprinting and extract clean, readable content.",
      "Uses wreq-js for browser-like TLS/HTTP2 impersonation and Defuddle for article extraction.",
      "Returns full metadata plus the extracted document to the agent while keeping the pi history preview brief.",
      "Does NOT execute JavaScript — use a browser automation tool for JS-heavy pages.",
    ].join(" "),
    promptSnippet:
      "web_fetch(url, browser?, os?, headers?, maxChars?, timeoutMs?, format?, removeImages?, includeReplies?, proxy?, verbose?): fetch browser-fingerprinted readable web content with full agent metadata and a compact pi preview",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "URL to fetch (http/https only)" },
        browser: { type: "string", description: 'Browser profile for TLS fingerprinting. Default: "chrome_145". Examples: chrome_145, firefox_147, safari_26, edge_145, opera_127' },
        os: { type: "string", description: 'OS profile for fingerprinting. Default: "windows". Options: windows, macos, linux, android, ios' },
        headers: { type: "object", additionalProperties: { type: "string" }, description: "Custom HTTP headers to send." },
        maxChars: { type: "number", description: "Maximum characters to return. Default: 50000" },
        timeoutMs: { type: "number", description: "Request timeout in milliseconds. Default: 15000" },
        format: { type: "string", enum: ["markdown", "html", "text", "json", "raw"], description: 'Output format. "markdown" (default), "html", "text", "json", or "raw"' },
        removeImages: { type: "boolean", description: "Strip image references from output. Default: false" },
        includeReplies: { description: "Include replies/comments: 'extractors' (default), true, false" },
        proxy: { type: "string", description: "Proxy URL (http://user:pass@host:port or socks5://host:port)" },
        verbose: { type: "boolean", description: "Compatibility flag. Default: false" },
      },
    },
    execute: async (...args: any[]) => {
      const execs = await ensureLoaded();
      return execs.get("web_fetch")!(...args);
    },
  });

  pi.registerTool({
    name: "batch_web_fetch",
    label: "batch_web_fetch",
    description: [
      "Fetch multiple URLs with browser-grade TLS fingerprinting and readable extraction.",
      "Each request accepts the same parameters as web_fetch and fans out with bounded concurrency.",
      "Returns full per-item metadata to the agent and streams compact per-item progress in the pi TUI.",
      "Does NOT execute JavaScript — use a browser automation tool for JS-heavy pages.",
    ].join(" "),
    promptSnippet:
      "batch_web_fetch(requests, verbose?): fetch multiple URLs concurrently with full agent metadata and per-item progress in the pi TUI",
    parameters: {
      type: "object",
      required: ["requests"],
      properties: {
        requests: {
          type: "array",
          minItems: 1,
          description: "Array of fetch requests. Each item accepts the same parameters as the single-item fetch tool.",
          items: {
            type: "object",
            required: ["url"],
            properties: {
              url: { type: "string", description: "URL to fetch (http/https only)" },
              browser: { type: "string" },
              os: { type: "string" },
              headers: { type: "object", additionalProperties: { type: "string" } },
              maxChars: { type: "number" },
              timeoutMs: { type: "number" },
              format: { type: "string", enum: ["markdown", "html", "text", "json", "raw"] },
              removeImages: { type: "boolean" },
              includeReplies: {},
              proxy: { type: "string" },
            },
          },
        },
        verbose: { type: "boolean", description: "Compatibility flag. Default: false" },
      },
    },
    execute: async (...args: any[]) => {
      const execs = await ensureLoaded();
      return execs.get("batch_web_fetch")!(...args);
    },
  });
}

export default async function (pi: ExtensionAPI): Promise<void> {
  // 并行加载全部插件模块（它们之间无共享依赖，可同时解析）
  const [mcpMod, cacheMod, planMod, retryMod, rtkMod, todoMod, contMod] = await Promise.all([
    import("./pi-mcp-adapter/index.ts"),
    import("./pi-cache-optimizer/index.ts"),
    import("./pi-plan-mode/src/plan-mode.ts"),
    import("./pi-retry/index.ts"),
    import("./pi-rtk/index.ts"),
    import("./rpiv-todo/index.ts"),
    import("./pi-continue/index.ts"),
  ]);

  // 依次初始化（注册 hook/tool，执行很快）
  mcpMod.default(pi);
  cacheMod.default(pi);
  planMod.default(pi);
  retryMod.default(pi);
  rtkMod.default(pi);
  todoMod.default(pi);
  contMod.default(pi);

  // 智能抓取 — 首次调用才加载重型依赖
  lazySmartFetch(pi);
}
