/**
 * SPIKE (2026-09-08) — synthetic vault generator, VS Code-free.
 *
 * The reference vault (15,118 files) is not available in this environment, so
 * the measurements run on generated trees. The shape is stated with every
 * number, because a flat 15k directory and a deep one do not behave alike.
 */
import { ClassifiedFile } from '../layers';

export interface VaultShape {
	/** How many files to generate. */
	fileCount: number;
	/** Directory levels between the root and a file. 0 means one flat folder. */
	depth: number;
	/** Sibling directories per level; leaf directories are branching ** depth. */
	branching: number;
}

/** Balanced tree, close to a real PKB: 1,296 leaf dirs at 20k files. */
export const DEEP_SHAPE: Omit<VaultShape, 'fileCount'> = { depth: 4, branching: 6 };

/** Worst case for a single expanded group: every file in one directory. */
export const FLAT_SHAPE: Omit<VaultShape, 'fileCount'> = { depth: 0, branching: 1 };

/**
 * Extension mix, chosen so the real `DEFAULT_LAYERS` classifier spreads the
 * files across every layer instead of dumping them all into one pane.
 * Shares: schema 5%, ontology 10%, raw 20%, other 10%, knowledge 55%.
 */
const KIND_CYCLE = 20;

export function generateVault(shape: VaultShape): ClassifiedFile[] {
	const files: ClassifiedFile[] = [];
	for (let i = 0; i < shape.fileCount; i++) {
		const relativePath = pathFor(i, shape);
		files.push({ key: `spike:${relativePath}`, relativePath });
	}
	return files;
}

function pathFor(index: number, shape: VaultShape): string {
	const dir = directoryFor(index, shape);
	const kind = index % KIND_CYCLE;
	if (kind === 0) {
		return join('.claude', dir, `spec_${index}.md`);
	}
	if (kind === 1 || kind === 2) {
		return join('', dir, `table_${index}.csv`);
	}
	if (kind >= 3 && kind <= 6) {
		return join('contents', dir, `blob_${index}.bin`);
	}
	if (kind === 7 || kind === 8) {
		return join('', dir, `asset_${index}.png`);
	}
	return join('', dir, `note_${index}.md`);
}

function directoryFor(index: number, shape: VaultShape): string {
	const segments: string[] = [];
	for (let level = 0; level < shape.depth; level++) {
		const bucket = Math.floor(index / Math.pow(shape.branching, level)) % shape.branching;
		segments.push(`d${level}_${String(bucket).padStart(2, '0')}`);
	}
	return segments.join('/');
}

function join(prefix: string, dir: string, name: string): string {
	return [prefix, dir, name].filter((part) => part.length > 0).join('/');
}

/** Human-readable shape label used in the measurement table. */
export function describeShape(shape: VaultShape): string {
	if (shape.depth === 0) {
		return `flat (1 dir, ${shape.fileCount} files)`;
	}
	const leaves = Math.pow(shape.branching, shape.depth);
	return `deep (depth ${shape.depth}, branching ${shape.branching}, ${leaves} leaf dirs)`;
}
