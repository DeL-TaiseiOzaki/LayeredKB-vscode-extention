/**
 * SPIKE (2026-09-08) — extension-host side of the measurement.
 *
 * Builds the model with the extension's own `classifyFiles` / `buildTree`,
 * times that, then drives the webview through its measurement protocol.
 */
import { DEFAULT_LAYERS, classifyFiles, ClassifiedFile } from '../../layers';
import { buildGridModel, DEFAULT_GRID_OPTIONS, GridModel } from '../gridModel';
import { RenderMode, SpikeGridViewProvider } from '../gridView';
import { DEEP_SHAPE, FLAT_SHAPE, describeShape, generateVault, VaultShape } from '../synthetic';

export type ShapeName = 'deep' | 'flat';

export interface BenchRequest {
	sizes: number[];
	shapes: ShapeName[];
	modes: RenderMode[];
	scrollFrames: number;
}

export const DEFAULT_BENCH_REQUEST: BenchRequest = {
	sizes: [1000, 10000, 20000],
	shapes: ['deep'],
	modes: ['naive', 'virtual'],
	scrollFrames: 60,
};

export interface HostMetrics {
	classifyMs: number;
	modelBuildMs: number;
	payloadBytes: number;
	fileCount: number;
	rowCount: number;
	hostHeapDeltaBytes: number;
}

export interface BenchCaseResult {
	size: number;
	/** postMessage of the whole model plus the webview's first render, per mode. */
	modelHandoffMs: Record<string, number>;
	shape: ShapeName;
	shapeDescription: string;
	host: HostMetrics;
	webview: Record<string, unknown>;
}

export interface BenchResult {
	vscodeCalibrationFrames: unknown;
	cases: BenchCaseResult[];
	startedAt: string;
	finishedAt: string;
}

function shapeFor(name: ShapeName, fileCount: number): VaultShape {
	return { fileCount, ...(name === 'flat' ? FLAT_SHAPE : DEEP_SHAPE) };
}

function buildHostModel(files: ClassifiedFile[]): { model: GridModel; metrics: HostMetrics } {
	const heapBefore = process.memoryUsage().heapUsed;

	const classifyStart = performance.now();
	classifyFiles(files, DEFAULT_LAYERS);
	const classifyMs = performance.now() - classifyStart;

	const buildStart = performance.now();
	const model = buildGridModel(files, DEFAULT_LAYERS, DEFAULT_GRID_OPTIONS);
	const modelBuildMs = performance.now() - buildStart;

	const payloadBytes = JSON.stringify(model).length;
	const heapAfter = process.memoryUsage().heapUsed;
	return {
		model,
		metrics: {
			classifyMs: round(classifyMs),
			modelBuildMs: round(modelBuildMs),
			payloadBytes,
			fileCount: model.fileCount,
			rowCount: model.rowCount,
			hostHeapDeltaBytes: heapAfter - heapBefore,
		},
	};
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

export async function runBenchmark(
	provider: SpikeGridViewProvider,
	request: BenchRequest = DEFAULT_BENCH_REQUEST
): Promise<BenchResult> {
	const startedAt = new Date().toISOString();
	// minimatch compiles its patterns lazily; without a warm-up the first case
	// is charged for module warm-up rather than for its own file count.
	buildHostModel(generateVault({ fileCount: 200, ...DEEP_SHAPE }));
	await provider.waitForReady();
	const calibration = await provider.request({ type: 'calibrate', frames: request.scrollFrames });

	const cases: BenchCaseResult[] = [];
	for (const shape of request.shapes) {
		for (const size of request.sizes) {
			const vaultShape = shapeFor(shape, size);
			const files = generateVault(vaultShape);
			const { model, metrics } = buildHostModel(files);
			const webview: Record<string, unknown> = {};
			const modelHandoffMs: Record<string, number> = {};
			for (const mode of request.modes) {
				const handoffStart = performance.now();
				await provider.setModel(model, mode);
				modelHandoffMs[mode] = round(performance.now() - handoffStart);
				webview[mode] = await provider.request({
					type: 'run',
					mode,
					scrollFrames: request.scrollFrames,
				});
			}
			cases.push({
				size,
				modelHandoffMs,
				shape,
				shapeDescription: describeShape(vaultShape),
				host: metrics,
				webview,
			});
		}
	}

	return { vscodeCalibrationFrames: calibration, cases, startedAt, finishedAt: new Date().toISOString() };
}
