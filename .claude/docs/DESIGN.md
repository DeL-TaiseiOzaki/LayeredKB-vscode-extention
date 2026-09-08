# Design Document — 要件定義書 (Requirements & Macro Design)

> **Role:** Macro-level requirements and design — *what* this project builds and *why*.
> Written at `/init`, kept current by `/design-tracker` (also invoked from `/checkpointing`).
>
> **Document map:** Shared rules → [rules/](../rules/) ·
> Shared bootstrap → [AGENTS.md](../../AGENTS.md) · State → [STATE.md](../STATE.md) · Claude symlink → [CLAUDE.md](../../CLAUDE.md) ·
> Micro work progress (latest 5 checkpoints) → [PROGRESS.md](../../PROGRESS.md)

## 背景・目的 (Background & Purpose)

<!-- Why does this project exist? What problem does it solve, for whom?
     State the business/technical context and the goal in a few sentences. -->

LayeredKB is a VS Code extension for people who run a Personal Knowledge Base together with CLI agents such as Claude Code. In such a workspace files with very different roles - agent instructions, ontology, distilled knowledge, raw material - share one folder tree, and the standard explorer shows them all at the same weight. LayeredKB leaves the folder structure untouched and projects the same tree into one panel per layer, so a reader (human or agent) can see which layer a file belongs to.

Version 0.1.0 ships that projection with a glob-based, extension-driven default layer set. Measuring the default against a real 15,118-file knowledge base showed the classifier does not survive outside a code repository: 65 percent of files fell into `other`, and the ontology layer filled with raw data instead of vocabulary.

The purpose is therefore twofold. Keep the published VS Code extension working, and move the layer model itself onto the single-axis, three-layer model settled on 2026-09-07 (schema / Knowledge_Base / contents), in which generated artifacts are not placed in a layer at all - only the reference to them and their provenance are, recorded in a manifest the tool owns.

## スコープ (Scope)

### In Scope

<!-- What this project explicitly delivers. -->

- The VS Code extension in this repository: layer classification, per-layer tree panels, explorer decoration, and the packaging and release pipeline that publishes it.
- The layer model itself: what the layers are, which single axis separates them, and what default layer set is shipped to users.
- Manifest ownership: the machine-readable record that joins a note to the generated artifact it refers to, and dangling / orphan detection over that record.
- The capabilities a plain folder cannot provide: per-layer context-budget reporting and the raw-to-knowledge promotion operation.

### Out of Scope

<!-- What is explicitly NOT covered, to prevent scope creep. -->

- Storing, syncing or reproducing artifact bytes. LayeredKB records the reference and the provenance, never the payload.
- Automatic content-level classification of somebody else's vault. Proposing map-layer candidates from link structure stays a suggestion, not an assignment.
- The Obsidian community plugin implementation. It is the stated next target and no line of it exists yet; whether it belongs in this repository is still undecided (see TODO / Open Questions).
- Reorganising the user's folders. LayeredKB projects the existing tree and does not move files.

## 機能要件 (Functional Requirements)

<!-- What the system must do. Each requirement gets a stable ID (FR-1, FR-2, ...). -->

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-1 | Project the open workspace into one panel per layer without changing the folder layout on disk. | Must | Shipped in 0.1.0. Activity-bar container `layeredkb`, file count shown in each panel title. |
| FR-2 | Let the user define the layers themselves (id, label, description, icon, badge, color, patterns) through the `layeredkb.layers` setting. | Must | Shipped. Glob patterns evaluated top-down, first-match-wins (`classifyFiles` in `src/layers.ts`). |
| FR-3 | Assign every scanned file to exactly one layer, collecting unmatched files into a reserved `other` pseudo-layer that the user can hide. | Must | Shipped (`OTHER_LAYER_ID`, `layeredkb.showOtherLayer`). Measured on a 15,118-file vault, 65 percent of files landed in `other` - the classifier, not the panel, is what fails. |
| FR-4 | Scan folders outside the workspace when a layer declares `roots`, so Git-untracked stores such as a Google Drive mount can be shown as a layer. | Must | Shipped (`resolveRoots` in `src/workspaceIndex.ts`). A `roots` layer does not take part in classifying in-workspace files. |
| FR-5 | Reject an invalid layer configuration with a readable list of problems instead of silently degrading. | Must | Shipped (`validateLayers`): duplicate id, use of the reserved `other` id, missing `patterns`, wrong `roots` type. |
| FR-6 | Mark each file in the standard explorer with the badge and color of the layer it belongs to. | Should | Shipped via `FileDecorationProvider` (`src/explorerDecorations.ts`), switchable with `layeredkb.decorateExplorer`. |
| FR-7 | Keep the panels current: rescan on file creation, deletion and configuration change, including watched `roots` folders, and support multi-root workspaces and compact folders. | Should | Shipped. Multi-root trees are prefixed with the root name. |
| FR-8 | Offer the file operations a reader expects from a tree: open, open to the side, reveal in explorer, reveal in OS, copy path, copy relative path. | Could | Shipped as `layeredkb.*` commands with a `view/item/context` menu. |
| FR-9 | Define layers on a single axis - inside or outside the system - as schema, Knowledge_Base and contents, so that answering one question fixes both the location and the writer of a file. | Must | Intent, decided 2026-09-07 in the design note. The shipped default is still the 4-layer schema / ontology / knowledge / raw set; the migration path for existing `layeredkb.layers` settings is open. |
| FR-10 | Own a machine-readable manifest that links a note to the generated artifact it refers to, recording path, size, hash, substrate, scope, generating model, prompt and source notes. | Must | Design note section 7-1. Formalizes the `Research/slide/README.md` pattern that already works. Required, not merely convenient, because the contents of `contents/` differ per machine. |
| FR-11 | Detect dangling and orphaned references over the manifest: a note pointing at an artifact that is absent, and an artifact nothing points at. | Must | Design note section 7-2. Must distinguish `broken` from `not present on this device`, which is only decidable with the manifest. |
| FR-12 | Report an estimated context-token budget per layer, so that growth of the always-resident layer is visible before it is billed on every task. | Should | Design note section 7-3. This is what turns a layer from a display convenience into a model of the context budget. |
| FR-13 | Support a promotion operation that distils a file from raw to knowledge, rewriting its frontmatter and leaving a back-link at the origin. | Should | Design note section 7-4. |
| FR-14 | Build, package and publish the extension reproducibly from CI, refusing to publish when the git tag and the manifest version disagree. | Should | Shipped. `.github/workflows/ci.yml` on push and PR; `release.yml` on a `v*` tag, with an explicit tag-vs-version check and `workflow_dispatch` restricted to tags. |

## 非機能要件 (Non-Functional Requirements)

<!-- Quality attributes: performance, availability, security, maintainability, etc.
     Prefer measurable targets in the Metric column. -->

| Category | Requirement | Metric / Target |
|----------|-------------|-----------------|
| Performance | Classification and tree building must stay usable on a real personal knowledge base, not only on a code repository. | The reference vault measured for the design note: 15,118 files, 111 GB, 4,534 Markdown notes. |
| Availability | | |
| Security | Knowledge-base content is read locally and never sent anywhere; the runtime dependency surface stays minimal. | Exactly one runtime dependency (`minimatch`); no network access at runtime. |
| Maintainability | Type checking and linting gate every build, so a broken build cannot be packaged. | `npm run compile` = `check-types` then `lint` then bundle; the same command runs in CI on push and PR. |
| Portability | The classification and tree-building core must not depend on the VS Code API, so the layer model can be reused by another host. | `src/layers.ts` imports only `minimatch`; `npm run test:unit` exercises it under plain mocha with no VS Code process. |
| Testability | Classification, matcher compilation, validation and tree building are covered by fast unit tests that do not need a VS Code instance. | `src/test/unit/layers.test.ts`, run by `npm run test:unit` in CI; integration coverage via `@vscode/test-cli`. |
| Compatibility | Run on a currently supported VS Code and Node toolchain. | `engines.vscode` `^1.105.0`; CI on Node 22. |
| Reliability | A reference to a missing artifact must be distinguishable from an artifact that simply is not mounted on this device. | Verified 2026-09-07 that Drive mounts differ per account and per OS, so absence alone carries no information without the manifest. |

## アーキテクチャ (Architecture)

<!-- High-level architecture: components, data flow, boundaries.
     Add a diagram or description here. -->

### Agent Roles

| Agent | Role | Responsibilities |
|-------|------|------------------|
| Human curator | Owner of the schema and Knowledge_Base layers | Decides the layer definitions, curates distilled knowledge, and approves promotion from raw material to knowledge. |
| CLI agent (Claude Code, Codex) | Primary reader, and co-writer of schema and Knowledge_Base | Reads the schema layer on every turn, reads the Knowledge_Base layer on demand, and writes back into both. Its context budget is what the layer boundaries are designed around. |
| Capture agent (hermes, capture extensions) | Writer of the inbound side of contents | Deposits received material into the exchange surface without classifying it into a knowledge layer. |
| Generator | Writer of the outbound side of contents | Produces rendered artifacts (pptx, png) into contents and records the recipe - source notes, model, prompt - plus a manifest row on the Knowledge_Base side. |
| LayeredKB extension | Classifier and manifest owner | Projects the tree into layers, owns the manifest that joins the two substrates, detects dangling and orphaned references, and reports the per-layer context budget. It never stores artifact bytes. |

## 技術選定 (Tech Stack & Rationale)

<!-- Chosen technologies and why. Record alternatives considered. -->

| Area | Technology | Rationale | Alternatives Considered |
|------|------------|-----------|-------------------------|
| Language | TypeScript 5.9 | The VS Code extension API is typed; the core logic benefits from the same checks. `tsc --noEmit` is the type gate, `tsc -p . --outDir out` compiles the unit tests. | Plain JavaScript with JSDoc types. |
| Bundling | esbuild | Bundles to a single `dist/extension.js` fast enough for a watch loop, with a `--production` minified build for packaging. | webpack; shipping unbundled `out/`. |
| Pattern matching | minimatch 10 | The only runtime dependency. Supports the dotfile, brace-expansion and `**` behaviour the default layer patterns rely on. | picomatch; `vscode.RelativePattern` alone, which would tie classification to the VS Code API and break FR-4 and the portability NFR. |
| View surface | Eight statically declared TreeView slots plus FileDecorationProvider | VS Code declares views in `package.json` `contributes` and cannot register them dynamically, so the extension pre-declares `layeredkb.slot0` to `slot7` and toggles visibility with a `when` context key. | A single tree with layer group nodes; dynamic view registration, which the host does not offer. |
| Testing | mocha (TDD interface) for unit tests, @vscode/test-cli and test-electron for integration | Splitting the VS Code-free core from the host-dependent shell keeps the fast suite runnable in CI without an Electron download. | Integration tests only, which would make the core logic slow and awkward to test. |
| Linting | eslint 10 with typescript-eslint | Standard for the VS Code extension template; wired into `npm run compile` so lint failures block a build. | Biome. |
| Packaging and release | @vscode/vsce with GitHub Actions | CI packages a dry-run `.vsix` artifact on every push; Release publishes to the Marketplace and attaches the `.vsix` to a GitHub Release when a `v*` tag matches `package.json`. | Publishing manually from a developer machine, which loses the version-match check. |
| Target host (planned) | Obsidian community plugin | `registerView` can be called as many times as needed inside `onload`, removing the eight-slot limit, and frontmatter plus link structure give a better classification signal than file extension. | Staying VS Code only. Note the cost: no vault-external access, and no official explorer-decoration API. |

## 制約 (Constraints)

<!-- Technical, organizational, regulatory, or resource constraints. -->

- VS Code declares views statically in `package.json`, so the extension pre-declares eight view slots (`layeredkb.slot0` to `layeredkb.slot7`) and toggles their visibility with a context key. The layer count cannot exceed eight on this host.
- `other` is a reserved layer id; `validateLayers` rejects a user layer that claims it.
- Vault-external scanning (`roots`) is a VS Code-only capability. Obsidian cannot reach outside the vault - such paths never become a `TFile`, and mobile has no filesystem access.
- Obsidian offers no official explorer-decoration API. An equivalent has to attach CSS classes to the DOM and can conflict with other plugins.
- `contents/` must be a real directory with the mounts inside it. Making `contents` itself a symlink breaks the `.gitignore` `contents/` rule, because git stores a symlink as a file.
- The contents of `contents/` differ per machine: Drive mounts are per-account and per-OS, and on Windows a shared drive is a FAT32 virtual filesystem where `mklink /J` fails. A missing blob is therefore not by itself evidence of a broken reference.
- Runtime dependencies stay minimal (`minimatch` only) and classification runs entirely locally; knowledge-base content is never sent off the machine.
- Marketplace publishing needs the `VSCE_PAT` secret and a git tag equal to `package.json` `version`; the release workflow refuses to run from a branch.

- Mobile is empty by construction: there is no FUSE on iOS, no Drive for Desktop on mobile, and Android exposes Drive as a SAF provider. On a phone `contents/` is a real but empty directory, which is why the manifest and the absence states are load-bearing rather than convenient.
- No filesystem watcher under `contents/` can be trusted. rclone polls rather than subscribing, and Obsidian does not watch changes made outside itself. Freshness must come from an explicit rescan, never from an assumed event.
- Google Drive rate limiting is documented at roughly two files per second, so a cold recursive walk of a large mount is a listing storm. Scanning must be bounded and incremental.
- On macOS a File Provider path can materialise file bytes rather than serving metadata alone, so a naive recursive index can pull gigabytes. Integrity checks that read content must be opt-in and size-bounded.
- Obsidian's own documentation warns against symlinks inside a vault, and its file manager cannot move a file across a device boundary - it treats such a move as delete plus create without updating links. The raw-to-knowledge promotion in FR-13 cannot be implemented as a plain move out of a mount.
- On Windows a shared drive presented by Drive for Desktop appears as a FAT filesystem, and a junction cannot reference a non-local volume, so `mklink /J` into a shared drive fails. Mirroring is not a workaround because it applies to My Drive only.
- Three layers across three scope roots exceeds the eight statically declared view slots available on the VS Code host.

## Key Decisions

<!-- Durable architectural/design decisions. Append-only log. -->

| Decision | Rationale | Alternatives Considered | Date |
|----------|-----------|------------------------|------|
| Collapse the layer model from four layers (schema / ontology / knowledge / raw) to three (schema / Knowledge_Base / contents) on a single axis: inside or outside the system. | Measured against a 15,118-file vault the four-layer default put 65 percent of files in `other` and filled the ontology layer entirely with raw data. The cause is structural: schema and ontology sit on a meta axis while raw and knowledge sit on a refinement axis, and resolving two axes in one first-match-wins list breaks wherever they cross. With one axis, a single question fixes both the location and the writer. | Keep four layers and keep adding patterns; add a fifth layer - the same move that produced Medallion's unofficial Platinum tier without settling the boundary. | 2026-09-07 |
| Generated artifacts do not live in a layer. What lives in a layer is the reference and the provenance, carried by a machine-readable manifest. | The gitignore-and-regenerate contract holds only where output is deterministic from source; temperature, sampling and silent model updates break it for LLM output, so the industry substitute is described provenance rather than hash reproducibility. Unity Catalog Volumes, MCP (URI only over the protocol), the Anthropic artifact pattern and Zettelkasten converge on the same answer. In the reference vault the one place with a manifest is traceable and the two without one are not. | Track the artifacts in git; ignore them with no manifest - the measured failure mode at 6.9 GB and 95 GB. | 2026-09-07 |
| Do not port the extension-based classifier to a note vault. Express the layer as a folder and the scope as a mount, so the location of a file is its layer. | A file extension proxies for a role only inside a code repository. In the measured vault CSV files were experiment output and customer material rather than vocabulary, and all 4,534 Markdown notes would collapse into a single layer. There is then nothing left to infer. | Keep the glob classifier; declare the layer in frontmatter. The signal question stays open for third-party vaults that have no path convention. | 2026-09-07 |
| Redefine raw from `outside the vault` to `inside the vault, under a different reference discipline`. | The `roots` mechanism that defines the Raw layer in VS Code has no Obsidian equivalent: paths outside the vault do not become a `TFile`, and mobile has no filesystem access at all. The contents layer meets the same requirement inside the tree, differing only in reference discipline and git handling. | Keep vault-external scanning, which the target host cannot provide. | 2026-09-07 |
| Make `contents/` a real directory that holds the mounts, never a symlink itself. | Git records a symlink as a file, not a directory, so a trailing-slash `contents/` ignore rule does not match it and a blob containing an absolute path gets committed. Verified with `git check-ignore` on 2026-09-07, together with read and write access through a Google Drive symlink on macOS. | Symlink `contents` directly at the Drive mount - the variant that fails. | 2026-09-07 |
| Exclude the whole contents layer from git, including the diffable Markdown inside it, trading provenance for a simple boundary. | The 2,584 inbox notes are diffable and could be tracked, but the alternative is the existing state: twelve groups of layer-related ignore rules digging size holes after the fact at 95 GB, 6.9 GB and 538 MB. Three layers reduce this to one line, and the manifest recovers the provenance that git would have carried. | Track the diffable part and ignore only the blobs, keeping the substrate distinction inside the layer. | 2026-09-07 |
| The manifest join key is a stable tool-assigned artifact ID namespaced by scope (e.g. `personal/0142`), not a content hash. File location is recorded as `{mount: <id>, path: <path within mount>}`, never as an absolute or vault-relative path. | The key must resolve while the file is absent. When a mount is not attached there are no bytes to hash, so a content-hash key cannot locate its own row, and `broken` becomes indistinguishable from `not mounted on this device` - the exact distinction FR-11 exists to make. Namespacing by scope keeps the Johnny.Decimal property of being speakable aloud while making collisions across M repositories impossible. Hashes remain as per-version attributes. A mount point moves per OS, so any path anchored above the mount is unstable by construction. | A content hash, which was the other half of the open question and fails the absent-file test. A bare Johnny.Decimal ID without a scope namespace, which collides once more than one repository is attached. | 2026-09-08 |
| A git submodule is a scope root, not a member of the contents layer. Each scope root carries its own three layers internally and is placed at a top level path (`Research/`, `team-kb/`), never underneath `contents/`. | Three independent grounds. Structural: the scope matrix already records an org-scope submodule as spanning all three layers, so a submodule is a cell of the matrix rather than a member of one layer. Representational: `contents/` is defined as the git-excluded region and is the single ignore line that replaced twelve groups of after-the-fact rules, while a submodule is by definition a tracked gitlink - co-locating them punches a negation exception through that line. Semantic: the declared writers of `contents` are capture agents and generators, so the property that one question fixes both location and writer fails for that path. | Filing the submodule under `contents/` as the user initially proposed. Treating the submodule as an opaque imported blob whose internals never participate in LayeredKB, which is coherent but discards the team KB's own layer structure. | 2026-09-08 |
| Classification is scoped: a declared scope root owns classification beneath it, and ancestors do not layer-classify its descendants. | The layer axis is frame-relative. `contents/team-kb/CLAUDE.md` is contents in the parent frame and schema in the team frame, so a single ordered pattern list evaluated over the whole tree flattens the frame and returns one of two true answers - the same failure that put 65 percent of a real vault into `other`. Scope and layer are not two axes resolved simultaneously by one list; they are resolved in sequence by different mechanisms, scope first by ownership and routing, then layer inside the selected scope by the existing first-match-wins list. `classifyFiles` therefore needs no change, only a partitioning step in front of it. | One pattern list evaluated across the whole tree, which is the current implementation and the diagnosed defect. Naming scope as a second classification axis inside the same list, which reproduces the original failure. | 2026-09-08 |
| Mounts are declared in two stores: a tracked registry holding vault-relative mount points and expected identity, plus a gitignored per-machine binding from mount id to local locator. The `kind` of a mount (scope root or exchange surface) is declared, never inferred. | The contents of `contents/` legitimately differ per machine, so the portable facts and the machine-local facts have different lifetimes and must not share a file. An absolute path in a tracked file is wrong on every other machine. Inferring `kind` from a self-describing file such as a dropped `CLAUDE.md` would make privilege escalation a matter of creating a file, so the classification signal for mounts and scope roots is declaration - narrower than, and not a decision about, the general frontmatter-versus-path question for an arbitrary vault. | A single combined registry, which forces either absolute paths into version control or machine-specific state into a shared file. Inferring mount kind from directory contents. | 2026-09-08 |
| Per-machine absence is computed at read time, never stored, over the states `not-configured`, `mount-unavailable`, `identity-mismatch`, `unverified`, `missing`, `present-unhydrated`, `modified` and `ok`. Mount identity is checked before any file-level check, and an unscanned mount renders as not-evaluated rather than clean. | Stored absence is stale the moment a mount is attached or detached. The ordering carries the value: checking a file before verifying which drive it is on reports `ok` for the right path on the wrong drive. Rendering an unscanned mount as clean would assert a fact never observed. | A stored boolean `present` flag. A single `missing` state, which cannot distinguish a broken reference from an unattached mount and so cannot satisfy FR-11. | 2026-09-08 |
| rclone is the reference mechanism for presenting several Google Drives inside one real `contents/` directory; Google Drive for Desktop and Workspace CLIs are rejected for this role. | A single Drive remote cannot span My Drive and a Shared Drive, but `rclone backend -o config drives drive:` generates a `combine` remote that exposes My Drive and every Shared Drive as sibling subdirectories of one mount. rclone also mounts onto a non-existent subdirectory of an existing parent, so `contents/` stays a real directory and the Windows `mklink /J` failure into a FAT32 shared drive never arises. Drive for Desktop cannot relocate its mount point, so it always needs a link into `contents/`, which is where Windows breaks. Workspace CLIs, GAM and `gcloud` are API-level only and provide no filesystem mount at all. | Google Drive for Desktop plus a symlink or junction per account. A Workspace CLI or the Drive REST API, which cannot mount. Per-drive separate remotes, which cannot span My Drive and Shared Drives in one directory. | 2026-09-08 |

## TODO / Open Questions

<!-- Open design questions and deferred decisions for this project. -->

Resolved on 2026-09-08, see Key Decisions: the manifest join key; the classification
signal for declared mounts and scope roots; where a git submodule sits relative to the
layer boundary; the mount mechanism.

- 🔴 Primary classification signal for ordinary notes: declaration (frontmatter) or convention (path)? Deciding it for declared mounts did not decide it here. A third-party vault has no path convention, so this still governs the first-run setup design.
- 🔴 Repository boundary: the design note describes an Obsidian community plugin built on top of this VS Code extension but does not say whether that plugin lives in this repository or a separate one. Undecided - this document currently describes the VS Code extension only.
- 🟡 How far orphan detection should go. Agreed so far: proposing map-layer candidates from link structure must stay a suggestion, never automatic classification.
- 🟡 How to define a default layer set for a general user. The reference vault's path convention is too strong to serve as the default.
- 🟡 Column design for `Ontology.csv`, including whether to adopt Palantir's separation of three identifiers.
- 🟡 Whether the shipped VS Code default layer set migrates to the three-layer model, and what happens to existing `layeredkb.layers` settings if it does. The note settles the model but not the migration.
- 🟡 Whether Obsidian's indexer descends into a mount placed inside the vault, and whether it degrades as its own documentation warns. Unverified; needs measurement on real hardware.
- 🟡 Whether a stable provider identity is queryable for a given mount. Where it is not, the honest guarantee is `unverified`, because a marker file is forgeable by a recursive copy.
- 🟢 Naming: the underscore in `Knowledge_Base` is inconsistent with the surrounding PascalCase.
- 🟢 Whether to pursue this as a personal design exercise or as a company-wide standard.
- 🟢 Whether to adopt teamai-cli for distributing shared agent configuration. Unrelated to the mount question and tracked separately.
