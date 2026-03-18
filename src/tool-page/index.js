import { OUTPUT_TABS, STORAGE_KEYS } from "../shared/constants.js";
import { getConfig } from "../shared/config.js";
import { createTranslator } from "../shared/i18n.js";
import { buildOutputs } from "../shared/json-core.js";

const state = {
  config: null,
  translator: null,
  task: null,
  activeTab: "prettyJson",
  generatedOutputs: {},
  statusMode: "empty",
  errorKey: null,
};

const buttonFeedbackTimers = new Map();
let layoutFrameId = 0;

function byId(id) {
  return document.getElementById(id);
}

function getRequestedView() {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") || "prettyJson";
}

async function loadTask() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.lastTask);
  return stored[STORAGE_KEYS.lastTask] || null;
}

async function copyToClipboard(value) {
  await navigator.clipboard.writeText(value || "");
}

function getSelectionInput() {
  return byId("selection-input");
}

function getSourceInput() {
  return byId("source-input");
}

function getResultOutput() {
  return byId("result-output");
}

function updateViewportLayout() {
  const shell = document.querySelector(".tool-page-shell");
  const topbar = document.querySelector(".topbar");
  const workspace = document.querySelector(".workspace");

  if (!shell || !topbar || !workspace) {
    return;
  }

  const shellStyles = window.getComputedStyle(shell);
  const topbarStyles = window.getComputedStyle(topbar);
  const shellPaddingTop = Number.parseFloat(shellStyles.paddingTop) || 0;
  const shellPaddingBottom = Number.parseFloat(shellStyles.paddingBottom) || 0;
  const topbarMarginBottom = Number.parseFloat(topbarStyles.marginBottom) || 0;
  const shellInnerHeight =
    shell.getBoundingClientRect().height - shellPaddingTop - shellPaddingBottom;
  const availableHeight = shellInnerHeight - topbar.offsetHeight - topbarMarginBottom;

  shell.style.setProperty("--workspace-height", `${Math.max(availableHeight, 320)}px`);
  workspace.style.minHeight = "0";
}

function scheduleViewportLayoutUpdate() {
  if (layoutFrameId) {
    window.cancelAnimationFrame(layoutFrameId);
  }

  layoutFrameId = window.requestAnimationFrame(() => {
    layoutFrameId = 0;
    updateViewportLayout();
  });
}

function setButtonLabel(id, label, title) {
  const button = byId(id);
  button.textContent = label;
  button.title = title || label;
  button.dataset.defaultLabel = label;
}

function flashButtonLabel(id, labelKey, duration = 1200) {
  const button = byId(id);

  if (!button) {
    return;
  }

  const nextLabel = state.translator(labelKey);
  const defaultLabel = button.dataset.defaultLabel || button.textContent;
  const existingTimer = buttonFeedbackTimers.get(id);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  button.textContent = nextLabel;
  button.classList.add("is-feedback");

  const timer = window.setTimeout(() => {
    button.textContent = defaultLabel;
    button.classList.remove("is-feedback");
    buttonFeedbackTimers.delete(id);
  }, duration);

  buttonFeedbackTimers.set(id, timer);
}

function setStatusFromTask(task) {
  if (!task) {
    state.statusMode = "empty";
    state.errorKey = null;
    return;
  }

  if (task.status === "error") {
    state.statusMode = "error";
    state.errorKey = task.errorKey || "errors.unknown";
    return;
  }

  state.statusMode =
    task.extractionSource === "selection" ? "selection" : "expansion";
  state.errorKey = null;
}

function deriveOutputsFromTask(task) {
  const storedOutputs = task?.outputs || {};

  if (task?.status !== "success" || !task?.sourceJson) {
    return storedOutputs;
  }

  try {
    return buildOutputs(JSON.parse(task.sourceJson), {
      language: state.config?.language,
    });
  } catch (error) {
    void error;
    return storedOutputs;
  }
}

function hydrateEditorsFromTask(task) {
  getSelectionInput().value = task?.selectionText || "";
  getSourceInput().value = task?.sourceJson || "";
  state.generatedOutputs = deriveOutputsFromTask(task);
}

function updateResultForActiveTab() {
  getResultOutput().value = state.generatedOutputs?.[state.activeTab] || "";
}

function formatPageContext(task) {
  if (!task?.pageTitle && !task?.pageUrl) {
    return "-";
  }

  if (task.pageTitle && task.pageUrl) {
    return `${task.pageTitle} · ${task.pageUrl}`;
  }

  return task.pageTitle || task.pageUrl;
}

function renderStatus() {
  const t = state.translator;
  const badge = byId("status-badge");
  const value = byId("status-value");

  switch (state.statusMode) {
    case "selection":
      badge.textContent = t("toolPage.detectedFromSelection");
      value.textContent = t("status.success");
      break;
    case "expansion":
      badge.textContent = t("toolPage.detectedFromExpansion");
      value.textContent = t("status.success");
      break;
    case "manual":
      badge.textContent = t("toolPage.manualEdit");
      value.textContent = t("status.success");
      break;
    case "error":
      badge.textContent = t("status.error");
      value.textContent = t(state.errorKey || "errors.unknown");
      break;
    default:
      badge.textContent = t("toolPage.emptyTitle");
      value.textContent = "-";
  }

  badge.title = badge.textContent;
  value.title = value.textContent;
}

function renderStaticText() {
  const t = state.translator;

  byId("app-title").textContent = t("app.title");
  byId("app-subtitle").textContent = t("app.subtitle");
  byId("status-label").textContent = t("toolPage.status");
  byId("page-context-label").textContent = t("toolPage.pageContext");

  byId("selection-title").textContent = t("toolPage.sourceSelection");
  byId("selection-hint").textContent = t("toolPage.selectionHint");
  setButtonLabel("use-selection", t("toolPage.applySelection"), t("toolPage.useSelection"));
  setButtonLabel("copy-selection", t("toolPage.copyShort"), t("toolPage.copySelection"));

  byId("source-title").textContent = t("toolPage.source");
  byId("source-hint").textContent = t("toolPage.sourceHint");
  setButtonLabel("regenerate-source", t("toolPage.regenerateShort"), t("toolPage.regenerate"));
  setButtonLabel("copy-source", t("toolPage.copyShort"), t("toolPage.copySource"));

  byId("outputs-title").textContent = t("toolPage.outputs");
  byId("outputs-hint").textContent = t("toolPage.outputsHint");
  setButtonLabel("copy-output", t("toolPage.copyShort"), t("toolPage.copy"));
  setButtonLabel("settings-toggle", t("toolPage.openSettings"));
}

function renderTabs() {
  const tabList = byId("tab-list");
  const t = state.translator;
  tabList.replaceChildren();
  tabList.setAttribute("role", "tablist");

  for (const tab of OUTPUT_TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${state.activeTab === tab.id ? " active" : ""}`;
    button.textContent = t(tab.titleKey);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.activeTab === tab.id));
    button.title = t(tab.titleKey);
    button.addEventListener("click", () => {
      state.activeTab = tab.id;
      renderTabs();
      updateResultForActiveTab();
    });
    tabList.append(button);
  }
}

function recomputeOutputsFromSource() {
  const t = state.translator;
  const sourceText = getSourceInput().value.trim();

  if (!sourceText) {
    state.generatedOutputs = {};
    state.statusMode = "empty";
    state.errorKey = null;
    getResultOutput().value = t("toolPage.emptyTitle");
    renderStatus();
    return false;
  }

  try {
    const parsed = JSON.parse(sourceText);
    state.generatedOutputs = buildOutputs(parsed, {
      language: state.config?.language,
    });
    getSourceInput().value = state.generatedOutputs.prettyJson;
    state.statusMode = "manual";
    state.errorKey = null;
    updateResultForActiveTab();
    renderStatus();
    return true;
  } catch (error) {
    void error;
    state.generatedOutputs = {};
    state.statusMode = "error";
    state.errorKey = "toolPage.invalidSource";
    getResultOutput().value = t("toolPage.invalidSource");
    renderStatus();
    return false;
  }
}

function refreshOutputsForLanguage() {
  const sourceText = getSourceInput().value.trim();

  if (!sourceText) {
    return;
  }

  try {
    const parsed = JSON.parse(sourceText);
    state.generatedOutputs = buildOutputs(parsed, {
      language: state.config?.language,
    });
  } catch (error) {
    void error;
  }
}

function renderTask() {
  const pageContextValue = byId("page-context-value");
  pageContextValue.textContent = formatPageContext(state.task);
  pageContextValue.title = formatPageContext(state.task);
  renderStatus();

  if (!state.task) {
    getSelectionInput().value = "";
    getSourceInput().value = "";
    getResultOutput().value = state.translator("toolPage.emptyBody");
    return;
  }

  if (state.statusMode === "manual") {
    updateResultForActiveTab();
    return;
  }

  if (state.statusMode === "error" && state.errorKey === "toolPage.invalidSource") {
    getResultOutput().value = state.translator("toolPage.invalidSource");
    return;
  }

  if (state.task.status === "error") {
    const errorText = state.translator(state.task.errorKey || "errors.unknown");
    const debugText = state.config?.debug?.enabled && state.task.debug
      ? `\n\n=== ${state.translator("toolPage.debugInfo")} ===\n${JSON.stringify(
          state.task.debug,
          null,
          2,
        )}`
      : "";
    getResultOutput().value = `${errorText}${debugText}`;
    getSourceInput().value = getSourceInput().value || "";
    return;
  }

  updateResultForActiveTab();
}

async function render() {
  renderStaticText();
  renderTabs();
  renderTask();
  scheduleViewportLayoutUpdate();
}

async function initialize() {
  const requestedView = getRequestedView();
  state.config = await getConfig();
  state.translator = createTranslator(state.config.language);
  state.task = await loadTask();
  state.activeTab = OUTPUT_TABS.some((tab) => tab.id === requestedView)
    ? requestedView
    : OUTPUT_TABS.some((tab) => tab.id === state.task?.requestedAction)
      ? state.task.requestedAction
      : "prettyJson";

  hydrateEditorsFromTask(state.task);
  setStatusFromTask(state.task);

  byId("settings-toggle").addEventListener("click", async () => {
    await chrome.runtime.openOptionsPage();
  });

  byId("copy-selection").addEventListener("click", async () => {
    await copyToClipboard(getSelectionInput().value);
    flashButtonLabel("copy-selection", "app.copied");
  });

  byId("use-selection").addEventListener("click", () => {
    getSourceInput().value = getSelectionInput().value;
    recomputeOutputsFromSource();
  });

  byId("regenerate-source").addEventListener("click", () => {
    recomputeOutputsFromSource();
  });

  byId("copy-source").addEventListener("click", async () => {
    await copyToClipboard(getSourceInput().value);
    flashButtonLabel("copy-source", "app.copied");
  });

  byId("copy-output").addEventListener("click", async () => {
    await copyToClipboard(getResultOutput().value);
    flashButtonLabel("copy-output", "app.copied");
  });

  window.addEventListener("resize", scheduleViewportLayoutUpdate);
  window.visualViewport?.addEventListener("resize", scheduleViewportLayoutUpdate);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[STORAGE_KEYS.config]) {
      state.config = changes[STORAGE_KEYS.config].newValue || state.config;
      state.translator = createTranslator(state.config.language);
      refreshOutputsForLanguage();
    }

    if (changes[STORAGE_KEYS.lastTask]) {
      state.task = changes[STORAGE_KEYS.lastTask].newValue || null;
      hydrateEditorsFromTask(state.task);
      setStatusFromTask(state.task);
      updateResultForActiveTab();
    }

    render();
  });

  await render();
}

initialize();
