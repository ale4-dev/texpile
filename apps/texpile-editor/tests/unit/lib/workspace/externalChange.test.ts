// An mtime-only rewrite of the open file (touch, a formatter, a checkout and back) trips the save
// guard; the conflict check then found disk equal to the baseline and returned without a fresh
// stamp, so every later autosave tripped the guard again and nothing reached disk.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalChangeWatcher, type ExternalChangeDeps } from '$lib/workspace/externalChange.svelte';
import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
import { recordDiskStamp } from '$lib/workspace/diskStamp';

vi.mock('$lib/workspace/diskStamp', () => ({ recordDiskStamp: vi.fn(async () => {}) }));

const PATH = '/ws/main.tex';

function makeWatcher(over: Partial<ExternalChangeDeps> = {}) {
	const deps: ExternalChangeDeps = {
		getLoadedPath: () => PATH,
		isTextual: () => true,
		isStructured: () => true,
		whenIdle: async () => {},
		readText: async () => 'same',
		getDiskBaseline: () => 'same',
		setDiskBaseline: () => {},
		getBuffer: () => 'same',
		setTexSource: () => {},
		setRawContent: () => {},
		setEol: () => {},
		rebuildVisual: () => {},
		discardQueuedSave: () => {},
		sessionEdit: () => {},
		saveNow: () => {},
		...over
	};
	return new ExternalChangeWatcher(deps);
}

beforeEach(() => {
	vi.mocked(recordDiskStamp).mockClear();
	activeFilePath.current = PATH;
	isDirty.current = true;
});

describe('ExternalChangeWatcher.check', () => {
	it('re-stamps when disk holds the same bytes as the baseline', async () => {
		const w = makeWatcher({ getBuffer: () => 'same plus my edit' });
		await w.check();
		expect(recordDiskStamp).toHaveBeenCalledWith(PATH);
		expect(w.conflict).toBeNull();
	});

	it('raises the conflict, and does not re-stamp, when disk really changed under a dirty buffer', async () => {
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine' });
		await w.check();
		expect(w.conflict?.disk).toBe('theirs');
		expect(recordDiskStamp).not.toHaveBeenCalled();
	});
});

// The two real answers each destroy one of the two versions, so the dialog's Escape / X had to
// stop meaning "keep mine": dismissing now defers, and nothing is written or replaced.
describe('ExternalChangeWatcher.resolve', () => {
	it('defer leaves disk and the buffer exactly as they are', async () => {
		const saveNow = vi.fn();
		const setTexSource = vi.fn();
		const discardQueuedSave = vi.fn();
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine', saveNow, setTexSource, discardQueuedSave });
		await w.check();
		expect(w.conflict).not.toBeNull();

		w.resolve('defer');
		expect(w.conflict).toBeNull();
		expect(saveNow).not.toHaveBeenCalled(); // disk keeps their version
		expect(setTexSource).not.toHaveBeenCalled(); // the buffer keeps mine
		expect(discardQueuedSave).not.toHaveBeenCalled();
		expect(isDirty.current).toBe(true); // still unsaved, so the next save asks again
	});

	it('keep still forces the write through the guard', async () => {
		const saveNow = vi.fn();
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine', saveNow });
		await w.check();
		w.resolve('keep');
		expect(saveNow).toHaveBeenCalled();
	});
});
