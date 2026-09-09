/* SPIKE (2026-09-08) — webview renderer for the grid sidebar prototype.
 *
 * Throwaway. Renders the five panes of the mockup and measures itself.
 * `visibleRows` below mirrors `visibleRowIndices` in ../gridModel.ts, which is
 * the unit-tested reference implementation; the duplication is deliberate,
 * because doing the expand/collapse scan in the extension host would put a
 * cross-process round trip inside the latency we are trying to measure.
 */
/* global window, document, performance, requestAnimationFrame, acquireVsCodeApi, console */
(function () {
	'use strict';

	var vscode = window.__spikeApi || acquireVsCodeApi();
	var ROW = 22;
	var OVERSCAN = 8;
	var FRAME_BUDGET_MS = 1000 / 60;
	// One glyph per MountState, so the three states are told apart by shape and
	// not only by colour. 'local-data' is the anomaly: a real local directory
	// where a mount should be.
	var MOUNT_GLYPH = { attached: '⇗', unavailable: '⊘', 'local-data': '⚠' };

	var state = { model: null, mode: 'virtual', panes: [] };

	// -- pure helpers ------------------------------------------------------

	function visibleRows(rows, collapsed) {
		var visible = [];
		var i = 0;
		while (i < rows.length) {
			var row = rows[i];
			visible.push(i);
			i += row.kind === 'file' || !collapsed.has(i) ? 1 : 1 + row.subtreeSize;
		}
		return visible;
	}

	function afterPaint() {
		return new Promise(function (resolve) {
			requestAnimationFrame(function () {
				requestAnimationFrame(function () {
					resolve(performance.now());
				});
			});
		});
	}

	function summarise(deltas) {
		var sorted = deltas.slice().sort(function (a, b) {
			return a - b;
		});
		var at = function (q) {
			return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
		};
		var dropped = 0;
		for (var i = 0; i < deltas.length; i++) {
			if (deltas[i] > FRAME_BUDGET_MS * 1.5) {
				dropped += 1;
			}
		}
		return {
			frames: deltas.length,
			medianMs: round(at(0.5)),
			p95Ms: round(at(0.95)),
			maxMs: round(sorted.length ? sorted[sorted.length - 1] : 0),
			droppedFrames: dropped,
		};
	}

	function round(value) {
		return Math.round(value * 100) / 100;
	}

	function heapUsed() {
		return performance.memory ? performance.memory.usedJSHeapSize : null;
	}

	// -- DOM ---------------------------------------------------------------

	function buildPanes(model) {
		var grid = document.getElementById('grid');
		grid.textContent = '';
		state.panes = model.regions.map(function (region) {
			var pane = document.createElement('div');
			pane.className = 'pane';
			pane.setAttribute('data-region', region.id);

			var header = document.createElement('div');
			header.className = 'pane-header';
			var title = document.createElement('span');
			title.className = 'pane-title';
			title.textContent = region.label;
			var count = document.createElement('span');
			count.className = 'pane-count';
			count.textContent = String(region.fileCount);
			var add = document.createElement('button');
			add.className = 'add-action';
			add.textContent = '+';
			add.title = 'Add to ' + region.label;
			header.appendChild(title);
			header.appendChild(count);
			header.appendChild(add);

			var scroller = document.createElement('div');
			scroller.className = 'scroller';
			scroller.setAttribute('role', 'tree');
			scroller.setAttribute('aria-label', region.label);
			scroller.tabIndex = 0;
			var spacer = document.createElement('div');
			spacer.className = 'spacer';
			var viewport = document.createElement('div');
			viewport.className = 'viewport';
			spacer.appendChild(viewport);
			scroller.appendChild(spacer);

			pane.appendChild(header);
			pane.appendChild(scroller);
			grid.appendChild(pane);

			var entry = {
				id: region.id,
				label: region.label,
				rows: region.rows,
				collapsed: new Set(),
				visible: [],
				scroller: scroller,
				spacer: spacer,
				viewport: viewport,
			};
			scroller.addEventListener('scroll', function () {
				if (state.mode === 'virtual') {
					paintWindow(entry);
				}
			});
			scroller.addEventListener('click', function (event) {
				onClick(entry, event);
			});
			return entry;
		});
	}

	function onClick(pane, event) {
		var target = event.target;
		if (target && target.classList && target.classList.contains('add-action')) {
			event.stopPropagation();
			vscode.postMessage({ type: 'add', region: pane.id });
			return;
		}
		var el = target;
		while (el && el.classList && !el.classList.contains('row')) {
			el = el.parentElement;
		}
		if (!el) {
			return;
		}
		var index = Number(el.getAttribute('data-index'));
		var row = pane.rows[index];
		if (row.kind === 'file') {
			vscode.postMessage({ type: 'open', region: pane.id, name: row.name });
			return;
		}
		if (row.kind === 'mount') {
			// A mount is a leaf here: there is nothing under it the scan could list.
			vscode.postMessage({ type: 'mount', region: pane.id, name: row.name, state: row.mountState });
			return;
		}
		toggle(pane, index);
		render(pane);
	}

	function toggle(pane, index) {
		if (pane.collapsed.has(index)) {
			pane.collapsed.delete(index);
		} else {
			pane.collapsed.add(index);
		}
	}

	function rowElement(pane, index) {
		var row = pane.rows[index];
		var el = document.createElement('div');
		var classes = 'row';
		if (row.kind === 'group') {
			classes += ' group group-' + (row.variant || 'scope');
		}
		if (row.mountState) {
			// A mount the scan listed something under is still a directory row; it
			// is the mountState, not the kind, that makes a row a mount point.
			classes += ' mount mount-' + row.mountState;
		}
		el.className = classes;
		if (row.tooltip) {
			el.title = row.tooltip;
		}
		el.setAttribute('data-index', String(index));
		el.setAttribute('role', 'treeitem');
		el.setAttribute('aria-level', String(row.depth + 1));
		el.style.paddingLeft = 4 + row.depth * 8 + 'px';
		// Right-click menus in a webview need a per-row context payload.
		el.setAttribute('data-vscode-context', '{"webviewSection":"row","preventDefaultContextMenuItems":true}');

		var twisty = document.createElement('span');
		twisty.className = 'twisty';
		if (row.kind === 'mount') {
			// Glyph as well as colour: a mount that is not attached, and local data
			// sitting where a mount should be, have to be readable without relying
			// on the theme's warning hue.
			twisty.textContent = MOUNT_GLYPH[row.mountState] || '⇗';
		} else if (row.kind === 'file') {
			twisty.textContent = '·';
		} else {
			var isCollapsed = pane.collapsed.has(index);
			twisty.textContent = isCollapsed ? '▸' : '▾';
			el.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
		}
		el.appendChild(twisty);

		var name = document.createElement('span');
		name.className = 'name';
		name.textContent = row.name;
		el.appendChild(name);

		if (row.badge) {
			var badge = document.createElement('span');
			badge.className = 'badge';
			badge.textContent = row.badge;
			el.appendChild(badge);
		}
		if (row.addAction) {
			var add = document.createElement('button');
			add.className = 'add-action';
			add.textContent = '+';
			add.title = 'Add to ' + row.name;
			el.appendChild(add);
		}
		return el;
	}

	function render(pane) {
		pane.visible = visibleRows(pane.rows, pane.collapsed);
		if (state.mode === 'naive') {
			paintAll(pane);
		} else {
			paintWindow(pane);
		}
	}

	function paintAll(pane) {
		pane.viewport.className = 'viewport naive';
		pane.viewport.style.transform = '';
		pane.spacer.style.height = '';
		var fragment = document.createDocumentFragment();
		for (var i = 0; i < pane.visible.length; i++) {
			fragment.appendChild(rowElement(pane, pane.visible[i]));
		}
		pane.viewport.textContent = '';
		pane.viewport.appendChild(fragment);
	}

	function paintWindow(pane) {
		pane.viewport.className = 'viewport';
		pane.spacer.style.height = pane.visible.length * ROW + 'px';
		var height = pane.scroller.clientHeight || 200;
		var start = Math.max(0, Math.floor(pane.scroller.scrollTop / ROW) - OVERSCAN);
		var end = Math.min(pane.visible.length, Math.ceil((pane.scroller.scrollTop + height) / ROW) + OVERSCAN);
		pane.viewport.style.transform = 'translateY(' + start * ROW + 'px)';
		var fragment = document.createDocumentFragment();
		for (var i = start; i < end; i++) {
			fragment.appendChild(rowElement(pane, pane.visible[i]));
		}
		pane.viewport.textContent = '';
		pane.viewport.appendChild(fragment);
	}

	function renderAll() {
		for (var i = 0; i < state.panes.length; i++) {
			render(state.panes[i]);
		}
	}

	function setCollapsedState(expandAll) {
		for (var p = 0; p < state.panes.length; p++) {
			var pane = state.panes[p];
			pane.collapsed = new Set();
			if (!expandAll) {
				for (var i = 0; i < pane.rows.length; i++) {
					if (pane.rows[i].kind === 'directory') {
						pane.collapsed.add(i);
					}
				}
			}
		}
	}

	function domNodes() {
		return document.getElementById('grid').querySelectorAll('*').length;
	}

	function visibleTotal() {
		return state.panes.reduce(function (sum, pane) {
			return sum + pane.visible.length;
		}, 0);
	}

	function hud(text) {
		document.getElementById('hud').textContent = text;
	}

	// -- measurement -------------------------------------------------------

	function measurePaint(expandAll) {
		setCollapsedState(expandAll);
		var t0 = performance.now();
		renderAll();
		var buildMs = performance.now() - t0;
		return afterPaint().then(function (t1) {
			return {
				buildMs: round(buildMs),
				paintedMs: round(t1 - t0),
				domNodes: domNodes(),
				visibleRows: visibleTotal(),
			};
		});
	}

	function biggestToggleTarget(pane) {
		var best = -1;
		var bestSize = -1;
		for (var i = 0; i < pane.rows.length; i++) {
			var row = pane.rows[i];
			var isCandidate = row.kind === 'group' || (row.kind === 'directory' && row.depth <= 1);
			if (isCandidate && row.subtreeSize > bestSize) {
				best = i;
				bestSize = row.subtreeSize;
			}
		}
		return { index: best, size: bestSize };
	}

	function measureToggle() {
		// Start from the realistic state: groups open, directories closed.
		setCollapsedState(false);
		renderAll();
		var pane = state.panes.reduce(function (a, b) {
			return a.rows.length >= b.rows.length ? a : b;
		});
		var target = biggestToggleTarget(pane);
		if (target.index < 0) {
			return Promise.resolve(null);
		}
		// Expanding one node means expanding everything under it, which is what
		// a user gets from "expand all" on a group.
		var subtree = [];
		for (var i = target.index; i <= target.index + target.size; i++) {
			subtree.push(i);
		}
		var t0 = performance.now();
		for (var j = 0; j < subtree.length; j++) {
			pane.collapsed.delete(subtree[j]);
		}
		render(pane);
		var expandBuild = performance.now() - t0;
		return afterPaint()
			.then(function (t1) {
				var expandPainted = t1 - t0;
				var t2 = performance.now();
				pane.collapsed.add(target.index);
				render(pane);
				var collapseBuild = performance.now() - t2;
				return afterPaint().then(function (t3) {
					return {
						region: pane.label,
						node: pane.rows[target.index].name,
						rowsRevealed: target.size,
						expandBuildMs: round(expandBuild),
						expandPaintedMs: round(expandPainted),
						collapseBuildMs: round(collapseBuild),
						collapsePaintedMs: round(t3 - t2),
					};
				});
			});
	}

	function measureScroll(frames) {
		var pane = state.panes.reduce(function (a, b) {
			return a.rows.length >= b.rows.length ? a : b;
		});
		setCollapsedState(true);
		renderAll();
		return afterPaint().then(function () {
			return new Promise(function (resolve) {
				var deltas = [];
				var max = Math.max(0, pane.scroller.scrollHeight - pane.scroller.clientHeight);
				var step = max > 0 ? Math.max(1, Math.floor(max / frames)) : 0;
				pane.scroller.scrollTop = 0;
				var last = 0;
				var n = 0;
				function tick() {
					pane.scroller.scrollTop += step;
					requestAnimationFrame(function () {
						var now = performance.now();
						deltas.push(now - last);
						last = now;
						n += 1;
						if (n < frames) {
							tick();
						} else {
							var result = summarise(deltas.slice(1));
							result.region = pane.label;
							result.scrolledRows = pane.visible.length;
							result.stepPx = step;
							resolve(result);
						}
					});
				}
				requestAnimationFrame(function () {
					last = performance.now();
					tick();
				});
			});
		});
	}

	function calibrate(frames) {
		return new Promise(function (resolve) {
			var deltas = [];
			var last = 0;
			var n = 0;
			function tick() {
				requestAnimationFrame(function () {
					var now = performance.now();
					deltas.push(now - last);
					last = now;
					n += 1;
					if (n < frames) {
						tick();
					} else {
						resolve(summarise(deltas.slice(1)));
					}
				});
			}
			requestAnimationFrame(function () {
				last = performance.now();
				tick();
			});
		});
	}

	function runSuite(mode, scrollFrames) {
		state.mode = mode;
		var memBefore = heapUsed();
		buildPanes(state.model);
		return measurePaint(false)
			.then(function (collapsed) {
				return measurePaint(true).then(function (expanded) {
					// Sampled at the same point in both modes so the comparison is fair.
					return { collapsed: collapsed, expanded: expanded, memoryAtExpandedBytes: heapUsed() };
				});
			})
			.then(function (paints) {
				return measureToggle().then(function (toggle) {
					paints.toggle = toggle;
					return paints;
				});
			})
			.then(function (paints) {
				return measureScroll(scrollFrames).then(function (scroll) {
					paints.scroll = scroll;
					paints.mode = mode;
					paints.memoryBeforeBytes = memBefore;
					paints.memoryAfterBytes = heapUsed();
					hud(mode + ': paint ' + paints.expanded.paintedMs + 'ms / ' + paints.expanded.domNodes + ' nodes');
					return paints;
				});
			});
	}

	/**
	 * Screenshot support: fold every mount shut and bring the first one into
	 * view, so the mount points sit next to each other instead of being pushed
	 * apart by the files under a live mount. A pane with no mount is left alone.
	 */
	function focusMounts() {
		return state.panes.map(function (pane) {
			for (var i = 0; i < pane.rows.length; i++) {
				if (pane.rows[i].mountState && pane.rows[i].subtreeSize > 0) {
					pane.collapsed.add(i);
				}
			}
			pane.visible = visibleRows(pane.rows, pane.collapsed);
			var at = -1;
			for (var v = 0; v < pane.visible.length; v++) {
				if (pane.rows[pane.visible[v]].mountState) {
					at = v;
					break;
				}
			}
			if (at >= 0) {
				pane.scroller.scrollTop = Math.max(0, (at - 2) * ROW);
			}
			render(pane);
			return { region: pane.id, at: at };
		});
	}

	function probeTheme() {
		var row = document.querySelector('.row');
		var header = document.querySelector('.pane-header');
		var body = window.getComputedStyle(document.body);
		return {
			bodyClass: document.body.className,
			bodyBackground: body.backgroundColor,
			bodyColor: body.color,
			headerBackground: header ? window.getComputedStyle(header).backgroundColor : null,
			rowColor: row ? window.getComputedStyle(row).color : null,
			// Unresolved var() collapses to empty, so a non-empty value proves the
			// --vscode-* variables actually reached the webview for this theme.
			focusBorder: body.getPropertyValue('--vscode-focusBorder'),
			listHoverBackground: body.getPropertyValue('--vscode-list-hoverBackground'),
			rows: state.panes.reduce(function (sum, pane) { return sum + pane.visible.length; }, 0),
			// The affordance the native tree cannot draw: a "+" on every pane and
			// every collapsed group, all visible at once with no hover.
			addActions: document.querySelectorAll('.add-action').length,
			mounts: document.querySelectorAll('.row.mount').length,
			attachedMounts: document.querySelectorAll('.row.mount.mount-attached').length,
			unavailableMounts: document.querySelectorAll('.row.mount.mount-unavailable').length,
			localDataMounts: document.querySelectorAll('.row.mount.mount-local-data').length,
			gridTemplateColumns: window.getComputedStyle(document.getElementById('grid')).gridTemplateColumns,
			gridTemplateRows: window.getComputedStyle(document.getElementById('grid')).gridTemplateRows,
			sidebarPx: document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight,
			panes: state.panes.map(function (pane) {
				var box = pane.scroller.getBoundingClientRect();
				return pane.label + ' ' + Math.round(box.width) + 'x' + Math.round(box.height);
			}),
		};
	}

	// -- protocol ----------------------------------------------------------

	function reply(requestId, payload, error) {
		vscode.postMessage({ type: 'result', requestId: requestId, payload: payload, error: error });
	}

	window.addEventListener('message', function (event) {
		var message = event.data;
		try {
			if (message.type === 'set-model') {
				state.model = message.model;
				state.mode = message.mode || 'virtual';
				buildPanes(state.model);
				setCollapsedState(message.expand === 'all');
				renderAll();
				afterPaint().then(function () {
					reply(message.requestId, {
						regions: state.model.regions.length,
						rows: state.model.rowCount,
						files: state.model.fileCount,
						domNodes: domNodes(),
					});
				});
				return;
			}
			if (message.type === 'run') {
				runSuite(message.mode, message.scrollFrames || 60).then(function (result) {
					reply(message.requestId, result);
				});
				return;
			}
			if (message.type === 'calibrate') {
				calibrate(message.frames || 60).then(function (result) {
					reply(message.requestId, result);
				});
				return;
			}
			if (message.type === 'probe-theme') {
				reply(message.requestId, probeTheme());
				return;
			}
			if (message.type === 'focus-mounts') {
				reply(message.requestId, focusMounts());
				return;
			}
			if (message.type === 'set-mode') {
				state.mode = message.mode;
				renderAll();
				afterPaint().then(function () {
					reply(message.requestId, { mode: state.mode, domNodes: domNodes() });
				});
				return;
			}
			reply(message.requestId, null, 'unknown message ' + message.type);
		} catch (err) {
			console.error(err);
			reply(message.requestId, null, String(err && err.stack ? err.stack : err));
		}
	});

	vscode.postMessage({ type: 'ready' });
})();
