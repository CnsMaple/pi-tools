/**
 * mcp-widget.ts — MCP 面板的 aboveEditor widget 封装
 *
 * 替换原本的 modal overlay（ctx.ui.custom），改为注册为
 * ctx.ui.setWidget + 键盘路由。
 *
 * 注意：onTerminalInput 在全局只注册一次，通过 panelActive 开关控制。
 */

import { matchesKey } from "@mariozechner/pi-tui";
import type { ExtensionCommandContext, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { McpConfig, McpPanelCallbacks, McpPanelResult, ServerProvenance } from "./types.js";
import type { MetadataCache } from "./metadata-cache.js";
import { writeMcpToolsConfig } from "./config.js";

const WIDGET_KEY = "mcp-panel";

// 模块级状态 — 保证 onTerminalInput 只注册一次
let panelActive = false;
let panelInstance: any = null;
let currentCtx: ExtensionCommandContext | null = null;
let terminalHandlerRegistered = false;
let tuiRequestRender: (() => void) | null = null;

function ensureTerminalHandler(ctx: ExtensionCommandContext): void {
  if (terminalHandlerRegistered) return;
  terminalHandlerRegistered = true;

  ctx.ui.onTerminalInput((data: string) => {
    if (!panelActive || !panelInstance) return;

    // 关闭快捷键由外层处理
    if (matchesKey(data, "ctrl+s")) {
      // save & close
      const result = panelInstance.buildResult();
      if (!result.cancelled && (result.changes.size > 0 || result.disabledToolsChanges.size > 0)) {
        // 需要 provenanceMap 和 config，从 panelInstance 取
        panelInstance._closeAndSave?.(result);
      }
      closeWidget();
      return { consume: true };
    }

    if (matchesKey(data, "ctrl+c")) {
      closeWidget();
      return { consume: true };
    }

    panelInstance.handleInput(data);
    // widget 不会像 overlay 那样自动重绘，需要手动触发
    tuiRequestRender?.();
    return { consume: true };
  });
}

function closeWidget(): void {
  if (!panelActive) return;
  panelActive = false;
  panelInstance?.dispose();
  panelInstance = null;
  tuiRequestRender = null;
  currentCtx?.ui.setWidget(WIDGET_KEY, undefined);
}

export async function toggleMcpWidget(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  state: any,
  config: McpConfig,
  cache: MetadataCache | null,
  provenanceMap: Map<string, ServerProvenance>,
): Promise<void> {
  if (panelActive) {
    closeWidget();
    return;
  }

  const { McpPanel } = await import("./mcp-panel.js");

  currentCtx = ctx;
  ensureTerminalHandler(ctx);

  const callbacks: McpPanelCallbacks = {
    reconnect: async (name: string) => {
      try {
        await state.manager?.connect(name, config.mcpServers[name]);
        state.failureTracker?.delete(name);
        return true;
      } catch {
        state.failureTracker?.set(name, Date.now());
        return false;
      }
    },
    cancelConnect: (name: string) => state.manager?.cancelConnect(name),
    getConnectionStatus: (name: string) => {
      const m = state.manager;
      if (!m) return "idle";
      if (m.isConnecting(name)) return "connecting";
      if (m.getConnection(name)) return "connected";
      const age = state.failureTracker?.get(name);
      return age && Date.now() - age < 30000 ? "failed" : "idle";
    },
    refreshCacheAfterReconnect: () => null,
    getFailureRetryAfterSeconds: (name: string) => {
      const age = state.failureTracker?.get(name);
      return age ? Math.max(0, Math.ceil((30000 - (Date.now() - age)) / 1000)) : null;
    },
  };

  panelActive = true;

  panelInstance = new McpPanel(
    config, cache, provenanceMap, callbacks,
    { requestRender: () => tuiRequestRender?.() },
    (result: McpPanelResult) => {
      // panel 主动关闭（超时、discard 等）
      if (!result.cancelled && (result.changes.size > 0 || result.disabledToolsChanges.size > 0)) {
        writeMcpToolsConfig(result.changes, result.disabledToolsChanges, provenanceMap, config);
        ctx.ui.notify("Tools config updated. Restart pi to apply.", "info");
      }
      closeWidget();
    },
  );

  // 暴露 buildResult / close 给 terminal handler
  panelInstance._closeAndSave = (result: McpPanelResult) => {
    writeMcpToolsConfig(result.changes, result.disabledToolsChanges, provenanceMap, config);
    ctx.ui.notify("Tools config updated. Restart pi to apply.", "info");
  };

  ctx.ui.setWidget(
    WIDGET_KEY,
    (tui, _theme) => {
      tuiRequestRender = () => tui.requestRender();
      return {
        render: (width: number) => panelInstance!.render(width),
        invalidate: () => { tuiRequestRender = null; },
        dispose: () => closeWidget(),
      };
    },
    { placement: "aboveEditor" },
  );
}
