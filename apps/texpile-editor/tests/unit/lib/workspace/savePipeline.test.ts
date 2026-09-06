// The external-write guard: an autosave must not overwrite a file someone else (VS Code, a git
// checkout, an AI agent) wrote since we last read or wrote it. Without the guard the sequence
// "user types -> agent writes -> 1.5s autosave" silently destroys the agent's edit; the window
// never lost focus, so the focus-driven conflict check never ran.
import { describe, it, expect, vi } from 'vitest';
import { SavePipeline, type SaveDeps } from '$lib/workspace/savePipeline.svelte';

function makePipeline(over: Partial<SaveDeps> = {}) {
	const writes: { path: string; content: string }[] = [];
	const deps: SaveDeps = {
		sessionEdit: () => {},
		isGuest: () => false,
		autosaveActive: () => true,
		writeText: async (path, content) => {
			writes.push({ path, content });
		},
		getEol: () => '\n',
		getLoadedPath: () => '/ws/main.tex',
		getLiveContent: () => 'live',
		setDiskBaseline: () => {},
		setDirty: () => {},
		diskChanged: async () => false,
		recordDiskStamp: async () => {},
		raiseConflict: () => {},
		...over
	};
	return { pipeline: new SavePipeline(deps), writes, deps };
}

describe('SavePipeline external-write guard', () => {
	it('writes normally while disk is untouched', async () => {
		const { pipeline, writes } = makePipeline();
		await pipeline.enqueue('/ws/main.tex', 'mine', false);
		expect(writes).toEqual([{ path: '/ws/main.tex', content: 'mine' }]);
	});

	it('aborts the write and raises the conflict when disk changed underneath', async () => {
		const raiseConflict = vi.fn();
		const { pipeline, writes } = makePipeline({ diskChanged: async () => true, raiseConflict });
		await pipeline.enqueue('/ws/main.tex', 'mine', false);
		expect(writes).toEqual([]); // the external edit survived
		expect(raiseConflict).toHaveBeenCalledWith('/ws/main.tex');
	});

	it('force writes through the guard (the conflict modal\'s "keep mine")', async () => {
		const raiseConflict = vi.fn();
		const { pipeline, writes } = makePipeline({ diskChanged: async () => true, raiseConflict });
		await pipeline.enqueue('/ws/main.tex', 'mine', false, true);
		expect(writes).toEqual([{ path: '/ws/main.tex', content: 'mine' }]);
		expect(raiseConflict).not.toHaveBeenCalled();
	});

	it('re-stamps after its own write, so the next autosave is not seen as external', async () => {
		const recordDiskStamp = vi.fn(async () => {});
		const { pipeline } = makePipeline({ recordDiskStamp });
		await pipeline.enqueue('/ws/main.tex', 'mine', false);
		expect(recordDiskStamp).toHaveBeenCalledWith('/ws/main.tex');
	});

	it('does not re-stamp an aborted write, so the conflict stays detectable', async () => {
		const recordDiskStamp = vi.fn(async () => {});
		const { pipeline } = makePipeline({ diskChanged: async () => true, recordDiskStamp });
		await pipeline.enqueue('/ws/main.tex', 'mine', false);
		expect(recordDiskStamp).not.toHaveBeenCalled();
	});

	it('clears the saving flag after an aborted write', async () => {
		const { pipeline } = makePipeline({ diskChanged: async () => true });
		await pipeline.enqueue('/ws/main.tex', 'mine', false);
		expect(pipeline.saving).toBe(false);
	});

	it('an aborted write does not break the chain for later writes', async () => {
		let changed = true;
		const { pipeline, writes } = makePipeline({ diskChanged: async () => changed });
		await pipeline.enqueue('/ws/main.tex', 'first', false);
		changed = false; // conflict resolved (e.g. user reloaded, then typed again)
		await pipeline.enqueue('/ws/main.tex', 'second', false);
		expect(writes).toEqual([{ path: '/ws/main.tex', content: 'second' }]);
	});

	it('does not mark the buffer clean when the write was aborted', async () => {
		const setDirty = vi.fn();
		const { pipeline } = makePipeline({
			diskChanged: async () => true,
			setDirty,
			getLiveContent: () => 'mine'
		});
		await pipeline.enqueue('/ws/main.tex', 'mine', false);
		expect(setDirty).not.toHaveBeenCalled(); // still dirty: the user's edit has not landed anywhere
	});
});

// A flush used to clear the queued edit BEFORE the write ran, so a write the guard aborted (an
// mtime-only rewrite: touch, a checkout and back) or that failed (a locked file) left the edit
// tracked nowhere: not on disk, not in `pending`, gone on the next switch without a prompt.
describe('SavePipeline keeps an unlanded edit queued', () => {
	const tick = () => new Promise((r) => setTimeout(r, 0));

	it('re-queues the edit when the guard aborts the write, and the next flush lands it', async () => {
		let changed = true;
		const { pipeline, writes } = makePipeline({ autosaveActive: () => false, diskChanged: async () => changed });
		pipeline.schedule('/ws/main.tex', 'mine');
		pipeline.flush();
		await pipeline.whenIdle();
		await tick();
		expect(writes).toEqual([]);
		expect(pipeline.pending).toEqual({ path: '/ws/main.tex', content: 'mine' });

		changed = false; // the conflict check re-stamped: same bytes, new mtime
		pipeline.flush();
		await pipeline.whenIdle();
		await tick();
		expect(writes).toEqual([{ path: '/ws/main.tex', content: 'mine' }]);
		expect(pipeline.pending).toBeNull();
	});

	it('re-queues the edit when the write throws', async () => {
		const { pipeline } = makePipeline({
			autosaveActive: () => false,
			writeText: async () => {
				throw new Error('EPERM');
			}
		});
		pipeline.schedule('/ws/main.tex', 'mine');
		pipeline.flush();
		await pipeline.whenIdle();
		await tick();
		expect(pipeline.pending).toEqual({ path: '/ws/main.tex', content: 'mine' });
	});

	it('does not clobber a newer edit queued while the failed write was in flight', async () => {
		const { pipeline } = makePipeline({ autosaveActive: () => false, diskChanged: async () => true });
		pipeline.schedule('/ws/main.tex', 'first');
		pipeline.flush();
		pipeline.schedule('/ws/main.tex', 'second');
		await pipeline.whenIdle();
		await tick();
		expect(pipeline.pending).toEqual({ path: '/ws/main.tex', content: 'second' });
	});

	it('clears the queue after a write that landed', async () => {
		const { pipeline, writes } = makePipeline({ autosaveActive: () => false });
		pipeline.schedule('/ws/main.tex', 'mine');
		pipeline.flush();
		await pipeline.whenIdle();
		await tick();
		expect(writes).toEqual([{ path: '/ws/main.tex', content: 'mine' }]);
		expect(pipeline.pending).toBeNull();
	});

	// the re-queue must not undo a deliberate abandonment: discard is what the file tree calls
	// when the open file is being deleted, and what the conflict modal calls for "reload from disk"
	it('does not re-queue an edit discarded while the failed write was in flight', async () => {
		const { pipeline } = makePipeline({ autosaveActive: () => false, diskChanged: async () => true });
		pipeline.schedule('/ws/main.tex', 'mine');
		pipeline.flush();
		pipeline.discard();
		await pipeline.whenIdle();
		await tick();
		expect(pipeline.pending).toBeNull();
	});

	it('does not re-queue at a path a rename emptied while the failed write was in flight', async () => {
		const { pipeline } = makePipeline({ autosaveActive: () => false, diskChanged: async () => true });
		pipeline.schedule('/ws/main.tex', 'mine');
		pipeline.flush();
		pipeline.retarget('/ws/main.tex', '/ws/renamed.tex');
		await pipeline.whenIdle();
		await tick();
		expect(pipeline.pending).toBeNull();
	});
});
