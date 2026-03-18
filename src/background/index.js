import { ACTIONS, STORAGE_KEYS, TOOL_PAGE_PATH } from "../shared/constants.js";
import { ensureConfig, getConfig } from "../shared/config.js";
import { expandSelectionToJson, buildOutputs } from "../shared/json-core.js";
import { createTranslator } from "../shared/i18n.js";

const ROOT_MENU_ID = "json-for-llm-root";
const OFFSCREEN_CLIPBOARD_PATH = "src/offscreen/clipboard.html";
let contextMenuRebuildQueue = Promise.resolve();
let offscreenDocumentPromise = null;

function buildToolPageUrl(view) {
  const url = new URL(chrome.runtime.getURL(TOOL_PAGE_PATH));
  if (view) {
    url.searchParams.set("view", view);
  }
  return url.toString();
}

function getMenuEnabled(config, action) {
  const path = action.menuConfigKey.split(".");
  return path.reduce((current, key) => current?.[key], config);
}

function removeAllContextMenus() {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function createContextMenu(options) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(options, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function rebuildContextMenusInternal() {
  const config = await getConfig();
  const translate = createTranslator(config.language);
  await removeAllContextMenus();

  await createContextMenu({
    id: ROOT_MENU_ID,
    title: translate("menu.root"),
    contexts: ["selection"],
  });

  const visibleActions = ACTIONS.filter((action) => getMenuEnabled(config, action));

  for (const action of visibleActions) {
    await createContextMenu({
      id: action.id,
      parentId: ROOT_MENU_ID,
      title: translate(action.titleKey),
      contexts: ["selection"],
    });
  }
}

function rebuildContextMenus() {
  contextMenuRebuildQueue = contextMenuRebuildQueue
    .catch(() => undefined)
    .then(() => rebuildContextMenusInternal());

  return contextMenuRebuildQueue;
}

function captureSelectionFromPage() {
  function previewText(text, limit = 160) {
    const value = String(text || "");

    if (value.length <= limit) {
      return value;
    }

    return `${value.slice(0, limit)}...`;
  }

  function describeNode(node) {
    if (!node) {
      return null;
    }

    return {
      tagName: node.tagName || null,
      id: node.id || null,
      className:
        typeof node.className === "string" ? previewText(node.className, 120) : null,
      textLength: (node.textContent || "").length,
    };
  }

  function collectCandidateRoots(node) {
    const roots = [];
    let current = node;

    while (current) {
      if (
        current === document.body ||
        current.matches?.("pre, code, article, main, section, div, td")
      ) {
        roots.push(current);
      }

      if (current === document.body) {
        break;
      }

      current = current.parentElement;
    }

    return roots;
  }

  function buildCandidateContext(root, range, selectedText) {
    const beforeRange = range.cloneRange();

    try {
      beforeRange.selectNodeContents(root);
      beforeRange.setEnd(range.startContainer, range.startOffset);
    } catch (error) {
      void error;
      return null;
    }

    const contextText = root?.textContent || "";
    const selectionStart = beforeRange.toString().length;
    const selectionEnd = selectionStart + selectedText.length;
    const prefix = contextText.slice(0, selectionStart);
    const suffix = contextText.slice(selectionEnd);
    let score = 0;

    if (/[{[]/.test(prefix) && /[}\]]/.test(suffix)) {
      score += 4;
    }

    if (/^\s*[{[]/.test(contextText)) {
      score += 2;
    }

    if (/[}\]]\s*$/.test(contextText)) {
      score += 2;
    }

    if ((contextText.match(/[{[]/g) || []).length >= 2) {
      score += 1;
    }

    return {
      contextText,
      selectionStart,
      selectionEnd,
      score,
      root: describeNode(root),
      prefixPreview: previewText(prefix),
      suffixPreview: previewText(suffix),
    };
  }

  function isTextSelectionControl(element) {
    if (!element) {
      return false;
    }

    if (element.tagName === "TEXTAREA") {
      return true;
    }

    if (element.tagName !== "INPUT") {
      return false;
    }

    const type = (element.type || "text").toLowerCase();
    return ["text", "search", "url", "tel", "password"].includes(type);
  }

  function getControlSelectionContext(control) {
    if (!isTextSelectionControl(control)) {
      return null;
    }

    const value = typeof control.value === "string" ? control.value : "";
    const selectionStart = Number.isInteger(control.selectionStart) ? control.selectionStart : -1;
    const selectionEnd = Number.isInteger(control.selectionEnd) ? control.selectionEnd : -1;

    if (selectionStart < 0 || selectionEnd <= selectionStart) {
      return null;
    }

    return {
      selectionText: value.slice(selectionStart, selectionEnd),
      contextText: value,
      selectionStart,
      selectionEnd,
      pageTitle: document.title,
      pageUrl: location.href,
      debug: {
        captureStatus: "text-control-selection",
        control: describeNode(control),
        selectionStart,
        selectionEnd,
      },
    };
  }

  function findTextControlSelectionContext() {
    const controlCandidates = [];

    if (isTextSelectionControl(document.activeElement)) {
      controlCandidates.push(document.activeElement);
    }

    for (const control of document.querySelectorAll("textarea, input")) {
      if (!controlCandidates.includes(control) && isTextSelectionControl(control)) {
        controlCandidates.push(control);
      }
    }

    for (const control of controlCandidates) {
      const context = getControlSelectionContext(control);

      if (context) {
        return context;
      }
    }

    return null;
  }

  const controlSelectionContext = findTextControlSelectionContext();

  if (controlSelectionContext) {
    return controlSelectionContext;
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return {
      selectionText: "",
      contextText: "",
      selectionStart: -1,
      selectionEnd: -1,
      pageTitle: document.title,
      pageUrl: location.href,
      debug: {
        captureStatus: "no-selection-in-frame",
        pageTitle: document.title,
        pageUrl: location.href,
      },
    };
  }

  const range = selection.getRangeAt(0);
  const commonNode =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  const selectedText = selection.toString();
  const rootCandidates = collectCandidateRoots(commonNode || document.body)
    .map((root) => buildCandidateContext(root, range, selectedText))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.contextText.length - right.contextText.length;
    });
  const bestCandidate = rootCandidates[0] || {
    contextText: document.body?.textContent || "",
    selectionStart: -1,
    selectionEnd: -1,
    root: describeNode(document.body),
  };

  return {
    selectionText: selectedText,
    contextText: bestCandidate.contextText,
    selectionStart: bestCandidate.selectionStart,
    selectionEnd: bestCandidate.selectionEnd,
    pageTitle: document.title,
    pageUrl: location.href,
    debug: {
      selectedTextPreview: previewText(selectedText),
      commonNode: describeNode(commonNode),
      rootCandidates: rootCandidates.slice(0, 10).map((candidate, index) => ({
        index,
        score: candidate.score,
        selectionStart: candidate.selectionStart,
        selectionEnd: candidate.selectionEnd,
        contextLength: candidate.contextText.length,
        root: candidate.root,
        prefixPreview: candidate.prefixPreview,
        suffixPreview: candidate.suffixPreview,
        contextPreview: previewText(candidate.contextText, 220),
      })),
      chosenRoot: bestCandidate.root,
    },
  };
}

async function openToolPage(view) {
  await chrome.tabs.create({
    url: buildToolPageUrl(view),
  });
}

async function persistTask(task) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastTask]: task,
  });
}

async function ensureOffscreenClipboardDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_CLIPBOARD_PATH);

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });

    if (contexts.length > 0) {
      return;
    }
  }

  if (offscreenDocumentPromise) {
    await offscreenDocumentPromise;
    return;
  }

  offscreenDocumentPromise = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_CLIPBOARD_PATH,
      reasons: ["CLIPBOARD"],
      justification: "Copy generated JSON outputs to the clipboard.",
    })
    .catch((error) => {
      if (!String(error?.message || "").includes("Only a single offscreen document")) {
        throw error;
      }
    })
    .finally(() => {
      offscreenDocumentPromise = null;
    });

  await offscreenDocumentPromise;
}

async function copyText(text) {
  try {
    await ensureOffscreenClipboardDocument();
    const result = await chrome.runtime.sendMessage({
      type: "copy-to-clipboard",
      text,
    });
    return Boolean(result?.ok);
  } catch (error) {
    void error;
    return false;
  }
}

async function showAlertInTab(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (content) => {
        alert(content);
      },
      args: [message],
    });
  } catch (error) {
    void error;
  }
}

async function collectSelectionContext(tabId, fallbackSelectionText, frameId) {
  try {
    const target =
      Number.isInteger(frameId) && frameId >= 0
        ? { tabId, frameIds: [frameId] }
        : { tabId, allFrames: true };
    const results = await chrome.scripting.executeScript({
      target,
      func: captureSelectionFromPage,
    });

    const preferredResult =
      results
        ?.map((item) => item?.result)
        .find(
          (result) =>
            result?.selectionText?.trim() ||
            result?.contextText?.trim() ||
            result?.debug?.captureStatus === "no-selection-in-frame",
        ) || null;

    return (
      preferredResult || {
        selectionText: fallbackSelectionText || "",
        contextText: "",
        selectionStart: -1,
        selectionEnd: -1,
        debug: {
          captureStatus: "no-script-result",
          frameId,
        },
      }
    );
  } catch (error) {
    return {
      selectionText: fallbackSelectionText || "",
      contextText: "",
      selectionStart: -1,
      selectionEnd: -1,
      debug: {
        captureError: error?.message || String(error),
      },
    };
  }
}

function buildGithubRawUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);

    if (!match) {
      return null;
    }

    return `${url.origin}/${match[1]}/${match[2]}/raw/${match[3]}/${match[4]}`;
  } catch (error) {
    void error;
    return null;
  }
}

async function enrichSelectionContext(selectionContext, tab, fallbackSelectionText) {
  if (selectionContext.contextText?.trim()) {
    return selectionContext;
  }

  const selectionText = selectionContext.selectionText || fallbackSelectionText || "";
  const githubRawUrl = buildGithubRawUrl(tab.url || "");

  if (!githubRawUrl) {
    return selectionContext;
  }

  try {
    const response = await fetch(githubRawUrl);

    if (!response.ok) {
      return {
        ...selectionContext,
        debug: {
          ...(selectionContext.debug || {}),
          fallbackContext: {
            strategy: "github-raw",
            rawUrl: githubRawUrl,
            ok: false,
            status: response.status,
          },
        },
      };
    }

    const contextText = await response.text();

    return {
      ...selectionContext,
      selectionText,
      contextText,
      selectionStart: -1,
      selectionEnd: -1,
      debug: {
        ...(selectionContext.debug || {}),
        fallbackContext: {
          strategy: "github-raw",
          rawUrl: githubRawUrl,
          ok: true,
          contextLength: contextText.length,
        },
      },
    };
  } catch (error) {
    return {
      ...selectionContext,
      debug: {
        ...(selectionContext.debug || {}),
        fallbackContext: {
          strategy: "github-raw",
          rawUrl: githubRawUrl,
          ok: false,
          error: error?.message || String(error),
        },
      },
    };
  }
}

function buildTaskPayload(actionId, selectionContext, tab, info, options = {}) {
  const debugEnabled = Boolean(options.debugEnabled);
  const language = options.language;
  const selectionText = selectionContext.selectionText || info.selectionText || "";
  const expansion = expandSelectionToJson({
    selectionText,
    contextText: selectionContext.contextText || "",
    selectionStart: selectionContext.selectionStart,
    selectionEnd: selectionContext.selectionEnd,
  });

  if (expansion.status === "error") {
    return {
      status: "error",
      requestedAction: actionId,
      errorKey: expansion.errorKey,
      selectionText,
      pageTitle: tab.title || "",
      pageUrl: tab.url || "",
      createdAt: new Date().toISOString(),
      ...(debugEnabled
        ? {
            debug: {
              selectionContext: selectionContext.debug || null,
              expansion: expansion.debug || null,
            },
          }
        : {}),
    };
  }

  const outputs = buildOutputs(expansion.parsed, { language });

  return {
    status: "success",
    requestedAction: actionId,
    extractionSource: expansion.source,
    selectionText,
    expandedJsonText: expansion.jsonText,
    sourceJson: outputs.prettyJson,
    outputs,
    pageTitle: selectionContext.pageTitle || tab.title || "",
    pageUrl: selectionContext.pageUrl || tab.url || "",
    createdAt: new Date().toISOString(),
    ...(debugEnabled
      ? {
          debug: {
            selectionContext: selectionContext.debug || null,
            expansion: expansion.debug || null,
          },
        }
      : {}),
  };
}

function getActionById(actionId) {
  return ACTIONS.find((action) => action.id === actionId);
}

async function handleAction(actionId, info, tab) {
  const action = getActionById(actionId);

  if (!action) {
    return;
  }

  const config = await getConfig();
  const translate = createTranslator(config.language);
  const debugEnabled = Boolean(config.debug?.enabled);

  const capturedSelectionContext = await collectSelectionContext(
    tab.id,
    info.selectionText || "",
    info.frameId,
  );
  const selectionContext = await enrichSelectionContext(
    capturedSelectionContext,
    tab,
    info.selectionText || "",
  );
  const task = buildTaskPayload(actionId, selectionContext, tab, info, {
    debugEnabled,
    language: config.language,
  });
  if (debugEnabled) {
    console.info("[JSON for LLM]", {
      actionId,
      status: task.status,
      debug: task.debug,
    });
  }
  await persistTask(task);

  if (action.type === "open-tool-page") {
    await openToolPage("prettyJson");
    return;
  }

  if (task.status === "error") {
    await showAlertInTab(tab.id, translate(task.errorKey || "errors.unknown"));
    return;
  }

  const copied = await copyText(task.outputs?.[actionId] || "");

  if (!copied) {
    await showAlertInTab(tab.id, translate("errors.clipboardPermission"));
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureConfig();
  await rebuildContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureConfig();
  await rebuildContextMenus();
});

chrome.action.onClicked.addListener(async () => {
  await openToolPage("prettyJson");
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || info.menuItemId === ROOT_MENU_ID) {
    return;
  }

  await handleAction(String(info.menuItemId), info, tab);
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || !changes.appConfig) {
    return;
  }

  await rebuildContextMenus();
});
