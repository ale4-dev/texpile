import { describe, it, expect } from 'vitest';
import { mathLatexEquivalent } from '$lib/editor/visual/extensions/mathlivebridge/mlEquivalent';

describe('mathLatexEquivalent', () => {
	it('ignores the space that only terminates a control word', () => {
		expect(mathLatexEquivalent('\\prob{y \\mid \\vecx}', '\\prob{y \\mid\\vecx}')).toBe(true);
	});

	it('still sees a real edit', () => {
		expect(mathLatexEquivalent('\\alpha + \\beta', '\\alpha + \\gamma')).toBe(false);
		expect(mathLatexEquivalent('x^2', 'x^3')).toBe(false);
	});

	it('keeps an interword space, which is a control symbol and not a gap', () => {
		expect(mathLatexEquivalent('a\\ b', 'ab')).toBe(false);
	});
});
