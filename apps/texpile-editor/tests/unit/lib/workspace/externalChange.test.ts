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
