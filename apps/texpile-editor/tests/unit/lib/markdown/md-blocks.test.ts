import { describe, it, expect } from 'vitest';
import { gen, regen, blockTypes } from './mdTestUtils';

describe('block constructs', () => {
	// M13
	it('a fence whose info string holds a backtick is a tilde fence', () => {
		const src = '~~~ a`b\ncode\n~~~\n';
		expect(gen(src)).toBe('~~~a`b\ncode\n~~~');
		expect(regen(src)).toBe(gen(src));
		expect(blockTypes(gen(src))).toEqual(['code_block']);
	});

	// M17
	it('a $$ block ends at a blank line and never at another opener', () => {
		const src = '$$\nx\n$$ trailing\n\npara\n\n$$\ny\n$$\n';
		expect(blockTypes(src)).toEqual(['paragraph', 'paragraph', 'block_math']);
		expect(gen(src)).toBe('\\$\\$ x \\$\\$ trailing\n\npara\n\n$$\ny\n$$');
		expect(blockTypes('text\n$$5 and $$6 prices\nmore\n')).toEqual(['paragraph']);
	});
});
