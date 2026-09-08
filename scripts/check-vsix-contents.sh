#!/usr/bin/env bash
# scripts/check-vsix-contents.sh -- Allow-list guard for what gets published.
#
# .vscodeignore is a deny-list: anything added to the repository that nobody
# remembered to deny is silently shipped to the Marketplace. That is how the
# agent-scaffolding directories (.claude/, .agents/, .codex/, scripts/, ...)
# once grew the package from 8 files / 31 KB to 148 files / 630 KB while CI
# stayed green. This script closes that hole from the other side: it asks vsce
# what it would actually package and fails on anything not on the allow-list
# below. It verifies the effect of .vscodeignore rather than re-stating its rules.
#
# Requires a build first (dist/extension.js must exist): run `npm run compile`.
#
# FAIL CLOSED
#   Every way this check can fail to produce an answer is a failure, never a
#   pass: `vsce ls` erroring, an empty listing, an empty allow-list, a missing
#   .vscodeignore, or a required file that is absent from the package.
#
# USAGE
#   ./scripts/check-vsix-contents.sh [--list] [--help]
#
#   --list      Print the file list vsce reports and exit 0 without judging it.
#   -h, --help  Print this help and exit 0.
#
# EXIT CODES
#   0  The package contains exactly the expected files.
#   1  Unexpected and/or missing files, or the listing could not be produced.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# The complete set of paths allowed in the published package. These are bash
# patterns, and bash's `*` also matches `/`, so `dist/*` means `dist/**`.
# Kept in the script rather than in a data file: the list is the check, it is
# six lines long, nothing else consumes it, and a separate file would add a
# failure mode (missing or truncated => nothing to compare against) to a guard
# whose whole point is to fail closed.
ALLOWED_PATTERNS=(
    'package.json'
    'README.md'
    'LICENSE'
    'CHANGELOG.md'
    'images/icon.png'
    'dist/*'
)

# Files whose absence means the package is broken even though nothing leaked.
REQUIRED_PATHS=(
    'package.json'
    'README.md'
    'LICENSE'
    'CHANGELOG.md'
    'images/icon.png'
)

# At least one file must come from this directory (the bundled extension code).
REQUIRED_PREFIX='dist/'

LIST_ONLY=false

usage() {
    sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d;s/^# \{0,1\}//;s/^#$//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h | --help)
            usage
            exit 0
            ;;
        --list)
            LIST_ONLY=true
            shift
            ;;
        *)
            echo "ERROR: unknown option: $1 (see --help)" >&2
            exit 1
            ;;
    esac
done

is_allowed() {
    local entry="$1"
    local pattern
    for pattern in "${ALLOWED_PATTERNS[@]}"; do
        # shellcheck disable=SC2053  # right side is a pattern on purpose
        if [[ "${entry}" == ${pattern} ]]; then
            return 0
        fi
    done
    return 1
}

if [[ ${#ALLOWED_PATTERNS[@]} -eq 0 ]]; then
    echo "FAIL: the allow-list is empty; refusing to approve any package" >&2
    exit 1
fi

if [[ ! -f "${ROOT}/.vscodeignore" ]]; then
    echo "FAIL: .vscodeignore is missing; the package would include the whole repository" >&2
    exit 1
fi

# `vsce ls` reports the files `vsce package` would collect, from the same code
# path, and does not run vscode:prepublish -- so this stays a read-only check.
LISTING_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "${LISTING_FILE}" "${ERROR_FILE}"' EXIT

if ! (cd "${ROOT}" && npx --no @vscode/vsce ls) >"${LISTING_FILE}" 2>"${ERROR_FILE}"; then
    echo "FAIL: \`vsce ls\` failed; cannot verify the package contents" >&2
    sed 's/^/      /' "${ERROR_FILE}" >&2
    echo "      hint: run \`npm ci\` so the local @vscode/vsce is available" >&2
    exit 1
fi

# Read into an array without `mapfile`, which macOS's bash 3.2 does not have.
PACKAGED=()
while IFS= read -r line; do
    [[ -z "${line//[[:space:]]/}" ]] && continue
    PACKAGED+=("${line}")
done <"${LISTING_FILE}"

if [[ ${#PACKAGED[@]} -eq 0 ]]; then
    echo "FAIL: \`vsce ls\` reported no files at all; cannot verify the package contents" >&2
    exit 1
fi

if [[ "${LIST_ONLY}" == true ]]; then
    printf '%s\n' "${PACKAGED[@]}"
    exit 0
fi

UNEXPECTED=()
for entry in "${PACKAGED[@]}"; do
    if ! is_allowed "${entry}"; then
        UNEXPECTED+=("${entry}")
    fi
done

MISSING=()
for required in "${REQUIRED_PATHS[@]}"; do
    found=false
    for entry in "${PACKAGED[@]}"; do
        if [[ "${entry}" == "${required}" ]]; then
            found=true
            break
        fi
    done
    if [[ "${found}" == false ]]; then
        MISSING+=("${required}")
    fi
done

found_prefix=false
for entry in "${PACKAGED[@]}"; do
    if [[ "${entry}" == "${REQUIRED_PREFIX}"* ]]; then
        found_prefix=true
        break
    fi
done
if [[ "${found_prefix}" == false ]]; then
    MISSING+=("${REQUIRED_PREFIX}* (run \`npm run compile\` first)")
fi

if [[ ${#UNEXPECTED[@]} -gt 0 ]]; then
    echo "FAIL: ${#UNEXPECTED[@]} file(s) would be published that are not on the allow-list:" >&2
    printf '        %s\n' "${UNEXPECTED[@]}" >&2
    echo "      Add a matching rule to .vscodeignore, or -- if this file really belongs" >&2
    echo "      in the extension -- extend ALLOWED_PATTERNS in ${0#"${ROOT}/"}." >&2
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo "FAIL: ${#MISSING[@]} required file(s) are missing from the package:" >&2
    printf '        %s\n' "${MISSING[@]}" >&2
fi

if [[ ${#UNEXPECTED[@]} -gt 0 || ${#MISSING[@]} -gt 0 ]]; then
    echo "" >&2
    echo "Package contents as reported by \`vsce ls\` (${#PACKAGED[@]} files):" >&2
    printf '        %s\n' "${PACKAGED[@]}" >&2
    exit 1
fi

echo "PASS: package contents match the allow-list (${#PACKAGED[@]} files)"
printf '      %s\n' "${PACKAGED[@]}"
exit 0
