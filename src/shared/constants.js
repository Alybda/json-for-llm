export const CONFIG_VERSION = 2;

export const STORAGE_KEYS = {
  config: "appConfig",
  lastTask: "lastTask",
};

export const RESULT_VIEW_MODES = ["tool-page"];

export const ACTIONS = [
  {
    id: "prettyJson",
    menuConfigKey: "menu.prettyJson.enabled",
    titleKey: "menu.prettyJson",
    outputLanguage: "json",
    type: "copy-output",
  },
  {
    id: "jsonSchema",
    menuConfigKey: "menu.jsonSchema.enabled",
    titleKey: "menu.jsonSchema",
    outputLanguage: "json",
    type: "copy-output",
  },
  {
    id: "openAISchema",
    menuConfigKey: "menu.openAISchema.enabled",
    titleKey: "menu.openAISchema",
    outputLanguage: "json",
    type: "copy-output",
  },
  {
    id: "pydantic",
    menuConfigKey: "menu.pydantic.enabled",
    titleKey: "menu.pydantic",
    outputLanguage: "python",
    type: "copy-output",
  },
  {
    id: "goStruct",
    menuConfigKey: "menu.goStruct.enabled",
    titleKey: "menu.goStruct",
    outputLanguage: "go",
    type: "copy-output",
  },
  {
    id: "typescript",
    menuConfigKey: "menu.typescript.enabled",
    titleKey: "menu.typescript",
    outputLanguage: "typescript",
    type: "copy-output",
  },
  {
    id: "openToolPage",
    menuConfigKey: "menu.openToolPage.enabled",
    titleKey: "menu.openToolPage",
    outputLanguage: "text",
    type: "open-tool-page",
  },
];

export const OUTPUT_TABS = [
  {
    id: "prettyJson",
    titleKey: "menu.prettyJson",
    language: "json",
  },
  {
    id: "minifyJson",
    titleKey: "toolPage.minify",
    language: "json",
  },
  {
    id: "escapeJson",
    titleKey: "toolPage.escape",
    language: "json",
  },
  {
    id: "unescapeJson",
    titleKey: "toolPage.unescape",
    language: "json",
  },
  {
    id: "jsonSchema",
    titleKey: "menu.jsonSchema",
    language: "json",
  },
  {
    id: "openAISchema",
    titleKey: "menu.openAISchema",
    language: "json",
  },
  {
    id: "pydantic",
    titleKey: "menu.pydantic",
    language: "python",
  },
  {
    id: "goStruct",
    titleKey: "menu.goStruct",
    language: "go",
  },
  {
    id: "typescript",
    titleKey: "menu.typescript",
    language: "typescript",
  },
];

export const DEFAULT_CONFIG = {
  configVersion: CONFIG_VERSION,
  language: "zh-CN",
  resultViewMode: "tool-page",
  debug: {
    enabled: false,
  },
  menu: {
    prettyJson: { enabled: true },
    jsonSchema: { enabled: true },
    openAISchema: { enabled: true },
    pydantic: { enabled: true },
    goStruct: { enabled: true },
    typescript: { enabled: true },
    openToolPage: { enabled: true },
  },
};

export const TOOL_PAGE_PATH = "src/tool-page/index.html";
