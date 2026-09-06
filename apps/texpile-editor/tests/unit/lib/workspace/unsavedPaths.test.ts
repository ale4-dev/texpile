// What the file tree consults before deleting: the recycle bin holds the file as it was on disk,
// so the part a delete really destroys is the part that was never written.
import { describe, it, expect } from 'vitest';
import { hasUnsavedUnder } from '$lib/workspace/unsavedPaths';

const state = (over: Partial<{ loaded: string | null; dirty: boolean; pending: string | null }> = {}) => ({
	loaded: '/proj/sec/main.tex',
	dirty: true,
	pending: null,
	...over
});

describe('hasUnsavedUnder', () => {
	it('covers the open dirty file and the folder holding it', () => {
		expect(hasUnsavedUnder('/proj/sec/main.tex', state())).toBe(true);
		expect(hasUnsavedUnder('/proj/sec', state())).toBe(true);
		expect(hasUnsavedUnder('/proj/other', state())).toBe(false);
	});

	it('says nothing is at stake once the buffer is clean', () => {
		expect(hasUnsavedUnder('/proj/sec/main.tex', state({ dirty: false }))).toBe(false);
	});

	// a queued write outlives a switch to another file: those edits are still only in memory
	it('covers a queued save for a file that is no longer open', () => {
		expect(hasUnsavedUnder('/proj/old.tex', state({ dirty: false, pending: '/proj/old.tex' }))).toBe(true);
	});

	// /proj/sec must not match /proj/section.tex
	it('does not treat a name prefix as containment', () => {
		expect(hasUnsavedUnder('/proj/se', state())).toBe(false);
	});
});
