// The inline name inputs refuse a name that is taken while it is being typed, instead of letting
// the operation fail at the file system afterwards.
import { describe, it, expect } from 'vitest';
import { nameTaken } from '$lib/filetree/treePaths';
import type { TreeEntry } from '$lib/workspace/fileSystem';

const file = (path: string): TreeEntry => ({ name: path.slice(path.lastIndexOf('/') + 1), path, type: 'file' });
const tree: TreeEntry[] = [
	file('/proj/main.tex'),
	{ name: 'sec', path: '/proj/sec', type: 'dir', children: [file('/proj/sec/intro.tex')] },
	{ name: 'empty', path: '/proj/empty', type: 'dir' }
];

describe('nameTaken', () => {
	it('finds a clash at the root and inside a folder', () => {
		expect(nameTaken(tree, '/proj', '/proj', 'main.tex')).toBe(true);
		expect(nameTaken(tree, '/proj/sec', '/proj', 'intro.tex')).toBe(true);
		expect(nameTaken(tree, '/proj/sec', '/proj', 'main.tex')).toBe(false);
	});

	// the file systems we run on are mostly case-insensitive, so MAIN.TEX would collide
	it('matches case-insensitively, but lets an entry be recased', () => {
		expect(nameTaken(tree, '/proj', '/proj', 'MAIN.TEX')).toBe(true);
		expect(nameTaken(tree, '/proj', '/proj', 'MAIN.TEX', '/proj/main.tex')).toBe(false);
	});

	// a folder the tree has not expanded has no children to check; the file system still refuses
	it('reports nothing for a folder whose contents are unknown', () => {
		expect(nameTaken(tree, '/proj/empty', '/proj', 'anything.tex')).toBe(false);
	});
});
