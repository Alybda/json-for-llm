import { ACTIONS, STORAGE_KEYS } from "../shared/constants.js";
import { getConfig, resetConfig, updateConfig } from "../shared/config.js";
import { createTranslator } from "../shared/i18n.js";

const state = {
  config: null,
  translator: null,
};

function byId(id) {
  return document.getElementById(id);
}

function renderMenuToggles() {
  const container = byId("menu-toggle-list");
  const t = state.translator;
  container.replaceChildren();

  for (const action of ACTIONS) {
    const wrapper = document.createElement("label");
    wrapper.className = "checkbox-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(
      action.menuConfigKey.split(".").reduce((current, key) => current?.[key], state.config),
    );
    input.addEventListener("change", async () => {
      const [section, key, field] = action.menuConfigKey.split(".");
      state.config = await updateConfig({
        [section]: {
          [key]: {
            [field]: input.checked,
          },
        },
      });
      render();
    });
    const text = document.createElement("span");
    text.textContent = t(action.titleKey);
    wrapper.append(input, text);
    container.append(wrapper);
  }
}

function render() {
  const t = state.translator;
  const manifest = chrome.runtime.getManifest();

  byId("settings-title").textContent = t("settings.title");
  byId("settings-hint").textContent = t("toolPage.rerunHint");
  byId("open-tool-page").textContent = t("menu.openToolPage");
  byId("restore-defaults").textContent = t("settings.restoreDefaults");

  byId("language-title").textContent = t("settings.language");
  byId("language-label").textContent = t("settings.language");
  byId("language-select").options[0].textContent = t("settings.localeZh");
  byId("language-select").options[1].textContent = t("settings.localeEn");
  byId("language-select").value = state.config.language;

  byId("debug-title").textContent = t("settings.debug");
  byId("debug-hint").textContent = t("settings.debugHint");
  byId("debug-enabled-label").textContent = t("settings.debugEnabled");
  byId("debug-enabled").checked = Boolean(state.config.debug?.enabled);

  byId("menu-title").textContent = t("settings.contextMenu");
  byId("menu-hint").textContent = t("settings.menuVisibility");
  renderMenuToggles();

  byId("result-title").textContent = t("settings.result");
  byId("result-mode-label").textContent = t("settings.resultMode");
  byId("result-mode-hint").textContent = t("settings.resultModeHint");
  byId("result-mode").options[0].textContent = t("settings.toolPageMode");
  byId("result-mode").value = state.config.resultViewMode;

  byId("about-title").textContent = t("settings.about");
  byId("version-label").textContent = t("settings.version");
  byId("license-label").textContent = t("settings.license");
  byId("version-value").textContent = manifest.version;
  byId("license-value").textContent = "MIT";
}

async function initialize() {
  state.config = await getConfig();
  state.translator = createTranslator(state.config.language);

  byId("open-tool-page").addEventListener("click", async () => {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("src/tool-page/index.html"),
    });
  });

  byId("restore-defaults").addEventListener("click", async () => {
    state.config = await resetConfig();
    state.translator = createTranslator(state.config.language);
    render();
  });

  byId("language-select").addEventListener("change", async (event) => {
    state.config = await updateConfig({
      language: event.target.value,
    });
    state.translator = createTranslator(state.config.language);
    render();
  });

  byId("debug-enabled").addEventListener("change", async (event) => {
    state.config = await updateConfig({
      debug: {
        enabled: event.target.checked,
      },
    });
    render();
  });

  byId("result-mode").addEventListener("change", async (event) => {
    state.config = await updateConfig({
      resultViewMode: event.target.value,
    });
    render();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEYS.config]) {
      return;
    }

    state.config = changes[STORAGE_KEYS.config].newValue || state.config;
    state.translator = createTranslator(state.config.language);
    render();
  });

  render();
}

initialize();
