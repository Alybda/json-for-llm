import { DEFAULT_CONFIG } from "./constants.js";
import { I18N_RESOURCES } from "./i18n-data.js";

const FALLBACK_LANGUAGE = "en";

function getValue(source, path) {
  return path.split(".").reduce((current, key) => current?.[key], source);
}

export function resolveLanguage(language) {
  if (I18N_RESOURCES[language]) {
    return language;
  }

  return DEFAULT_CONFIG.language || FALLBACK_LANGUAGE;
}

export function t(language, key, variables = {}) {
  const locale = resolveLanguage(language);
  const translated =
    getValue(I18N_RESOURCES[locale], key) ??
    getValue(I18N_RESOURCES[FALLBACK_LANGUAGE], key) ??
    key;

  return Object.entries(variables).reduce((message, [name, value]) => {
    return message.replaceAll(`{${name}}`, String(value));
  }, translated);
}

export function createTranslator(language) {
  return (key, variables) => t(language, key, variables);
}
