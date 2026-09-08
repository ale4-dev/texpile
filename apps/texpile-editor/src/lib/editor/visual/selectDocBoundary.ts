// Ctrl+Home / Ctrl+End, bound rather than left to the browser.
import { Selection, type Command } from 'prosemirror-state';

/**
 * Nothing claimed these, so contenteditable answered them, and it needs a TEXT position to land
 * on: in a paper ending on `\bibliography{refs}` (a raw block) Ctrl+End did nothing at all, while
 * Ctrl+Home worked. Selection.atStart/atEnd fall back to a gap cursor, so both always move.
 */
export const selectDocStart: Command = (state, dispatch) => {
	dispatch?.(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView());
	return true;
};

export const selectDocEnd: Command = (state, dispatch) => {
	dispatch?.(state.tr.setSelection(Selection.atEnd(state.doc)).scrollIntoView());
	return true;
};
