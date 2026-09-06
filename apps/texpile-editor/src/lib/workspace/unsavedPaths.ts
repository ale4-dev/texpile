// Does a tree path cover edits that exist only in the editor? Deleting one of those destroys work
// no undo reaches, so the file tree asks first.
import { samePath } from './fileSystem';
import { sepOf } from '$lib/filetree/treePaths';

/** `path` itself, or anything inside it when it is a folder */
function covers(path: string, candidate: string | null): boolean {
	if (!candidate) return false;
	return samePath(candidate, path) || candidate.startsWith(path + sepOf(path));
}

/**
 * `loaded` is the open document (unsaved only while `dirty`); `pending` is an edit the save
 * pipeline has queued but not written, which outlives a switch to another file.
 */
export function hasUnsavedUnder(path: string, state: { loaded: string | null; dirty: boolean; pending: string | null }): boolean {
	return (state.dirty && covers(path, state.loaded)) || covers(path, state.pending);
}
