#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MANIFEST_PATH="${REPO_ROOT}/manifest.json"
DIST_DIR="${REPO_ROOT}/dist"

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "Error: manifest.json was not found at ${MANIFEST_PATH}." >&2
  exit 1
fi

VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "${MANIFEST_PATH}" | head -n 1)"

if [[ -z "${VERSION}" ]]; then
  echo "Error: failed to read version from manifest.json." >&2
  exit 1
fi

DATE_TAG="$(date +%Y%m%d)"
SUFFIX="${1:-}"
ARCHIVE_BASENAME="json-for-llm-v${VERSION}-${DATE_TAG}"

if [[ -n "${SUFFIX}" ]]; then
  ARCHIVE_BASENAME="${ARCHIVE_BASENAME}-${SUFFIX}"
fi

ARCHIVE_PATH="${DIST_DIR}/${ARCHIVE_BASENAME}.zip"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/json-for-llm-release.XXXXXX")"
PACKAGE_DIR="${STAGING_DIR}/package"

cleanup() {
  rm -rf "${STAGING_DIR}"
}

trap cleanup EXIT

mkdir -p "${DIST_DIR}" "${PACKAGE_DIR}"

copy_if_exists() {
  local source_path="$1"
  local target_path="$2"

  if [[ -e "${source_path}" ]]; then
    mkdir -p "$(dirname "${target_path}")"
    cp -R "${source_path}" "${target_path}"
  fi
}

copy_if_exists "${REPO_ROOT}/manifest.json" "${PACKAGE_DIR}/manifest.json"
copy_if_exists "${REPO_ROOT}/_locales" "${PACKAGE_DIR}/_locales"
copy_if_exists "${REPO_ROOT}/src" "${PACKAGE_DIR}/src"
copy_if_exists "${REPO_ROOT}/assets" "${PACKAGE_DIR}/assets"
copy_if_exists "${REPO_ROOT}/LICENSE" "${PACKAGE_DIR}/LICENSE"
copy_if_exists "${REPO_ROOT}/README.md" "${PACKAGE_DIR}/README.md"

rm -f "${PACKAGE_DIR}/src/temp"
rm -rf "${PACKAGE_DIR}/src/temp/"

if [[ -f "${ARCHIVE_PATH}" ]]; then
  rm -f "${ARCHIVE_PATH}"
fi

(
  cd "${PACKAGE_DIR}"
  zip -qr "${ARCHIVE_PATH}" .
)

echo "Created release archive:"
echo "${ARCHIVE_PATH}"
