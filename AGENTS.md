# AGENTS.md

本文件面向在本仓库内协作的人类开发者与编码代理，目标是帮助你在尽量少踩坑的前提下，快速做出与项目现状一致的改动。

## 1. 仓库定位

`JSON for LLM` 是一个 **Manifest V3 浏览器扩展**，当前实现是 **no-build MVP**：

- 不依赖打包器
- 不依赖前端框架
- 所有源码均为原生 HTML / CSS / JavaScript ES Modules
- 通过右键菜单处理网页中的 JSON 或局部 JSON 片段
- 通过 Tool Page 展示、编辑和复制转换结果

当前核心能力：

- 选中文本捕获
- 局部 JSON 自动向外扩展为完整对象或数组
- 生成 `Pretty JSON`
- 生成 `Minify JSON`
- 生成 `JSON Schema`
- 生成 `OpenAI Schema`
- 生成 `Pydantic Model`
- 生成 `Go Struct`
- 生成 `TypeScript Type`
- 本地配置持久化
- 中英双语界面

## 2. 目录与职责

### 根目录

- `manifest.json`
  Chrome 扩展入口声明。权限、后台脚本、默认语言、Tool Page 入口都在这里定义。

- `README.md`
  面向使用者的说明，偏产品和使用方式。

- `PRD.md`
  产品需求文档。适合在做能力扩展、命名调整、范围判断时参考。

- `LICENSE`
  MIT。

### `_locales/`

只用于 Chrome 扩展清单级别文案，例如：

- 扩展名
- 扩展描述
- action 标题

注意：这里不是应用内部 UI 文案的唯一来源。

### `src/background/`

- `src/background/index.js`
  MV3 service worker 入口，负责：
  - 初始化配置
  - 构建右键菜单
  - 注入页面脚本获取选区上下文
  - 生成 task payload
  - 将结果写入 `chrome.storage.local`
  - 执行复制输出或打开 Tool Page

### `src/shared/`

纯逻辑与共享配置层：

- `constants.js`
  行为常量、菜单定义、默认配置、输出 tab 定义、存储 key、Tool Page 路径。

- `config.js`
  配置读取、默认值合并、深度 merge、重置逻辑。

- `i18n-data.js`
  应用内部 UI 文案来源，当前维护 `zh-CN` 与 `en`。

- `i18n.js`
  文案解析、回退语言逻辑。

- `json-core.js`
  仓库最核心的纯算法层，负责：
  - 解析与扩展选中的 JSON
  - 结构 shape 推断
  - 生成各种 schema / model / type
  - 组装 `buildOutputs()`

- `utils.js`
  命名转换、字符串转义、去重、缩进等通用工具。

### `src/tool-page/`

Tool Page UI：

- `index.html`
  页面结构
- `index.js`
  读取 task、渲染 tabs、处理编辑和复制、更新配置
- `styles.css`
  页面视觉与布局

### `dist/`

发布产物目录，当前主要是打包好的 zip。**不是源码真相来源**。除非任务明确要求处理发布包，否则不要把这里当成需要同步维护的主文件。

### `output/`

临时输出与 QA 相关目录，包含 Playwright 脚本、截图、浏览器 profile、临时环境等。内容体积大且多数为生成物。**默认不要编辑，也不要把这里当成业务源码。**

## 3. 架构理解

项目目前有三层：

1. `background`
   负责和浏览器扩展 API 打交道。

2. `shared`
   负责纯逻辑，是最适合扩展能力和补测试思路的地方。

3. `tool-page`
   负责结果展示、手动修正和配置。

推荐原则：

- 能做成纯函数的逻辑，优先放到 `src/shared/`
- 与 `chrome.*` API 强耦合的代码留在 `background` 或 Tool Page
- 不要把大量业务逻辑塞进 DOM 事件回调

## 4. 当前关键数据流

一次完整操作大致如下：

1. 用户在网页上选中 JSON 或局部 JSON
2. 右键菜单触发某个 action
3. `background/index.js` 注入 `captureSelectionFromPage()`
4. `json-core.js` 的 `expandSelectionToJson()` 尝试：
   - 直接解析选中内容
   - 若失败，则基于上下文和选区偏移向外寻找最小合法 `{}` / `[]`
5. 若成功，`buildOutputs()` 生成全部输出
6. task 写入 `chrome.storage.local`
7. 根据 action 类型：
   - 复制对应输出到原页面剪贴板
   - 或打开 Tool Page
8. Tool Page 从 `lastTask` 中读取并展示结果

这条链路里最重要的约束是：

- `ACTIONS[].id` 必须和 `task.outputs` 中对应输出 key 一致，复制逻辑依赖这个约定
- `openToolPage` 是特例，它不是 `buildOutputs()` 的输出项

## 5. 重要约束

### No-build 约束

这个仓库当前明确是 no-build 结构，因此：

- 不要随手引入 Vite、Webpack、TypeScript 编译链、Babel 或前端框架
- 不要把简单改动升级成“先重构构建系统”
- 新增代码应直接兼容浏览器扩展环境与原生 ES Module

### Manifest V3 约束

- `background/index.js` 是 service worker，不是持久化后台页
- service worker 不能直接访问页面 DOM
- 页面选区必须通过 `chrome.scripting.executeScript()` 注入页面上下文获取

### 配置与存储约束

- 配置入口统一走 `src/shared/config.js`
- 存储 key 统一以 `src/shared/constants.js` 为准
- 不要在多个文件里硬编码相同 storage key

### 国际化约束

项目有两套文案来源：

1. `_locales/*/messages.json`
   用于 `manifest.json` 中的 `__MSG_*__`

2. `src/shared/i18n-data.js`
   用于 Tool Page 和运行时菜单文案

因此：

- 修改扩展名、描述、action 标题时，要检查 `_locales/`
- 修改应用内按钮、标签、错误提示、菜单标题时，要检查 `i18n-data.js`
- 如果新增右键菜单 action，通常需要同时更新：
  - `src/shared/constants.js`
  - `src/shared/i18n-data.js`
  - 视情况更新 `_locales/` 中 manifest 相关名称

## 6. 改动前先判断触点

### 如果你在新增一个“新的转换输出”

通常需要检查这些位置：

- `src/shared/json-core.js`
  增加生成逻辑，并把结果接入 `buildOutputs()`

- `src/shared/constants.js`
  若它需要出现在右键菜单或 Tool Page tab 中，补充：
  - `ACTIONS`
  - `OUTPUT_TABS`
  - `DEFAULT_CONFIG.menu`

- `src/shared/i18n-data.js`
  为中英文 UI 文案补齐标题

- `src/background/index.js`
  确认 action 类型和复制行为是否符合预期

- `src/tool-page/index.js`
  确认 tab 渲染、默认视图、复制行为是否覆盖到新输出

- `README.md`
  若对外能力有变化，应同步说明

### 如果你在修改“选区自动扩展”

重点关注：

- `src/shared/json-core.js`
  - `normalizeText()`
  - `tryParseJson()`
  - `computeBracketPairs()`
  - `expandSelectionToJson()`

注意事项：

- 当前算法只面向“标准 JSON”
- 已对字符串中的括号做了转义与字符串态处理
- 不要轻易引入不可信的“模糊修复 JSON”逻辑，否则容易产生误判
- 如果扩展失败，宁可明确报错，也不要猜测性生成结果

### 如果你在修改“配置项”

通常需要同步这些地方：

- `src/shared/constants.js`
- `src/shared/config.js`
- `src/tool-page/index.js`
- `src/shared/i18n-data.js`

如果是菜单显示开关，还要检查右键菜单重建逻辑是否受影响。

## 7. 编码风格

保持与现有代码一致：

- 使用原生 ES Modules
- 使用命名导出，尽量避免无必要默认导出
- 2 空格缩进
- 保留分号
- 优先小函数与纯函数
- 非必要不要引入类
- 变量命名尽量直白，贴近实际职责

额外建议：

- 对数据变换逻辑，优先写成纯函数
- 对 Chrome API 调用，显式处理失败分支
- 不要把 UI 文案硬编码在 Tool Page 脚本里

## 8. 已知耦合点与坑

### `ACTIONS.id` 与输出 key 的隐式耦合

复制类 action 通过 `task.outputs?.[actionId]` 取值，所以：

- `prettyJson`
- `jsonSchema`
- `openAISchema`
- `pydantic`
- `goStruct`
- `typescript`

这些 id 必须与 `buildOutputs()` 的 key 对齐。

### OpenAI Schema 的根节点处理

`generateOpenAiSchema()` 会把非 object 根包装成：

```json
{ "data": ... }
```

这是当前实现中的显式策略，不要在不了解影响的情况下改掉。

### Tool Page 既是结果页，也是手动编辑工作台

`src/tool-page/index.js` 不只是展示数据，还支持：

- 用原始选中内容覆盖 source
- 编辑 source 后重新生成
- 配置语言与菜单可见性
- 在 storage 变化时刷新视图

因此修改 Tool Page 时，要同时考虑：

- 初始加载
- 任务成功态
- 任务失败态
- 手动编辑态
- 配置变更后的重渲染

### 多语言同步容易漏

新增一个标题或错误提示时，至少检查：

- `zh-CN`
- `en`

不要只加一种语言。

## 9. 验证方式

默认情况下，不要主动编译、不要主动跑测试、也不要主动执行验证脚本，除非任务明确要求。

如果用户明确要求验证，优先采用以下路径：

### 手动验证

1. 在 Chrome / Chromium 打开 `chrome://extensions`
2. 开启开发者模式
3. `Load unpacked` 当前仓库根目录
4. 打开任意包含 JSON 的页面，选中完整或局部 JSON
5. 验证右键菜单是否正确出现
6. 验证复制类 action 是否输出正确内容
7. 验证 Tool Page 是否能展示、编辑、切换 tab、切换语言、恢复默认设置

### Playwright 验证

仓库中存在：

- `output/playwright/qa/run-extension-flow.mjs`

这是一个偏 QA / 调试用途的脚本，不是项目主开发流程的一部分。只有在用户明确要求自动化验证时再考虑使用它。

## 10. 哪些文件通常不该动

除非任务明确需要，否则通常不要改：

- `dist/**`
- `output/**`

其中：

- `dist/` 是发布产物
- `output/` 多为临时文件、截图、Playwright 环境、浏览器 profile

## 11. 提交高质量改动的建议

### 做功能扩展时

- 尽量把逻辑留在 `src/shared/`
- UI 只负责输入输出和状态变化
- 为新增能力补齐中英文文案
- 检查是否需要在 README 中体现用户可见变化

### 做重构时

- 先确认是否真的带来可维护性收益
- 避免把简单项目改造成“需要构建步骤”的项目
- 保持 `background`、`shared`、`tool-page` 的边界清晰

### 做 bugfix 时

- 先确认 bug 发生在哪一层：
  - 选区采集
  - JSON 扩展
  - 输出生成
  - storage
  - Tool Page 渲染
- 修复后优先检查有没有影响：
  - 失败态提示
  - 多语言文案
  - 右键菜单行为

## 12. 推荐协作心智

在这个仓库里，优先做“小而准”的改动，而不是“大而全”的重塑。

最符合项目现状的协作方式是：

- 基于现有 no-build 架构演进
- 保持共享逻辑纯净
- 保持配置和文案集中管理
- 对不可靠的 JSON 推断保持保守
- 把用户能直接感知到的行为一致性放在首位

如果你不确定某个改动应该放在哪里，优先从 `src/shared/` 找答案；如果你新增了一个用户可见入口，记得回头检查文案、菜单、配置和 Tool Page 是否都同步到了。
