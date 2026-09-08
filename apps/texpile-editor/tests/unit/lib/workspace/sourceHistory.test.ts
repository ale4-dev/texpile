// Undo used to end at the tab boundary: every open reset the stack to the on-disk content, so
// switching away and back lost the history the way no other editor does. Stacks are per file now,
// which means the floor has to be re-checked on the way back in - a file changed while it was off
// screen has a new one, and stepping below it would resurrect content nothing on disk has.
import { describe, it, expect } from 'vitest';
import { createSourceHistory } from '$lib/workspace/sourceHistory';

const A = '/w/a.tex';
const B = '/w/b.tex';

describe('cross-mode history, per file', () => {
	it('survives a tab round trip', () => {
		const h = createSourceHistory();
		h.open(A, 'one');
		h.capture('two');
		h.open(B, 'other'); // switch away
		h.open(A, 'two'); // and back: disk still holds what the stack ends on
		expect(h.step('undo', 'two')).toBe('one');
	});

	it('keeps the two files apart', () => {
		const h = createSourceHistory();
		h.open(A, 'a1');
		h.capture('a2');
		h.open(B, 'b1');
		expect(h.step('undo', 'b1')).toBeNull(); // b has one entry, nothing to undo into
		h.open(A, 'a2');
		expect(h.step('undo', 'a2')).toBe('a1');
	});

	it('drops a stack whose file changed while it was off screen', () => {
		const h = createSourceHistory();
		h.open(A, 'one');
		h.capture('two');
		h.open(B, 'other');
		// git checkout / another editor / a discard rewrote it behind our back
		h.open(A, 'rewritten from outside');
		expect(h.step('undo', 'rewritten from outside')).toBeNull();
	});

	it('forgets a closed tab', () => {
		const h = createSourceHistory();
		h.open(A, 'one');
		h.capture('two');
		h.forget(A);
		h.open(A, 'two');
		expect(h.step('undo', 'two')).toBeNull();
	});

	it('still steps within one file', () => {
		const h = createSourceHistory();
		h.open(A, 'one');
		h.capture('two');
		h.capture('three');
		expect(h.step('undo', 'three')).toBe('two');
		expect(h.step('undo', 'two')).toBe('one');
		expect(h.step('undo', 'one')).toBeNull();
		expect(h.step('redo', 'one')).toBe('two');
	});

	it('captures nothing while disabled', () => {
		const h = createSourceHistory();
		h.disable();
		h.capture('x');
		expect(h.step('undo', 'x')).toBeNull();
	});
});
