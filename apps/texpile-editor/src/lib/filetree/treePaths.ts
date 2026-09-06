// path arithmetic on tree entry paths, which keep whichever separator the OS handed us
import { samePath, type TreeEntry } from '$lib/workspace/fileSystem';

export function sepOf(p: string): string {
	return p.includes('\\') ? '\\' : '/';
}

export function parentOf(p: string): string {
	const i = p.lastIndexOf(sepOf(p));
	return i >= 0 ? p.slice(0, i) : p;
}

/** the directory a drop on this entry would land in */
export function dropDir(entry: TreeEntry): string {
	return entry.type === 'dir' ? entry.path : parentOf(entry.path);
}

export function isInside(path: string, ancestor: string): boolean {
	return path.startsWith(ancestor + sepOf(ancestor));
}

/** the entries directly inside `dir`; empty for a folder the tree has not expanded yet */
export function childrenOf(tree: TreeEntry[], dir: string, root: string): TreeEntry[] {
	if (samePath(dir, root)) return tree;
	const find = (list: TreeEntry[]): TreeEntry[] | null => {
		for (const e of list) {
			if (e.type !== 'dir') continue;
			if (samePath(e.path, dir)) return e.children ?? [];
			if (isInside(dir, e.path) && e.children) {
				const inner = find(e.children);
				if (inner) return inner;
			}
		}
		return null;
	};
	return find(tree) ?? [];
}

/**
 * Is `name` already used inside `dir`? Case-insensitively, because the file systems we run on
 * mostly are, except for `selfPath`, so an entry can still be recased. An unexpanded folder
 * reports nothing, and the operation falls back to failing at the file system.
 */
export function nameTaken(tree: TreeEntry[], dir: string, root: string, name: string, selfPath?: string | null): boolean {
	const wanted = name.trim().toLowerCase();
	if (!wanted) return false;
	return childrenOf(tree, dir, root).some((e) => e.name.toLowerCase() === wanted && !(selfPath && samePath(e.path, selfPath)));
}
