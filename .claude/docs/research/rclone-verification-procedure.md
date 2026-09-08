# Verifying the multi-drive `contents/` assumptions on a real Mac / Windows machine

**Status:** verification procedure, not a design document. It tests claims made in
`.claude/docs/research/drive-mount-and-team-cli-2026-09.md` (the research) against
`.claude/docs/plans/multi-drive-contents-2026-09.md` (the design that depends on them).
**Why this document exists:** this repository's own dev container has no `rclone`, no
`/dev/fuse`, no Obsidian, and no Google account signed in, so none of the research's
"Unverified" claims (§6 of the research doc) could be exercised there. Everything below has
to be run by a human, on their own Mac or Windows machine, at least once.

**Companion script:** `scripts/verify-rclone-mount.sh` automates what it safely can. Read
its `--help` output (or the header comment) for the full flag/environment-variable list; this
document explains *why* each check exists and what a failure means, and covers the checks the
script cannot run at all (Windows, Obsidian).

## How to use this document

1. Run `scripts/verify-rclone-mount.sh --help` once to see what it automates.
2. Work through checks 1-8 below in order (check 8 splits into 8a and 8b — see "What
   controls what" right after Prerequisites for why). Each one names whether it is
   **automated** (run the script, optionally with a flag) or **manual** (Windows, Obsidian —
   do this by hand, following the exact steps given).
3. Every check states **what it proves**, **the command**, **the expected result**, and
   **what it means if it fails** — read that last part before running anything. A check whose
   failure has no consequence for the design is not included here.
4. Record your results using the template in "Results log" at the end. Do not paste raw
   `rclone config show`/`config dump` output, `rclone.conf`, or OAuth/refresh tokens into that
   log, into chat, or into a ticket — see Safety below.

## Prerequisites

- macOS: `brew install rclone` (and `brew install fswatch` if you want check 4 automated).
  For an actual mount you additionally need a FUSE layer — macFUSE or FUSE-T — or you can use
  `rclone nfsmount` instead of `rclone mount` to avoid FUSE entirely; see the research doc §2.2.
- A Google account already configured as an rclone remote (`rclone config`, type `drive`),
  ideally one that has access to at least one Shared Drive — without that, check 1 will only
  prove the mechanism against My Drive alone.
- Windows: WinFsp (<https://winfsp.dev>) for `rclone mount`; Git for Windows for
  `git check-ignore`; an administrator or Developer-Mode account for `mklink /D`.
- Obsidian: only if you intend to run check 7, and only against a **throwaway vault**.

## What controls what

There are **two independent, unrelated settings** that decide whether a mount is visible, and
which one applies depends entirely on *where* the mount lives. This is the split check 8a/8b
exists to make legible — a reader who mounts at `contents/drive` and sees nothing needs to know
which of the two knobs is theirs before touching either one.

| Mount location | Read by | Governing setting | Default | Default source |
|---|---|---|---|---|
| **Inside the workspace** (e.g. `contents/drive` — the design's primary case) | VS Code's own `vscode.workspace.findFiles()`, called from `scanWorkspace()` in `src/workspaceIndex.ts` | `search.followSymlinks` (a **VS Code editor setting**, not this extension's) | **`true`** | Confirmed directly against this repo's own downloaded test binary: `.vscode-test/vscode-linux-x64-1.136.1/resources/app/out/vs/workbench/workbench.desktop.main.js` registers `"search.followSymlinks":{type:"boolean",...,default:!0}`. `@types/vscode`'s `findFiles` JSDoc does not spell out that it consults this exact setting — that link is architectural (both are documented to share VS Code's search engine), not a verbatim primary-source statement, so treat "the setting exists with default `true`" as confirmed and "findFiles specifically honours it" as high-confidence inference, not a proven fact. |
| **A layer's external `roots`** (outside the workspace) | This extension's own `walkDirectory()` in `src/walk.ts`, called from `scanExternal()` | `layeredkb.followSymlinks` (this **extension's own setting**) | **`false`** | This extension's own `package.json` configuration contribution (`layeredkb.followSymlinks`, `"default": false`). |

Both settings can be overridden per-workspace in `.vscode/settings.json`; checks 8a/8b read
that file (path configurable via `--workspace-settings`) and report the *effective* value, not
just the shipped default.

## Safety

- The script is read-only by default. The one write it can perform (check 4) is gated behind
  `--allow-write` and is a single named file created and removed inside a subdirectory it
  creates under the mount you point it at.
- The script never runs `rm -rf`, never mounts or unmounts anything itself (you create the
  mount yourself, in your own terminal, before pointing `--mount-path` at it), and never
  touches `rclone.conf` or any credential.
- Raw `rclone` output that could contain drive/team names (check 1) is written to a file
  under the script's own scratch directory (`chmod 600`), never printed to your terminal. The
  script prints that file's path at the end and does **not** delete it automatically — review
  it, then remove the scratch directory yourself when you are done.
- Never paste `rclone.conf`, `rclone config show`/`config dump` output, or any OAuth/refresh
  token into this document, a commit, chat, or a ticket. If you need to share a failure, share
  the exit code and the last few non-sensitive lines only.

## The checks

### 1. Combine remote exposes My Drive and every Shared Drive as siblings — AUTOMATED

**What it proves:** the single decisive capability the whole "one mount instead of N
symlinks" idea depends on (research §2.1): `rclone backend -o config drives <remote>:`
generates a `combine` remote whose `upstreams` list includes My Drive and every Shared Drive
the account can see, as sibling subdirectories of one remote.

**Command:**

```bash
rclone config                       # one-time: create a `drive:` remote if you don't have one
scripts/verify-rclone-mount.sh --only 1
# or, to see the raw (unredacted) output yourself, run the underlying command directly:
rclone backend -o config drives drive:
```

**Expected result:** `PASS`, with an upstream count greater than 1 if the account has at
least one Shared Drive. The emitted config block looks like:

```
[AllDrives]
type = combine
upstreams = "My Drive=My Drive:" "Test Drive=Test Drive:"
```

This command does **not** write to `rclone.conf` — you still paste the `[AllDrives]` section
in yourself before the remote is mountable.

**What it means if it fails:** if this account genuinely has Shared Drives and the command
still does not produce a `combine` section (or errors), the entire premise of "several drives,
one mount, one `contents/` entry" is false for this rclone version/account. There is no reason
to introduce a FUSE layer at all in that case — fall back to what the research already
confirmed works on macOS: one symlink per drive, still inside a real `contents/` (research
§3.3). This is **the single most decisive check in this whole procedure**: if the user runs
only one check, it should be this one, because its answer decides whether rclone is worth
adopting over the already-working symlink approach at all.

### 2. A mount/symlink inside a real `contents/` stays git-ignored; `contents/` itself as a symlink does not — AUTOMATED, no rclone or Drive account needed

**What it proves:** the specific trap the design note calls out — a trailing-slash
`.gitignore` pattern like `contents/` only matches paths whose `contents` segment is an actual
directory on disk. If `contents` itself were ever replaced with a symlink, the pattern would
stop matching it. A mount or symlink placed *inside* an un-touched, real `contents/` directory
is a different, safe case: the parent segment is still a real directory, so everything beneath
it is still excluded regardless of what the leaf entries are.

**Command:**

```bash
scripts/verify-rclone-mount.sh --only 2
```

This is fully synthetic — it builds a throwaway git repo under its own scratch directory and
never touches rclone, Drive, or your real `contents/`. It runs identically on Linux, so it is
one of the two checks this procedure could already run in the dev container that produced the
research (the other being the environment banner).

**Expected result:** `PASS`. The message states that a symlink placed inside a real
`contents/` was ignored, and that a symlinked `contents` itself was not (or, on some git
versions, that the trap did not reproduce — the script treats only the first half, the design's
actual shape, as pass/fail-bearing).

**What it means if it fails:** if the *safe* case (mount inside a real `contents/`) is not
ignored on your git version, the single-`.gitignore`-line design is broken outright — do not
attach any mount until you understand why (check for a conflicting `.gitignore`/`.git/info/exclude`
rule, or an unusually old/new git). This would force reintroducing the per-mount ignore rules
the design specifically exists to avoid (research §5.1 point 3).

### 3. Windows: `rclone mount` onto a nonexistent `contents\` subdirectory vs. `mklink /J` vs. `mklink /D` — MANUAL (Windows only)

**What it proves:** three different ways to get a Shared Drive to appear inside `contents\`,
and which ones actually work. The research already established that `mklink /J` (a junction)
fails against Google Drive's FAT-reporting virtual volume, and left `mklink /D` (a true NTFS
symbolic link) and `rclone mount` onto a not-yet-existing subdirectory unverified.

**Commands (PowerShell, run from inside the repo, with `contents\` already existing as a
plain folder — never delete or recreate `contents` itself for this test):**

```powershell
# (a) The already-suspected failure: a junction into a Shared Drive.
# Replace the target with a real Shared Drive path under your Drive-for-Desktop root.
mklink /J contents\team-drive-junction "G:\Shared drives\<some shared drive>"

# (b) The unverified case: a true NTFS symbolic link. Needs an elevated prompt or
# Developer Mode (SeCreateSymbolicLinkPrivilege).
mklink /D contents\team-drive-symlink "G:\Shared drives\<some shared drive>"
# Then, from Git Bash or PowerShell with Git for Windows on PATH:
git check-ignore -v contents/team-drive-symlink
# ...and confirm you can actually list and open a file through it, not just that the link exists.

# (c) The rclone case: mount directly onto a path that does not exist yet, one level under
# an existing contents\. WinFsp must already be installed (https://winfsp.dev).
rclone mount AllDrives: contents\team-drive-rclone --vfs-cache-mode writes
# (run in its own window/job; Ctrl+C or a second `rclone rc` call to stop it)
```

**Expected result:** (a) fails, reproducing the research's documented failure. (b) is
unverified — record whether the symlink is created at all, and if so whether it resolves to
readable/writable files. (c) succeeds, per the rclone documentation cited in the research
(§2.2): rclone can mount onto "a path representing a nonexistent subdirectory of an existing
parent directory," which `contents\team-drive-rclone` is.

**What it means if it fails:**
- If (c) also fails: Windows has **no confirmed working mechanism** to embed a Shared Drive
  inside `contents\` at all, which is a genuine, permanent platform gap — the manifest must
  report `not-configured` for team-scope mounts on that machine (design §6) rather than the
  tooling silently pretending it works.
- If (b) succeeds: it becomes a lighter-weight alternative to rclone specifically on Windows,
  worth recording either way — this resolves the research's single highest-value open item
  (research §6, item 1).
- (a) failing is expected and confirmatory, not alarming — it is the case that motivated this
  whole procedure.

### 4. Local writes through the mount produce a filesystem event — AUTOMATED, opt-in write

**What it proves:** whether editors/indexers watching the mount can rely on a live update, or
must poll/rescan explicitly. The design has already assumed the pessimistic answer ("do not
rely on a watcher for anything under `contents/`," research §7 recommendation #4) — this check
either confirms that assumption or finds it overly cautious.

**Command:**

```bash
mkdir -p contents/verify-test
rclone mount drive: contents/verify-test --vfs-cache-mode writes &   # your own terminal, your own account
scripts/verify-rclone-mount.sh --mount-path contents/verify-test --allow-write --only 4
# afterwards: kill the rclone mount job, then `umount contents/verify-test` (macOS)
```

Without `--allow-write` this check always SKIPs — writing something through the mount is
unavoidable to observe a write event at all, so this is the one check in the script gated
behind an explicit opt-in (see Safety above).

**Expected result:** most likely `FAIL` (no event observed within 15 seconds), which is the
*expected, safe* outcome. `PASS` (an event fires) is a pleasant bonus, not something to design
around, because it does not tell you whether VS Code's or Obsidian's *own* file watcher behaves
the same way over this specific mount type.

**What it means if it fails (i.e., if it "passes" in the intuitive sense — no event fires):**
confirms FR-7's explicit rescan command is mandatory, not a nice-to-have — nothing under
`contents/` should ever assume a watcher will notice a remote-side or even a local-side change.
If it unexpectedly *succeeds* reliably, it is still not safe to build a design around, for the
reason above — but it is worth noting for a future "trigger a rescan automatically after a
local save" optimization.

### 5. Recursive listing time and Drive rate-limit exposure — AUTOMATED, read-only, bounded by default

**What it proves:** how expensive a `readdir`-based scan (what FR-7's rescan does, through
either `vscode.workspace.findFiles()` or this extension's own `walkDirectory()` depending on
where the mount lives — see "What controls what" above and check 8a/8b) is against a real
mount, and whether it risks the documented ~2 files/second Drive rate limit (research §2.5).

**Command:**

```bash
scripts/verify-rclone-mount.sh --mount-path contents/personal-drive --only 5
# add --deep for a full recursive walk instead of the default depth-2 scan -- see the warning below
```

**Expected result:** `PASS`, reporting a file count and elapsed time. By default the scan is
bounded to depth 2 specifically so that running this check does not itself become the thing
that trips the rate limit; `--deep` does a full recursive walk and is explicitly the scenario
most likely to trigger throttling — **do not run `--deep` repeatedly in a short window**, and
expect it to take a long time on a large tree (the research cites a documented benchmark: a
similarly sized tree took over 22 minutes without `--fast-list`).

**What it means if it fails:** a rate-limit error appearing during a read-only listing means
any eager, unbounded FR-7 rescan (e.g., on every save, or on every extension activation) must
instead be throttled, debounced, or made depth-bounded/lazy by default — an eager full walk on
activation is not safe to ship as-is.

### 6. macOS File Provider: does a metadata-only scan pull file bytes? — AUTOMATED, read-only, macOS only

**What it proves:** whether a plain `readdir`+`stat` pass (no file content ever opened) forces
Google Drive for Desktop to download a placeholder file's bytes, or whether it stays a
cloud-only placeholder. This decides whether a naive orphan/dangling-reference scan is safe to
run eagerly, or must be opt-in and size-bounded (design §8: "Hashing an unhydrated file can
force a multi-GB download").

**Command:**

```bash
scripts/verify-rclone-mount.sh --only 6
# or, if auto-detection of ~/Library/CloudStorage/GoogleDrive-* doesn't find your account:
scripts/verify-rclone-mount.sh --file-provider-path "$HOME/Library/CloudStorage/GoogleDrive-you@example.com" --only 6
```

This check never opens a file's contents — only `find` (directory listing) and `stat`
(metadata) are used, which is the point of the test.

**Expected result:** `PASS`, reporting that at least one sampled file still looks like a
cloud-only placeholder (on-disk blocks smaller than the reported size) after the scan touched
it. If every sampled file was already fully materialized before the scan ran, you get `SKIP`
(inconclusive, not a pass) — try again against a larger tree, or right after using Drive for
Desktop's "Free up space" action so you have a genuinely cloud-only file to sample.

**What it means if it fails:** if metadata-only access turns out to force materialization,
then even FR-7's basic rescan (not just an opt-in integrity check) would silently download
arbitrary amounts of data on every scan — this is a much stronger constraint than the design
currently assumes, and `present-unhydrated` handling would need to move earlier, into the scan
itself rather than only into hash/integrity checks.

### 7. Obsidian's indexer over a mounted vault path — MANUAL ONLY, throwaway vault only

**Use a brand-new or duplicated throwaway vault. Never point Obsidian at your real vault for
this test.** Obsidian's own documentation is explicit: "We strongly advise against using
symbolic links. By using symbolic links and junctions in your vault, you risk losing or
corrupting your data, or crashing Obsidian" (<https://obsidian.md/help/symlinks>, quoted in the
research §5.1). This check exists specifically to see whether that risk materializes for this
design's shape (a real `contents/` with a mount or symlink inside it) — treat any data loss
during this test as expected and acceptable *because it is a throwaway vault*, not something to
be surprised by.

**Steps:**

1. Create a new, empty Obsidian vault somewhere disposable (e.g., `~/ObsidianVaultThrowaway`).
   Do **not** open your real vault for this.
2. Create a `contents/` folder inside it, and inside that, either a symlink to a small test
   folder in your Drive, or an rclone mount (same commands as check 4/5, pointed at this
   throwaway vault's `contents/` instead of the repo's).
3. Open the throwaway vault in Obsidian. Watch for: does the mounted folder appear in the file
   explorer at all? Does it descend into it? Does search find files inside it? Does Obsidian
   hang, crash, or report a corruption warning?
4. Try renaming/moving a file *inside* the mount using Obsidian's own file explorer, and watch
   whether it silently becomes a delete+create (per the research §5.1 point 2, expected because
   a mount is a different device from the vault root) and whether inbound links break.
5. Close Obsidian, then delete the entire throwaway vault when done.

**What it means if it fails (Obsidian does not descend into it, or worse, corrupts/crashes):**
this is the check most likely to force revisiting the design's hard rule in
`multi-drive-contents-2026-09.md` §4 that a mounted, independently governed vault must be its
own top-level scope root rather than something nested under `contents/`. If Obsidian cannot
tolerate the mount at all, the "separate vault" fallback that the design's own Codex consult
proposed (and the design currently declines as the primary approach) becomes the only option
for the Obsidian target specifically, even if the VS Code extension continues to handle mounts
fine.

### 8a. A mount inside the workspace — does VS Code's own file search see it? — AUTOMATED

This is the design's **primary case**: mounts live at `contents/<name>`, which is inside the
workspace/vault, not in a layer's `roots`. Files there are collected by `scanWorkspace()` in
`src/workspaceIndex.ts` via `vscode.workspace.findFiles()` — `walk()`/`walkDirectory()` (§8b)
is **never called** for this path. `findFiles` is not this extension's code; whether it descends
into a symlinked mount is governed entirely by VS Code's own `search.followSymlinks` setting
(see "What controls what" above for exactly what was confirmed about it, and where).

**What it proves:** given the *filesystem* fact (is `--mount-path` a symlink or a real
directory entry) and the *effective* `search.followSymlinks` value in your workspace, whether
VS Code's file search should see anything through this specific mount. The script cannot launch
VS Code and execute a real search, so treat this as a configuration-derived verdict to be
confirmed empirically (open the workspace, check whether files under the mount appear at all),
not as a substitute for actually looking.

**Command:**

```bash
scripts/verify-rclone-mount.sh --mount-path contents/personal-drive --only 8a
# add --workspace-settings <path>/.vscode/settings.json if you're not running this from the
# workspace root, or want to check a different workspace's override
```

**Expected result:** an **rclone FUSE mount point** is a real directory entry, not a symlink,
so `PASS` regardless of the setting. A **plain `ln -s` symlink** (e.g. linking directly into a
Drive-for-Desktop path) depends on the effective `search.followSymlinks` value: `PASS` if it
resolves to `true` (VS Code's own default), `FAIL` if something set it to `false`.

**What it means if it fails:** a symlinked mount with `search.followSymlinks: false` will not
appear anywhere in the workspace — not in the Explorer, not in a workspace search, not to this
extension (which never even gets a chance to apply its own logic, since `findFiles` filters it
out first). The fix is either to turn `search.followSymlinks` back on, or to use a real mount
point (rclone) instead of a symlink for anything placed inside the workspace.

### 8b. A mount under a layer's `roots` — does `walkDirectory()` see it? — AUTOMATED

This is the **secondary case**: a mount registered as one of a layer's external `roots`
(outside the workspace folder). These are read by `scanExternal()` calling this extension's own
`walkDirectory()` in `src/walk.ts`, governed by this extension's own `layeredkb.followSymlinks`
setting (search both `src/walk.ts` and `src/workspaceIndex.ts` for `followSymlinks` to confirm
the current behaviour — **do not rely on a specific line number**, since another agent may be
changing this code around the same time this procedure is read).

**Command:**

```bash
scripts/verify-rclone-mount.sh --mount-path /absolute/path/to/a/roots-configured/mount --only 8b
```

**Expected result:** an **rclone FUSE mount point** is a real directory entry, not a symlink —
`PASS` regardless of the setting. A **plain `ln -s` symlink** depends on the effective
`layeredkb.followSymlinks` value: `FAIL` with the shipped default (`false` — the extension
skips it and shows a one-time warning naming how many symlinks it skipped), `PASS` if you turn
the setting on (cycle/depth/entry-count limits apply once it does follow links).

**What it means if it fails:** with the default `false`, a symlinked `roots` entry is silently
absent from that layer's panel except for the one-time warning — this is expected, current
behaviour, not a bug. The remedy is either `layeredkb.followSymlinks: true` in
`.vscode/settings.json`, or using a real mount point instead of a symlink for that root.

## Results log (fill in per machine)

| # | Check | OS / machine | Date | Result | Notes (no tokens, no raw config) |
|---|---|---|---|---|---|
| 1 | combine remote | | | PASS/FAIL/SKIP | |
| 2 | gitignore trap | | | PASS/FAIL/SKIP | |
| 3a | mklink /J | Windows | | works/fails | |
| 3b | mklink /D | Windows | | works/fails | |
| 3c | rclone mount onto nonexistent subdir | Windows | | works/fails | |
| 4 | file watch | | | PASS/FAIL/SKIP | |
| 5 | scan cost | | | PASS/FAIL/SKIP | files/sec observed |
| 6 | File Provider materialization | macOS | | PASS/SKIP | |
| 7 | Obsidian | | | descends / does not / crashes | |
| 8a | workspace mount vs. `search.followSymlinks` | | | PASS/FAIL/SKIP | mount type + effective setting value |
| 8b | `roots` mount vs. `layeredkb.followSymlinks` | | | PASS/FAIL/SKIP | mount type + effective setting value |

Feed confirmed results back into `.claude/docs/plans/multi-drive-contents-2026-09.md` and
`.claude/docs/research/drive-mount-and-team-cli-2026-09.md` §6 ("Unverified") as a follow-up —
this document only verifies; it does not update those files itself.
