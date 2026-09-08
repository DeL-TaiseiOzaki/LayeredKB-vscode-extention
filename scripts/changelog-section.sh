#!/usr/bin/env bash
# scripts/changelog-section.sh -- Print one section of CHANGELOG.md on stdout.
#
# Used by scripts/bump-version.sh (to require a non-empty "## Unreleased") and by
# .github/workflows/release.yml (to build the GitHub Release body from the
# hand-written CHANGELOG instead of a generated commit list).
#
# The heading is matched by exact string comparison against "## <heading>", so
# "0.2.0" matches only "## 0.2.0" -- never "## 0.2.0-beta" and never "## 0.20.0".
# The section runs to the next "## " heading or to the end of the file; the
# heading line itself and the surrounding blank lines are not printed.
#
# USAGE
#   ./scripts/changelog-section.sh <heading> [--file PATH]
#
#   <heading>   Version ("0.2.0"), tag ("v0.2.0" -- a leading "v" before a digit
#               is stripped), or any literal heading text such as "Unreleased".
#   --file PATH CHANGELOG to read. Default: CHANGELOG.md next to this script's
#               repository root.
#   -h, --help  Print this help and exit 0.
#
# EXIT CODES
#   0  Section found and printed.
#   1  Bad usage, or the CHANGELOG file does not exist.
#   3  No such section.
#   4  Section exists but is empty (heading with no content under it).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CHANGELOG="${ROOT}/CHANGELOG.md"
HEADING=""

usage() {
    sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d;s/^# \{0,1\}//;s/^#$//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h | --help)
            usage
            exit 0
            ;;
        --file)
            [[ $# -ge 2 ]] || { echo "ERROR: --file needs a path" >&2; exit 1; }
            CHANGELOG="$2"
            shift 2
            ;;
        -*)
            echo "ERROR: unknown option: $1 (see --help)" >&2
            exit 1
            ;;
        *)
            [[ -z "${HEADING}" ]] || { echo "ERROR: only one heading may be given" >&2; exit 1; }
            HEADING="$1"
            shift
            ;;
    esac
done

if [[ -z "${HEADING}" ]]; then
    echo "ERROR: a heading is required (see --help)" >&2
    exit 1
fi

if [[ ! -f "${CHANGELOG}" ]]; then
    echo "ERROR: CHANGELOG not found: ${CHANGELOG}" >&2
    exit 1
fi

# "v0.2.0" (a tag) and "0.2.0" (a version) address the same heading.
if [[ "${HEADING}" =~ ^v[0-9] ]]; then
    HEADING="${HEADING#v}"
fi

set +e
awk -v want="## ${HEADING}" '
    { line = $0; sub(/[ \t]+$/, "", line) }
    line == want { inside = 1; found = 1; next }
    inside && line ~ /^## / { inside = 0 }
    inside {
        buffer[++count] = $0
        if (line != "") { last = count }
    }
    END {
        if (!found) { exit 3 }
        first = 1
        while (first <= last && buffer[first] == "") { first++ }
        for (i = first; i <= last; i++) { print buffer[i] }
        if (first > last) { exit 4 }
    }
' "${CHANGELOG}"
STATUS=$?
set -e

case "${STATUS}" in
    0) exit 0 ;;
    3)
        echo "ERROR: no '## ${HEADING}' section in ${CHANGELOG}" >&2
        exit 3
        ;;
    4)
        echo "ERROR: the '## ${HEADING}' section in ${CHANGELOG} is empty" >&2
        exit 4
        ;;
    *)
        echo "ERROR: failed to read ${CHANGELOG} (awk exited ${STATUS})" >&2
        exit 1
        ;;
esac
