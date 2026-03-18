const PYTHON_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

export function indent(text, level = 1, spacer = "  ") {
  return text
    .split("\n")
    .map((line) => `${spacer.repeat(level)}${line}`)
    .join("\n");
}

export function toWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function toPascalCase(value, fallback = "Value") {
  const words = toWords(value);

  if (!words.length) {
    return fallback;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function toSnakeCase(value, fallback = "value") {
  const words = toWords(value);

  if (!words.length) {
    return fallback;
  }

  return words.map((word) => word.toLowerCase()).join("_");
}

export function isValidJsIdentifier(value) {
  return /^[$A-Z_a-z][$\w]*$/.test(value);
}

export function isValidPythonIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !PYTHON_KEYWORDS.has(value);
}

export function escapeString(value) {
  return JSON.stringify(String(value));
}

export function unique(items) {
  return [...new Set(items)];
}
