async function writeText(value) {
  try {
    await navigator.clipboard.writeText(value || "");
    return true;
  } catch (error) {
    void error;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value || "";
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "copy-to-clipboard") {
    return undefined;
  }

  writeText(message.text)
    .then((ok) => {
      sendResponse({ ok });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "unknown",
      });
    });

  return true;
});
