/**
 * Cross-mode undo/redo: a snapshot history over the raw source that survives mode switches (the
 * PM/CM histories die with their view). Content equal to the previous/next snapshot MOVES the
 * index instead of pushing, so native undos don't pollute the stack. Trimmed by entry count AND
 * total characters, so a large paper can't pin hundreds of MB of snapshots in a long session.
 *
 * One stack PER FILE, kept while its tab is open, so undo survives a tab round trip the way every
 * other editor's does. `open` resumes a stack only while its head still matches what was just read
 * from disk: a file edited from outside, discarded or restored while it was not on screen has a
 * new floor, and stepping below it would resurrect content nothing on disk has any more.
 */
const MAX_ENTRIES = 200;
const MAX_CHARS = 16_000_000; // ~32 MB of UTF-16 snapshot text, per file
/** stacks are dropped as tabs close; this only bounds a session that never closes one */
const MAX_FILES = 24;

type Stack = { hist: string[]; index: number };

export type SourceHistory = {
	/** make `path` the live stack, seeded with the on-disk content when there is nothing to resume */
	open(path: string, content: string): void;
	/** empty + inert (capture bails) for file kinds without cross-mode history. */
	disable(): void;
	/** the tab closed: its stack is unreachable now */
	forget(path: string): void;
	capture(content: string): void;
	/** the snapshot to apply for a step, or null at the stack edge. flushes `current` first so a
	 * pending debounced capture is never skipped; the internal applying flag (cleared next tick)
	 * swallows the echo capture from the caller's application. */
	step(dir: 'undo' | 'redo', current: string): string | null;
};

export function createSourceHistory(): SourceHistory {
	// insertion-ordered, so the oldest key is the least recently opened
	const stacks = new Map<string, Stack>();
	let live: Stack | null = null;
	let applying = false;

	function capture(content: string) {
		if (applying || !live || live.index < 0) return;
		const { hist, index } = live;
		if (hist[index] === content) return;
		if (index > 0 && hist[index - 1] === content) {
			live.index--; // a native undo walked the buffer back, follow it
			return;
		}
		if (index < hist.length - 1 && hist[index + 1] === content) {
			live.index++; // a native redo, follow forward
			return;
		}
		const next = [...hist.slice(0, index + 1), content];
		let total = 0;
		for (const s of next) total += s.length;
		let drop = Math.max(0, next.length - MAX_ENTRIES);
		// always keep the newest two so one undo step survives even a giant snapshot
		while (drop < next.length - 2 && total > MAX_CHARS) total -= next[drop++].length;
		live.hist = drop > 0 ? next.slice(drop) : next;
		live.index = live.hist.length - 1;
	}

	return {
		open(path: string, content: string) {
			const kept = stacks.get(path);
			if (kept && kept.hist[kept.index] === content) {
				stacks.delete(path); // re-insert so it counts as most recently opened
				stacks.set(path, kept);
				live = kept;
				return;
			}
			const fresh: Stack = { hist: [content], index: 0 };
			stacks.delete(path);
			stacks.set(path, fresh);
			live = fresh;
			for (const oldest of stacks.keys()) {
				if (stacks.size <= MAX_FILES) break;
				stacks.delete(oldest);
			}
		},
		disable() {
			live = null;
		},
		forget(path: string) {
			const stack = stacks.get(path);
			stacks.delete(path);
			if (stack === live) live = null;
		},
		capture,
		step(dir: 'undo' | 'redo', current: string): string | null {
			if (!live) return null;
			capture(current);
			const target = live.index + (dir === 'undo' ? -1 : 1);
			if (target < 0 || target >= live.hist.length) return null;
			live.index = target;
			applying = true;
			setTimeout(() => (applying = false), 0);
			return live.hist[target];
		}
	};
}
