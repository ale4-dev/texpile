import { EditorView } from '@codemirror/view';
import { tocCaretStore } from './tocStore';

/** source mode has no PM plugin; the update listener publishes the caret for the table of contents */
export const tocCaretListener = EditorView.updateListener.of((u) => {
	if (u.selectionSet) tocCaretStore.current = u.state.selection.main.head;
});
