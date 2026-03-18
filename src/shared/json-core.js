import {
  escapeString,
  indent,
  isValidJsIdentifier,
  isValidPythonIdentifier,
  toPascalCase,
  toSnakeCase,
  unique,
} from "./utils.js";
import { t as translateMessage } from "./i18n.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(text) {
  return typeof text === "string" ? text.replace(/\u00a0/g, " ") : "";
}

function previewText(text, limit = 160) {
  const normalized = normalizeText(text);

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit)}...`;
}

function tryParseJson(text) {
  const normalized = normalizeText(text).trim();

  if (!normalized) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(normalized), text: normalized };
  } catch (error) {
    return { ok: false, error };
  }
}

function normalizeJsonLikeText(text) {
  const normalized = normalizeText(text);
  let result = "";
  let inString = false;
  let isEscaped = false;
  let changed = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (inString) {
      result += character;

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1;

      while (end < normalized.length && /[A-Za-z0-9_]/.test(normalized[end])) {
        end += 1;
      }

      const token = normalized.slice(index, end);
      const replacement =
        token === "True"
          ? "true"
          : token === "False"
            ? "false"
            : token === "None"
              ? "null"
              : token;

      if (replacement !== token) {
        changed = true;
      }

      result += replacement;
      index = end - 1;
      continue;
    }

    result += character;
  }

  return {
    text: result,
    changed,
  };
}

function tryParseJsonLike(text) {
  const direct = tryParseJson(text);

  if (direct.ok) {
    return {
      ...direct,
      mode: "json",
    };
  }

  const normalizedJsonLike = normalizeJsonLikeText(text);

  if (!normalizedJsonLike.changed) {
    return {
      ok: false,
      error: direct.error,
      mode: "json",
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(normalizedJsonLike.text.trim()),
      text: normalizedJsonLike.text.trim(),
      mode: "json-like",
    };
  } catch (error) {
    return {
      ok: false,
      error,
      mode: "json-like",
    };
  }
}

function computeBracketPairs(text) {
  const pairs = [];
  const stack = [];
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      stack.push({ character, index });
      continue;
    }

    if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      const latest = stack[stack.length - 1];

      if (!latest || latest.character !== expected) {
        continue;
      }

      stack.pop();
      pairs.push({
        start: latest.index,
        end: index,
        kind: expected === "{" ? "object" : "array",
      });
    }
  }

  return pairs;
}

function findSelectionOffset(contextText, selectionText) {
  if (!selectionText) {
    return -1;
  }

  return contextText.indexOf(selectionText);
}

function findSelectionOffsets(contextText, selectionText) {
  if (!selectionText) {
    return [];
  }

  const offsets = [];
  let searchStart = 0;

  while (searchStart < contextText.length) {
    const index = contextText.indexOf(selectionText, searchStart);

    if (index < 0) {
      break;
    }

    offsets.push({
      start: index,
      end: index + selectionText.length,
    });
    searchStart = index + 1;
  }

  return offsets;
}

export function expandSelectionToJson({
  selectionText,
  contextText,
  selectionStart,
  selectionEnd,
}) {
  const rawSelection = normalizeText(selectionText);
  const rawContext = normalizeText(contextText);
  const debug = {
    rawSelectionPreview: previewText(rawSelection),
    rawSelectionLength: rawSelection.length,
    rawContextPreview: previewText(rawContext, 240),
    rawContextLength: rawContext.length,
    providedSelectionStart: selectionStart,
    providedSelectionEnd: selectionEnd,
  };

  if (!rawSelection.trim()) {
    return {
      status: "error",
      errorKey: "errors.noSelection",
      debug: {
        ...debug,
        failureStage: "empty-selection",
      },
    };
  }

  const directSelection = tryParseJsonLike(rawSelection);
  debug.directSelection = {
    ok: directSelection.ok,
    parsedType: directSelection.ok ? typeof directSelection.value : null,
    isArray: directSelection.ok ? Array.isArray(directSelection.value) : false,
    isObject: directSelection.ok ? isObject(directSelection.value) : false,
    parseMode: directSelection.mode || "json",
  };

  if (directSelection.ok) {
    if (isObject(directSelection.value) || Array.isArray(directSelection.value)) {
      return {
        status: "success",
        source: "selection",
        jsonText: directSelection.text,
        parsed: directSelection.value,
        debug: {
          ...debug,
          resolution: "direct-selection",
          parseMode: directSelection.mode || "json",
        },
      };
    }
  }

  if (!rawContext.trim()) {
    return {
      status: "error",
      errorKey: "errors.expandFailed",
      debug: {
        ...debug,
        failureStage: "empty-context",
      },
    };
  }

  const inferredStart = findSelectionOffset(rawContext, rawSelection);
  const offsetCandidates = [];

  if (
    Number.isInteger(selectionStart) &&
    selectionStart >= 0 &&
    Number.isInteger(selectionEnd) &&
    selectionEnd > selectionStart
  ) {
    offsetCandidates.push({
      start: selectionStart,
      end: selectionEnd,
    });
  }

  if (inferredStart >= 0) {
    offsetCandidates.push({
      start: inferredStart,
      end: inferredStart + rawSelection.length,
    });
  }

  for (const offset of findSelectionOffsets(rawContext, rawSelection)) {
    if (
      !offsetCandidates.some(
        (candidate) => candidate.start === offset.start && candidate.end === offset.end,
      )
    ) {
      offsetCandidates.push(offset);
    }
  }

  debug.offsetCandidates = offsetCandidates;

  if (!offsetCandidates.length) {
    return {
      status: "error",
      errorKey: "errors.expandFailed",
      debug: {
        ...debug,
        failureStage: "no-offset-candidates",
      },
    };
  }

  const bracketPairs = computeBracketPairs(rawContext);
  debug.bracketPairCount = bracketPairs.length;
  debug.bracketPairSample = bracketPairs.slice(0, 20);
  debug.offsetAnalyses = [];

  for (const offset of offsetCandidates) {
    const candidates = bracketPairs
      .filter((pair) => pair.start <= offset.start && pair.end + 1 >= offset.end)
      .sort((left, right) => {
        const leftSize = left.end - left.start;
        const rightSize = right.end - right.start;
        return leftSize - rightSize;
      });
    const offsetAnalysis = {
      offset,
      candidateCount: candidates.length,
      candidates: [],
    };

    for (const candidate of candidates) {
      const candidateText = rawContext.slice(candidate.start, candidate.end + 1);
      const parsed = tryParseJsonLike(candidateText);
      offsetAnalysis.candidates.push({
        start: candidate.start,
        end: candidate.end,
        kind: candidate.kind,
        ok: parsed.ok,
        parseMode: parsed.mode || "json",
        preview: previewText(candidateText, 200),
      });

      if (!parsed.ok) {
        continue;
      }

      debug.offsetAnalyses.push(offsetAnalysis);

      return {
        status: "success",
        source: "expansion",
        jsonText: parsed.text,
        parsed: parsed.value,
        debug: {
          ...debug,
          resolution: "expanded-from-context",
          parseMode: parsed.mode || "json",
          winningOffset: offset,
          winningCandidate: {
            start: candidate.start,
            end: candidate.end,
            kind: candidate.kind,
          },
        },
      };
    }

    debug.offsetAnalyses.push(offsetAnalysis);
  }

  if (directSelection.ok) {
    return {
      status: "success",
      source: "selection",
      jsonText: directSelection.text,
      parsed: directSelection.value,
    };
  }

  return {
    status: "error",
    errorKey: "errors.expandFailed",
    debug: {
      ...debug,
      failureStage: "no-parseable-bracket-candidate",
    },
  };
}

function mergeObjectShape(left, right) {
  const propertyKeys = unique([
    ...Object.keys(left.properties || {}),
    ...Object.keys(right.properties || {}),
  ]);
  const properties = {};

  for (const key of propertyKeys) {
    const leftProperty = left.properties?.[key];
    const rightProperty = right.properties?.[key];

    if (leftProperty && rightProperty) {
      properties[key] = mergeShapes(leftProperty, rightProperty);
      continue;
    }

    properties[key] = leftProperty || rightProperty;
  }

  const required = (left.required || []).filter((key) =>
    (right.required || []).includes(key),
  );

  return {
    kind: "object",
    properties,
    required,
  };
}

function mergeUnionShape(shapes) {
  const flattened = [];

  for (const shape of shapes) {
    if (!shape) {
      continue;
    }

    if (shape.kind === "union") {
      flattened.push(...shape.options);
      continue;
    }

    flattened.push(shape);
  }

  const deduped = [];

  for (const shape of flattened) {
    if (!deduped.some((item) => JSON.stringify(item) === JSON.stringify(shape))) {
      deduped.push(shape);
    }
  }

  if (!deduped.length) {
    return { kind: "any" };
  }

  if (deduped.length === 1) {
    return deduped[0];
  }

  return {
    kind: "union",
    options: deduped,
  };
}

export function mergeShapes(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  if (left.kind === "any" || right.kind === "any") {
    return { kind: "any" };
  }

  if (left.kind === right.kind) {
    if (left.kind === "array") {
      return {
        kind: "array",
        items: mergeShapes(left.items, right.items),
      };
    }

    if (left.kind === "object") {
      return mergeObjectShape(left, right);
    }

    return left;
  }

  return mergeUnionShape([left, right]);
}

export function inferShape(value) {
  if (value === null) {
    return { kind: "null" };
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => inferShape(item));
    const itemShape = items.reduce((previous, current) => mergeShapes(previous, current), null);

    return {
      kind: "array",
      items: itemShape || { kind: "any" },
    };
  }

  if (isObject(value)) {
    const properties = {};

    for (const [key, propertyValue] of Object.entries(value)) {
      properties[key] = inferShape(propertyValue);
    }

    return {
      kind: "object",
      properties,
      required: Object.keys(value),
    };
  }

  if (typeof value === "string") {
    return { kind: "string" };
  }

  if (typeof value === "number") {
    return { kind: "number" };
  }

  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }

  return { kind: "any" };
}

function withSchemaDescriptionPlaceholder(schema, language) {
  return {
    ...schema,
    description: translateMessage(language, "schema.descriptionPlaceholder"),
  };
}

function shapeToJsonSchemaNode(shape, { openAiMode = false, language } = {}) {
  if (!shape) {
    return {};
  }

  switch (shape.kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return { type: shape.kind };
    case "any":
      return {};
    case "array":
      return {
        type: "array",
        items: shapeToJsonSchemaNode(shape.items, { openAiMode, language }),
      };
    case "object": {
      const properties = Object.fromEntries(
        Object.entries(shape.properties || {}).map(([key, value]) => [
          key,
          withSchemaDescriptionPlaceholder(
            shapeToJsonSchemaNode(value, { openAiMode, language }),
            language,
          ),
        ]),
      );
      const schema = {
        type: "object",
        properties,
        required: shape.required || [],
      };

      if (openAiMode) {
        schema.additionalProperties = false;
      }

      return schema;
    }
    case "union": {
      const primitiveTypes = shape.options
        .filter((option) => ["string", "number", "boolean", "null"].includes(option.kind))
        .map((option) => option.kind);

      if (primitiveTypes.length === shape.options.length) {
        return {
          type: primitiveTypes,
        };
      }

      return {
        anyOf: shape.options.map((option) =>
          shapeToJsonSchemaNode(option, { openAiMode, language }),
        ),
      };
    }
    default:
      return {};
  }
}

export function generateJsonSchema(shape, { language } = {}) {
  return shapeToJsonSchemaNode(shape, { openAiMode: false, language });
}

export function generateOpenAiSchema(shape, { language } = {}) {
  const openAiRoot =
    shape.kind === "object"
      ? shape
      : {
          kind: "object",
          properties: {
            data: shape,
          },
          required: ["data"],
        };

  return shapeToJsonSchemaNode(openAiRoot, { openAiMode: true, language });
}

function renderTsProperty(key, shape, isRequired, state, parentName) {
  const propertyName = isValidJsIdentifier(key) ? key : escapeString(key);
  const optionalMark = isRequired ? "" : "?";
  const propertyType = renderTsType(shape, state, `${parentName}${toPascalCase(key)}`);
  return `${propertyName}${optionalMark}: ${propertyType};`;
}

function renderTsType(shape, state, suggestedName) {
  switch (shape.kind) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "any":
      return "any";
    case "array":
      return `Array<${renderTsType(shape.items, state, `${suggestedName}Item`)}>`;
    case "union":
      return unique(
        shape.options.map((option, index) =>
          renderTsType(option, state, `${suggestedName}Option${index + 1}`),
        ),
      ).join(" | ");
    case "object": {
      const typeName = suggestedName || "Root";

      if (!state.typeOrder.includes(typeName)) {
        state.typeOrder.push(typeName);
        const lines = Object.entries(shape.properties || {}).map(([key, value]) =>
          renderTsProperty(key, value, (shape.required || []).includes(key), state, typeName),
        );
        state.typeBodies.set(typeName, lines.length ? lines.join("\n") : "");
      }

      return typeName;
    }
    default:
      return "any";
  }
}

export function generateTypeScript(shape) {
  const state = {
    typeOrder: [],
    typeBodies: new Map(),
  };

  const rootType = renderTsType(shape, state, "Root");

  const definitions = state.typeOrder.map((typeName) => {
    const body = state.typeBodies.get(typeName) || "";
    return `export interface ${typeName} {\n${body ? indent(body) : ""}\n}`;
  });

  if (shape.kind !== "object") {
    definitions.unshift(`export type Root = ${rootType};`);
  }

  return definitions.join("\n\n");
}

function collectTypingImports(typeNames) {
  const preferred = ["Any", "List", "Optional", "Union"];
  return preferred.filter((name) => typeNames.has(name));
}

function renderPythonType(shape, state, suggestedName) {
  switch (shape.kind) {
    case "string":
      return "str";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "null":
      state.typing.add("Optional");
      state.typing.add("Any");
      return "Optional[Any]";
    case "any":
      state.typing.add("Any");
      return "Any";
    case "array":
      state.typing.add("List");
      return `List[${renderPythonType(shape.items, state, `${suggestedName}Item`)}]`;
    case "union": {
      state.typing.add("Union");
      const members = unique(
        shape.options.map((option, index) =>
          renderPythonType(option, state, `${suggestedName}Option${index + 1}`),
        ),
      );
      return `Union[${members.join(", ")}]`;
    }
    case "object": {
      const typeName = suggestedName || "RootModel";

      if (!state.classOrder.includes(typeName)) {
        state.classOrder.push(typeName);
        const lines = [];
        let needsConfig = false;

        for (const [key, value] of Object.entries(shape.properties || {})) {
          const isRequired = (shape.required || []).includes(key);
          let fieldName = isValidPythonIdentifier(key) ? key : toSnakeCase(key);

          if (!isValidPythonIdentifier(fieldName)) {
            fieldName = `field_${lines.length + 1}`;
          }

          const typeValue = renderPythonType(value, state, `${typeName}${toPascalCase(key)}`);
          const needsAlias = fieldName !== key;

          if (needsAlias) {
            needsConfig = true;
          }

          if (!isRequired) {
            state.typing.add("Optional");
          }

          const effectiveType = isRequired ? typeValue : `Optional[${typeValue}]`;
          const defaultValue = isRequired
            ? needsAlias
              ? ` = Field(alias=${escapeString(key)})`
              : ""
            : needsAlias
              ? ` = Field(default=None, alias=${escapeString(key)})`
              : " = None";

          lines.push(`${fieldName}: ${effectiveType}${defaultValue}`);
        }

        if (!lines.length) {
          lines.push("pass");
        }

        const body = [];

        if (needsConfig) {
          body.push("model_config = ConfigDict(populate_by_name=True)");
        }

        body.push(...lines);
        state.classBodies.set(typeName, body.join("\n"));
      }

      return typeName;
    }
    default:
      state.typing.add("Any");
      return "Any";
  }
}

export function generatePydantic(shape) {
  const state = {
    typing: new Set(),
    classOrder: [],
    classBodies: new Map(),
  };

  const rootType = renderPythonType(shape, state, "RootModel");
  const typingImports = collectTypingImports(state.typing);
  const lines = ["from __future__ import annotations"];

  if (typingImports.length) {
    lines.push(`from typing import ${typingImports.join(", ")}`);
  }

  lines.push("from pydantic import BaseModel, ConfigDict, Field");
  lines.push("");

  if (shape.kind !== "object") {
    state.classOrder.unshift("RootModel");
    state.classBodies.set(
      "RootModel",
      `value: ${rootType === "RootModel" ? "Any" : rootType}`,
    );
  }

  for (const className of state.classOrder) {
    lines.push(`class ${className}(BaseModel):`);
    lines.push(indent(state.classBodies.get(className) || "pass"));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function renderGoType(shape, state, suggestedName) {
  switch (shape.kind) {
    case "string":
      return "string";
    case "number":
      return "float64";
    case "boolean":
      return "bool";
    case "null":
    case "any":
      return "interface{}";
    case "array":
      return `[]${renderGoType(shape.items, state, `${suggestedName}Item`)}`;
    case "union":
      return "interface{}";
    case "object": {
      const typeName = suggestedName || "Root";

      if (!state.typeOrder.includes(typeName)) {
        state.typeOrder.push(typeName);
        const fields = [];

        for (const [key, value] of Object.entries(shape.properties || {})) {
          const fieldName = toPascalCase(key, `Field${fields.length + 1}`);
          const isRequired = (shape.required || []).includes(key);
          const suffix = isRequired ? "" : ",omitempty";
          const fieldType = renderGoType(value, state, `${typeName}${toPascalCase(key)}`);
          fields.push(`${fieldName} ${fieldType} \`json:"${key}${suffix}"\``);
        }

        state.typeBodies.set(typeName, fields.join("\n"));
      }

      return typeName;
    }
    default:
      return "interface{}";
  }
}

export function generateGoStruct(shape) {
  const state = {
    typeOrder: [],
    typeBodies: new Map(),
  };

  const rootType = renderGoType(shape, state, "Root");
  const lines = [];

  if (shape.kind !== "object") {
    state.typeOrder.unshift("Root");
    state.typeBodies.set(
      "Root",
      `Value ${rootType === "Root" ? "interface{}" : rootType} \`json:"value"\``,
    );
  }

  for (const typeName of state.typeOrder) {
    lines.push(`type ${typeName} struct {`);
    const body = state.typeBodies.get(typeName) || "";
    lines.push(body ? indent(body) : indent(""));
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function generateEscapedJson(value) {
  return JSON.stringify(JSON.stringify(value));
}

function decodeNestedJsonString(value, maxDepth = 8) {
  let current = value;
  let depth = 0;

  while (typeof current === "string" && depth < maxDepth) {
    const parsed = tryParseJson(current);

    if (!parsed.ok) {
      break;
    }

    current = parsed.value;
    depth += 1;
  }

  return current;
}

export function generateUnescapedJson(value) {
  if (typeof value !== "string") {
    return JSON.stringify(value, null, 2);
  }

  const decoded = decodeNestedJsonString(value);

  if (typeof decoded === "string") {
    return decoded;
  }

  return JSON.stringify(decoded, null, 2);
}

export function buildOutputs(value, { language } = {}) {
  const shape = inferShape(value);
  return {
    prettyJson: JSON.stringify(value, null, 2),
    minifyJson: JSON.stringify(value),
    escapeJson: generateEscapedJson(value),
    unescapeJson: generateUnescapedJson(value),
    jsonSchema: JSON.stringify(generateJsonSchema(shape, { language }), null, 2),
    openAISchema: JSON.stringify(generateOpenAiSchema(shape, { language }), null, 2),
    pydantic: generatePydantic(shape),
    goStruct: generateGoStruct(shape),
    typescript: generateTypeScript(shape),
  };
}
