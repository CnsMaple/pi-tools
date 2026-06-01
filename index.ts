/**
 * pi-tools — 统一入口，带按需懒加载优化
 *
 * 环境变量控制：
 *   PI_NO_SMART_FETCH=1     跳过智能抓取（省 54MB wreq-js + 4.5MB deps）
 *   PI_NO_CACHE_OPTIMIZER=1 跳过缓存优化（省每个请求的 prompt 改写开销）
 *   PI_NO_RTK=1             跳过 token 缩减（省每个 tool_result 的过滤开销）
 *   PI_NO_PLAN_MODE=1       跳过计划模式
 *   PI_NO_RETRY=1           跳过自动重试
 *   PI_NO_TODO=1            跳过任务看板
 *   PI_NO_MCP=1             跳过 MCP 适配器
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── 轻量插件：直接加载 ──────────────────────────────────

import mcpAdapter from "./pi-tidy-mcp-adapter/index.ts";
import planMode from "./pi-plan-mode/src/plan-mode.ts";
import piRetry from "./pi-retry/index.ts";
import cacheOptimizer from "./pi-cache-optimizer/index.ts";
import rtk from "./pi-rtk/index.ts";
import todo from "./rpiv-todo/index.ts";

// ── 重型插件（smart-fetch）：首次调用才载入 54MB wreq-js ────

function lazySmartFetch(pi: ExtensionAPI): void {
  if (process.env.PI_NO_SMART_FETCH) return;

  // 首次调用时加载真实模块，用 stub pi 捕获真实 tool 定义后替换
  let realExecutes: Map<string, Function> | null = null;
  let loading: Promise<void> | null = null;

  async function ensureLoaded(): Promise<Map<string, Function>> {
    if (realExecutes) return realExecutes;
    if (!loading) {
      loading = (async () => {
        const mod = await import("./pi-smart-fetch/dist/index.js");
        const captures = new Map<string, any>();
        // 给真实插件一个 stub pi，只捕获 registerTool 调用
        mod.default({
          registerTool: (def: any) => captures.set(def.name, def),
        });
        // 用真实定义覆盖代理工具
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

  // web_fetch 代理
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

  // batch_web_fetch 代理
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

// ── 入口 ────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  // 全部同步加载，必须在事件触发前完成 handler 注册
  if (!process.env.PI_NO_MCP) mcpAdapter(pi);
  if (!process.env.PI_NO_CACHE_OPTIMIZER) cacheOptimizer(pi);
  if (!process.env.PI_NO_PLAN_MODE) planMode(pi);
  if (!process.env.PI_NO_RETRY) piRetry(pi);
  if (!process.env.PI_NO_RTK) rtk(pi);
  if (!process.env.PI_NO_TODO) todo(pi);

  // 重型插件（工具懒加载，首次调用才导入 54MB wreq-js）
  lazySmartFetch(pi);
}
