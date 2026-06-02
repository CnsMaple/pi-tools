# pi-tools

已合并的 pi 插件集合，统一入口加载，按需优化。

## 启动时间

| 场景 | 耗时 |
|------|------|
| 无插件（裸 pi） | ~85ms |
| 优化后（7 插件 + 全部懒加载） | **~150ms** |
| 优化前（静态 import） | ~5000ms |

## 包含的模块

| 模块 | 版本 | 出处 | 说明 | 加载方式 |
|------|------|------|------|---------|
| [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) | 2.8.0 | [npm](https://www.npmjs.com/package/pi-mcp-adapter) | MCP 适配器，管理 MCP 服务器连接与工具代理 | 同步 |
| [pi-cache-optimizer](https://github.com/jiangge/pi-cache-optimizer) | 2.5.5 | [npm](https://www.npmjs.com/package/pi-cache-optimizer) | 缓存优化，重排 system prompt 提高缓存命中率 | 同步 |
| [pi-plan-mode](https://github.com/narumiruna/pi-extensions) | 0.1.36 | [npm](https://www.npmjs.com/package/@narumitw/pi-plan-mode) | Codex 风格只读计划模式 (`/plan` 命令) | 同步 |
| [pi-retry](https://github.com/georgebashi/pi-retry) | 0.1.1 | [npm](https://www.npmjs.com/package/@georgebashi/pi-retry) | 自动重试流式错误 + 手动 `/retry` 命令 | 同步 |
| [pi-rtk](https://github.com/mcowger/pi-rtk) | 0.1.4 | [npm](https://www.npmjs.com/package/pi-rtk) | RTK token 缩减，智能过滤工具输出 (8 种技术) | 同步 |
| [pi-smart-fetch](https://github.com/Thinkscape/agent-smart-fetch) | 0.3.9 | [npm](https://www.npmjs.com/package/pi-smart-fetch) | 智能 web_fetch，浏览器级 TLS 指纹模拟 + Defuddle 提取 | 懒加载（首次调用） |
| [rpiv-todo](https://github.com/buihongduc132/rpiv-todo) | 1.1.0 | [npm](https://www.npmjs.com/package/rpiv-todo) | TUI 任务看板 (`todo` 工具 + 覆盖层) | 同步 |
| pi-continue | — | — | `/continue` 命令，继续被中断的响应 | 同步 |

## 与原版的差异

### pi-mcp-adapter (v2.8.0 → 已修改)

| 改动 | 文件 | 说明 |
|------|------|------|
| 子命令自动补全 | `index.ts` | `/mcp ` + 空格弹出补全列表（原版无此功能） |
| 面板布局精简 | `mcp-panel.ts` | 移除所有多余空行，只在统计行下方保留一行空白 |
| 面板定位 | `commands.ts` | 改为 `left-center` 锚点，无固定宽高限制 |
| 底部栏颜色统一 | `init.ts` | 移除 MCP 状态的 `accent` 颜色标记，与其他插件默认色一致 |

### pi-cache-optimizer（已修改）

| 改动 | 说明 |
|------|------|
| system prompt 缓存 | 同一会话中 system prompt 不变时跳过重复处理 |

### pi-smart-fetch（已修改）

| 改动 | 说明 |
|------|------|
| 懒加载 | 启动时不导入 `wreq-js`（54MB），首次调用 `web_fetch` 才动态加载 |

### pi-rtk（已修改）

| 改动 | 说明 |
|------|------|
| TypeBox 去重 | 导入路径从 `@sinclair/typebox` 改为 `typebox`，消除冗余依赖 |

## 加载优化

| 优化项 | 效果 |
|------|------|
| 并行动态 import | 插件模块通过 `Promise.all` 并发加载 |
| MCP 适配器后台加载 | 43 文件 10K 行异步加载，不阻塞启动计时 |
| pi-rtk techniques 懒加载 | 8 个过滤模块（~1400 行）首次 tool_result 才加载 |
| rpiv-todo overlay 懒加载 | TodoOverlay 类（~220 行）首次 session_start 才加载 |
| cache-optimizer 批量化 | 磁盘写入从 2s 防抖延长到 30s，减少 I/O |
| smart-fetch 懒加载 | `wreq-js`（54MB）首次 web_fetch 调用才加载 |
| TypeBox 去重 | 统一使用 `typebox`，消除 `@sinclair/typebox` 冗余依赖 |

## 安装

### 方式一：通过 packages 自动安装（推荐）

在 `~/.pi/agent/settings.json` 中添加：

```json
{
  "packages": [
    "https://github.com/CnsMaple/pi-tools"
  ]
}
```

pi 会自动 clone 并加载此仓库的扩展。

### 方式二：手动克隆

```bash
git clone https://github.com/CnsMaple/pi-tools.git
cd pi-tools
npm install
```

然后在 `~/.pi/agent/settings.json` 的 `pi.extensions` 中指向 `index.ts`：

```json
{
  "pi": {
    "extensions": [
      "/path/to/pi-tools/index.ts"
    ]
  }
}
```

### 方式三：进入目录直接运行

```bash
cd /path/to/pi-tools
pi
```

## License

MIT — 各模块遵循其原始许可证。
