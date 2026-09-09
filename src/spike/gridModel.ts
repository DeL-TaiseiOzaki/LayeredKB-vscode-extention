/**
 * SPIKE (2026-09-08) — throwaway prototype, not shipped behaviour.
 *
 * Prices the provisional "full-sidebar WebviewView with a CSS grid" decision in
 * `.claude/docs/DESIGN.md`. This module is the VS Code-free half: it turns the
 * existing classification (`classifyFiles` / `buildTree` from `src/layers.ts`)
 * into the flat row arrays the webview renders, so the part virtualisation
 * depends on stays unit-testable without an Electron host.
 */
import {
	buildTree,
	ClassifiedFile,
	classifyFiles,
	DirectoryNode,
	LayerDefinition,
	OTHER_LAYER_ID,
} from '../layers';
import { MountState } from '../mounts';

/** Row height the webview renders with; virtualisation assumes it is fixed. */
export const ROW_HEIGHT_PX = 22;

/** One rendered row, in depth-first document order. */
export interface GridRow {
	/** `mount` is a synthetic leaf: a mount point the scan could not list anything under. */
	kind: 'group' | 'directory' | 'file' | 'mount';
	name: string;
	/** Indent level; a group header is 0 and its children start at 1. */
	depth: number;
	/** How many following rows belong to this row's subtree (0 for leaves). */
	subtreeSize: number;
	/** Layer badge for a file, file count for a group header, state for a mount. */
	badge?: string;
	/** Rows that carry the mockup's persistent "+" (group headers only). */
	addAction: boolean;
	/** Which kind of group header this is; a scope root reads differently from a layer. */
	variant?: 'scope' | 'layer';
	/** Mount rows only: which of the three states the index observed. Set on leaf and directory rows alike. */
	mountState?: MountState;
	/** Native tooltip, used to explain a mount state in words rather than colour. */
	tooltip?: string;
}

export type RegionId = 'schema' | 'myKnowledge' | 'teamKnowledge' | 'myContents' | 'teamContents';

/** One pane of the grid. Groups are inlined as rows so a pane is one flat list. */
export interface RegionModel {
	id: RegionId;
	label: string;
	fileCount: number;
	rows: GridRow[];
}

export interface GridModel {
	regions: RegionModel[];
	fileCount: number;
	rowCount: number;
}

/** Named team scope roots the mockup shows as independently collapsible groups. */
export const TEAM_GROUPS = ['Engineering KB', 'Research KB', 'Product KB'] as const;

export interface GridModelOptions {
	/** Passed through to `buildTree`. The spike measures with `false` (worst case). */
	compact: boolean;
	teamGroups: readonly string[];
	/** Fraction of files routed to the team panes, 0..1. */
	teamShare: number;
}

export const DEFAULT_GRID_OPTIONS: GridModelOptions = {
	compact: false,
	teamGroups: TEAM_GROUPS,
	teamShare: 0.5,
};

/** What a row was built from, so a decorator can recognise it. */
export interface RowSource {
	file?: ClassifiedFile;
	node?: DirectoryNode;
}

/**
 * Rewrites a row before it is emitted. The real model uses it to mark the rows
 * that are mount points, which is how a mount keeps its true position in the
 * tree instead of being pinned above it.
 */
export type RowDecorator = (row: GridRow, source: RowSource) => GridRow;

/**
 * Flatten a directory tree into rows, directories before files at each level —
 * the same order `childrenOf` produces for the native tree.
 */
export function flattenDirectory(
	node: DirectoryNode,
	depth: number,
	badgeOf: (file: ClassifiedFile) => string | undefined,
	decorate?: RowDecorator
): GridRow[] {
	const rows: GridRow[] = [];
	appendChildren(node, depth, badgeOf, rows, decorate);
	return rows;
}

function appendChildren(
	node: DirectoryNode,
	depth: number,
	badgeOf: (file: ClassifiedFile) => string | undefined,
	rows: GridRow[],
	decorate?: RowDecorator
): void {
	for (const dir of node.directories) {
		const index = rows.length;
		const row: GridRow = { kind: 'directory', name: dir.name, depth, subtreeSize: 0, addAction: false };
		rows.push(decorate ? decorate(row, { node: dir }) : row);
		appendChildren(dir, depth + 1, badgeOf, rows, decorate);
		// Patched once the subtree is known; a row's size is not knowable before it.
		rows[index].subtreeSize = rows.length - index - 1;
	}
	for (const file of node.files) {
		const row: GridRow = {
			kind: 'file',
			name: file.name,
			depth,
			subtreeSize: 0,
			badge: badgeOf(file.file),
			addAction: false,
		};
		rows.push(decorate ? decorate(row, { file: file.file }) : row);
	}
}

/**
 * Rows visible under a set of collapsed row indices, as indices into `rows`.
 * O(visited rows): a collapsed directory is skipped by its whole subtree.
 */
export function visibleRowIndices(rows: readonly GridRow[], collapsed: ReadonlySet<number>): number[] {
	const visible: number[] = [];
	let i = 0;
	while (i < rows.length) {
		const row = rows[i];
		visible.push(i);
		i += row.kind === 'file' || !collapsed.has(i) ? 1 : 1 + row.subtreeSize;
	}
	return visible;
}

/** Deterministic bucket for a path, so a run is reproducible without a seed. */
export function bucketOf(relativePath: string, buckets: number): number {
	let hash = 2166136261;
	for (let i = 0; i < relativePath.length; i++) {
		hash ^= relativePath.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return Math.abs(hash) % buckets;
}

/**
 * Build the five-pane grid model from a *synthetic* file list.
 *
 * Kept for the benchmark and screenshot harnesses, which need a vault of a
 * chosen size and shape. The real workspace goes through `buildRealGridModel`
 * in `./realModel`, which splits my/team by scope instead of by hash.
 *
 * The mapping is a spike-only stand-in for the scope-partitioning step decided
 * on 2026-09-08: schema fills the full-width row, knowledge+ontology fills the
 * knowledge column, raw+other fills the contents column, and each column is
 * split my/team by a stable hash of the path.
 */
export function buildGridModel(
	files: readonly ClassifiedFile[],
	layers: readonly LayerDefinition[],
	options: GridModelOptions = DEFAULT_GRID_OPTIONS
): GridModel {
	const classification = classifyFiles([...files], [...layers]);
	const badgeByLayer = new Map<string, string>();
	for (const layer of layers) {
		badgeByLayer.set(layer.id, layer.badge ?? layer.id.slice(0, 1).toUpperCase());
	}
	const badgeOf = (file: ClassifiedFile): string | undefined =>
		badgeByLayer.get(classification.layerOfFile.get(file.key) ?? '') ?? '·';

	const filesOf = (ids: string[]): ClassifiedFile[] =>
		ids.flatMap((id) => classification.byLayer.get(id) ?? []);

	const schema = filesOf(['schema']);
	const knowledge = filesOf(['knowledge', 'ontology']);
	const contents = filesOf(['raw', OTHER_LAYER_ID]);

	const knowledgeSplit = splitMyTeam(knowledge, options.teamShare);
	const contentsSplit = splitMyTeam(contents, options.teamShare);

	const regions: RegionModel[] = [
		singleTreeRegion('schema', 'SCHEMA LAYER', schema, options, badgeOf),
		singleTreeRegion('myKnowledge', 'MY KNOWLEDGE BASE', knowledgeSplit.mine, options, badgeOf),
		groupedRegion('teamKnowledge', 'TEAM KNOWLEDGE BASES', knowledgeSplit.team, options, badgeOf),
		singleTreeRegion('myContents', 'MY CONTENTS', contentsSplit.mine, options, badgeOf),
		groupedRegion('teamContents', 'TEAM CONTENTS', contentsSplit.team, options, badgeOf),
	];

	return {
		regions,
		fileCount: regions.reduce((sum, r) => sum + r.fileCount, 0),
		rowCount: regions.reduce((sum, r) => sum + r.rows.length, 0),
	};
}

function splitMyTeam(
	files: readonly ClassifiedFile[],
	teamShare: number
): { mine: ClassifiedFile[]; team: ClassifiedFile[] } {
	const threshold = Math.round(teamShare * 100);
	const mine: ClassifiedFile[] = [];
	const team: ClassifiedFile[] = [];
	for (const file of files) {
		(bucketOf(file.relativePath, 100) < threshold ? team : mine).push(file);
	}
	return { mine, team };
}

function singleTreeRegion(
	id: RegionId,
	label: string,
	files: readonly ClassifiedFile[],
	options: GridModelOptions,
	badgeOf: (file: ClassifiedFile) => string | undefined
): RegionModel {
	const tree = buildTree([...files], options.compact);
	return { id, label, fileCount: files.length, rows: flattenDirectory(tree, 0, badgeOf) };
}

function groupedRegion(
	id: RegionId,
	label: string,
	files: readonly ClassifiedFile[],
	options: GridModelOptions,
	badgeOf: (file: ClassifiedFile) => string | undefined
): RegionModel {
	const groups = options.teamGroups;
	const buckets: ClassifiedFile[][] = groups.map(() => []);
	for (const file of files) {
		buckets[bucketOf(file.relativePath, groups.length)].push(file);
	}
	const rows: GridRow[] = [];
	groups.forEach((groupLabel, i) => {
		const groupFiles = buckets[i];
		const tree = buildTree([...groupFiles], options.compact);
		const children = flattenDirectory(tree, 1, badgeOf);
		rows.push({
			kind: 'group',
			name: groupLabel,
			depth: 0,
			subtreeSize: children.length,
			badge: String(groupFiles.length),
			addAction: true,
			variant: 'scope',
		});
		for (const row of children) {
			rows.push(row);
		}
	});
	return { id, label, fileCount: files.length, rows };
}
