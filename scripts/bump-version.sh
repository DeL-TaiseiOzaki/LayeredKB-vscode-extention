#!/usr/bin/env bash
# scripts/bump-version.sh -- Prepare a release commit: one version number, one
# CHANGELOG heading, no drift between them.
#
# A release needs package.json's version bumped, package-lock.json kept in sync,
# and the CHANGELOG's "## Unreleased" section renamed to the new version. Done by
# hand these drift apart, and release.yml's tag-vs-version check then fails the
# release after the tag has already been pushed. This script does all of it in
# one deterministic step -- and then stops.
#
# It deliberately does NOT commit, tag, or push. Pushing a `v*` tag is what
# publishes to the Marketplace, and that irreversible act stays a human's
# explicit decision; the exact commands are printed for you to run after
# reviewing the diff.
#
# REFUSES TO RUN when the working tree is not clean (an untracked file is
# exactly what leaks into a package), when there is no "## Unreleased" section
# or it is empty (releasing with no notes is the failure mode this prevents), or
# when the target version already has a CHANGELOG heading.
#
# USAGE
#   ./scripts/bump-version.sh <patch|minor|major|X.Y.Z> [--dry-run]
#
#   patch|minor|major  Derive the next version from the current one.
#   X.Y.Z              Use this exact version (a leading "v" is stripped).
#   --dry-run          Print what would change and touch nothing. A dirty tree
#                      is reported as a warning here instead of an error, so the
#                      preview still works before you clean up.
#   -h, --help         Print this help and exit 0.
#
# EXIT CODES
#   0  Bump applied, or dry-run completed.
#   1  Bad usage, or a precondition refused the bump.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MANIFEST="${ROOT}/package.json"
CHANGELOG="${ROOT}/CHANGELOG.md"
UNRELEASED_HEADING='## Unreleased'

TARGET_ARG=""
DRY_RUN=false

usage() {
    sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d;s/^# \{0,1\}//;s/^#$//'
}

die() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h | --help)
            usage
            exit 0
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -*)
            die "unknown option: $1 (see --help)"
            ;;
        *)
            [[ -z "${TARGET_ARG}" ]] || die "only one version argument may be given"
            TARGET_ARG="$1"
            shift
            ;;
    esac
done

[[ -n "${TARGET_ARG}" ]] || die "a version or patch|minor|major is required (see --help)"
[[ -f "${MANIFEST}" ]] || die "package.json not found: ${MANIFEST}"
[[ -f "${CHANGELOG}" ]] || die "CHANGELOG.md not found: ${CHANGELOG}"

CURRENT="$(node -p "require('${MANIFEST}').version")"
[[ -n "${CURRENT}" ]] || die "could not read the current version from package.json"

# ---------------------------------------------------------------------------
# 1) Resolve the target version
# ---------------------------------------------------------------------------
next_version() {
    local level="$1"
    local current="$2"
    if [[ ! "${current}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        die "current version '${current}' is not a plain X.Y.Z; pass the target version explicitly"
    fi
    local major="${current%%.*}"
    local rest="${current#*.}"
    local minor="${rest%%.*}"
    local patch="${rest#*.}"
    case "${level}" in
        major) printf '%d.0.0\n' "$((major + 1))" ;;
        minor) printf '%d.%d.0\n' "${major}" "$((minor + 1))" ;;
        patch) printf '%d.%d.%d\n' "${major}" "${minor}" "$((patch + 1))" ;;
    esac
}

case "${TARGET_ARG}" in
    major | minor | patch)
        NEW_VERSION="$(next_version "${TARGET_ARG}" "${CURRENT}")"
        ;;
    *)
        NEW_VERSION="${TARGET_ARG#v}"
        if [[ ! "${NEW_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
            die "'${TARGET_ARG}' is neither patch|minor|major nor a X.Y.Z version"
        fi
        ;;
esac

[[ "${NEW_VERSION}" != "${CURRENT}" ]] || die "the new version is the same as the current one (${CURRENT})"

# Monotonicity is only checkable without a semver library when both sides are
# plain triples; say so instead of pretending to have checked.
if [[ "${CURRENT}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "${NEW_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    IFS='.' read -r cur_major cur_minor cur_patch <<<"${CURRENT}"
    IFS='.' read -r new_major new_minor new_patch <<<"${NEW_VERSION}"
    if ((new_major < cur_major)) ||
        ((new_major == cur_major && new_minor < cur_minor)) ||
        ((new_major == cur_major && new_minor == cur_minor && new_patch < cur_patch)); then
        die "${NEW_VERSION} is lower than the current version ${CURRENT}"
    fi
else
    echo "INFO: ${CURRENT} -> ${NEW_VERSION} involves a pre-release; ordering not checked"
fi

# ---------------------------------------------------------------------------
# 2) Preconditions
# ---------------------------------------------------------------------------
DIRTY="$(cd "${ROOT}" && git status --porcelain)"
if [[ -n "${DIRTY}" ]]; then
    if [[ "${DRY_RUN}" == true ]]; then
        echo "WARN: working tree is not clean; a real run would refuse:"
        printf '%s\n' "${DIRTY}" | sed 's/^/        /'
    else
        echo "FAIL: working tree is not clean; commit or stash first:" >&2
        printf '%s\n' "${DIRTY}" | sed 's/^/        /' >&2
        exit 1
    fi
fi

# changelog-section.sh is the single implementation of "does this exact heading
# exist": it exits 3 for a missing section, 4 for an empty one, 0 for a section
# with content.
set +e
"${SCRIPT_DIR}/changelog-section.sh" "${NEW_VERSION}" --file "${CHANGELOG}" >/dev/null 2>&1
EXISTING_STATUS=$?
set -e
if [[ ${EXISTING_STATUS} -ne 3 ]]; then
    die "CHANGELOG.md already has a '## ${NEW_VERSION}' section"
fi

# The same call, for the section that must exist and must not be empty.
set +e
UNRELEASED_NOTES="$("${SCRIPT_DIR}/changelog-section.sh" Unreleased --file "${CHANGELOG}" 2>&1)"
NOTES_STATUS=$?
set -e
if [[ ${NOTES_STATUS} -ne 0 ]]; then
    echo "FAIL: cannot release without release notes:" >&2
    printf '%s\n' "${UNRELEASED_NOTES}" | sed 's/^/        /' >&2
    echo "      add the changes under '${UNRELEASED_HEADING}' in CHANGELOG.md first." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 3) Report, then apply
# ---------------------------------------------------------------------------
echo "Version:   ${CURRENT} -> ${NEW_VERSION}"
echo "CHANGELOG: '${UNRELEASED_HEADING}' -> '## ${NEW_VERSION}'"
echo "Notes that will become the GitHub Release body:"
printf '%s\n' "${UNRELEASED_NOTES}" | sed 's/^/        /'
echo ""

if [[ "${DRY_RUN}" == true ]]; then
    echo "DRY RUN: nothing was modified."
    echo "Re-run without --dry-run to apply:"
    echo "        ./scripts/bump-version.sh ${TARGET_ARG}"
    exit 0
fi

# Build the new CHANGELOG first: if this fails, nothing has been modified yet.
TEMP_CHANGELOG="$(mktemp)"
trap 'rm -f "${TEMP_CHANGELOG}"' EXIT
awk -v heading="${UNRELEASED_HEADING}" -v replacement="## ${NEW_VERSION}" '
    !done_replacing { line = $0; sub(/[ \t]+$/, "", line) }
    !done_replacing && line == heading { print replacement; done_replacing = 1; next }
    { print }
    END { if (!done_replacing) { exit 5 } }
' "${CHANGELOG}" >"${TEMP_CHANGELOG}" ||
    die "could not rewrite '${UNRELEASED_HEADING}' in CHANGELOG.md; nothing was modified"

(cd "${ROOT}" && npm version "${NEW_VERSION}" --no-git-tag-version >/dev/null)

APPLIED="$(node -p "require('${MANIFEST}').version")"
[[ "${APPLIED}" == "${NEW_VERSION}" ]] ||
    die "package.json now says '${APPLIED}' instead of '${NEW_VERSION}'; inspect and revert"

cp "${TEMP_CHANGELOG}" "${CHANGELOG}"

echo "PASS: package.json, package-lock.json and CHANGELOG.md updated for ${NEW_VERSION}."
echo ""
echo "Review the diff, then run these yourself (nothing is committed or tagged for you):"
echo "        git diff"
echo "        npm run compile && ./scripts/check-vsix-contents.sh"
echo "        git add package.json package-lock.json CHANGELOG.md"
echo "        git commit -m \"${NEW_VERSION}\""
echo "        git tag v${NEW_VERSION}"
echo "        git push origin HEAD"
echo "        git push origin v${NEW_VERSION}    # this is what publishes to the Marketplace"
echo ""
echo "The next change adds a fresh '${UNRELEASED_HEADING}' section; it is intentionally not created empty here."
exit 0
