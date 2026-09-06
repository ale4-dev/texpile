import { Plugin, PluginKey, type PluginSpec } from 'prosemirror-state';
import { EditorView, type NodeViewConstructor } from 'prosemirror-view';
import type { Node, ResolvedPos } from 'prosemirror-model';
import { MathLiveView } from './mlview.svelte';

export type MathLivePluginState = {
	/** cursor pos before entering a math node, decides front vs back placement on expand. */
	prevCursorPos: number;
};
const MATHLIVE_PLUGIN_KEY = new PluginKey<MathLivePluginState>('prosemirror-mathlive');

const mathPluginSpec: PluginSpec<MathLivePluginState> = {
	key: MATHLIVE_PLUGIN_KEY,
	state: {
		init() {
			return {
				prevCursorPos: 0
			};
		},
		apply(tr, value, oldState) {
			return {
				prevCursorPos: oldState.selection.from
			};
		}
	},
	props: {
		nodeViews: {
			inline_math: createMathView(false),
			block_math: createMathView(true)
		},
		handleClickOn(view, _pos, node, nodePos, event, direct) {
			const me = event as MouseEvent;
			if (!direct || me.button !== 0 || me.shiftKey || me.metaKey || me.ctrlKey || me.altKey) return false;
			if (node.isTextblock && node.type.name === 'paragraph') {
				const onlyMathfieldOrEmpty = node.childCount == 1 && node.child(0).type.name === 'inline_math';

				if (onlyMathfieldOrEmpty) {
					console.log('Placed Cursor at end of paragraph with only math fields');
					const endPos = nodePos + node.nodeSize - 1; // last valid text position inside the paragraph
					const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, endPos));
					view.dispatch(tr);
					view.focus();
					return true;
				}
			}
			return false;
		}
	}
};

export const mathlivePlugin = new Plugin(mathPluginSpec);

export function createMathView(displayMode: boolean): NodeViewConstructor {
	return (node: Node, view: EditorView, getPos: boolean | (() => number | undefined)): MathLiveView => {
		const nodeView = new MathLiveView(node, view, getPos as () => number, MATHLIVE_PLUGIN_KEY, displayMode);

		return nodeView;
	};
}

import { keymap } from 'prosemirror-keymap';
import { NodeSelection, TextSelection, Selection, EditorState, Transaction } from 'prosemirror-state';
// Up and Down around inline math. The browser's own vertical move loses its way next to the
// math widgets (it slides sideways or sticks), and a row holding nothing but a math node has no
// caret position of its own, so both the line-to-line move inside such a paragraph and the step
// into or out of it are placed by hand.
function mlVerticalArrowHandler(dir: 'up' | 'down') {
	return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
		const { $from, empty, head } = state.selection;
		if (!empty || !view) return false;
		const bias = dir === 'up' ? -1 : 1;
		const rowMath = containsMathField($from.parent);
		const neighbour = dir === 'up' ? getPreviousRow($from) : getNextRow($from);
		if (!rowMath && !(neighbour && containsMathField(neighbour))) return false;

		if (rowMath && !view.endOfTextblock(dir)) {
			// one visual line, found by geometry. side 1 reads a wrap point as the start of the
			// lower line, which is where the caret sits after a move or a keystroke
			const c = view.coordsAtPos(head, 1);
			const h = Math.max(4, c.bottom - c.top);
			const found = view.posAtCoords({ left: c.left, top: dir === 'up' ? c.top - h / 2 : c.bottom + h / 2 });
			if (found && found.pos !== head && state.doc.resolve(found.pos).sameParent($from)) {
				const t = view.coordsAtPos(found.pos, 1);
				if (Math.abs(t.top - c.top) > h / 2) {
					dispatch?.(state.tr.setSelection(Selection.near(state.doc.resolve(found.pos), bias)));
					return true;
				}
			}
			// no further line that way: this IS the edge (endOfTextblock misjudges a line a tall
			// math widget stretches), so fall through to the step out of the paragraph
		} else if (!view.endOfTextblock(dir)) return false;

		try {
			// near, not a text selection at a raw offset: the neighbour may be block math or a
			// table, where the offset is not a caret position
			const $edge = state.doc.resolve(dir === 'up' ? $from.before() : $from.after());
			dispatch?.(state.tr.setSelection(Selection.near($edge, bias)));
			return true;
		} catch (e) {
			if (e instanceof RangeError) return false;
			throw e;
		}
	};
}

function getPreviousRow($from: ResolvedPos): Node | null {
	const beforePos = $from.before(1);
	const $before = $from.doc.resolve(beforePos);
	return $before.nodeBefore;
}

function getNextRow($from: ResolvedPos): Node | null {
	const afterPos = $from.after(1);
	const $after = $from.doc.resolve(afterPos);
	return $after.nodeAfter;
}

function containsMathField(node: Node): boolean {
	let found = false;
	node.content.forEach((child) => {
		if (child.type.name === 'inline_math') {
			found = true;
		}
	});
	return found;
}

// selects an adjacent mathfield on left/right when there is no text node between it and the cursor.
function mlHorizontalArrowHandler(dir: 'left' | 'right') {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const { $from, empty } = state.selection;
		if (!empty) return false;

		const parent = $from.parent;
		if (parent.type.name !== 'paragraph') return false;

		const indexInParent = $from.index();

		if (dir === 'right') {
			if (indexInParent < parent.childCount) {
				const nextChild = parent.child(indexInParent);
				if (nextChild.type.name === 'inline_math') {
					const offsetInParent = $from.parentOffset;
					let posBeforeNext = 0;
					for (let i = 0; i < indexInParent; i++) {
						posBeforeNext += parent.child(i).nodeSize;
					}
					if (offsetInParent === posBeforeNext) {
						const mathPos = $from.before() + 1 + posBeforeNext;
						const tr = state.tr.setSelection(NodeSelection.create(state.doc, mathPos));
						dispatch?.(tr);
						return true;
					}
				}
			}
		} else {
			if (indexInParent > 0) {
				const prevChild = parent.child(indexInParent - 1);
				if (prevChild.type.name === 'inline_math') {
					const offsetInParent = $from.parentOffset;
					let posAfterPrev = 0;
					for (let i = 0; i < indexInParent; i++) {
						posAfterPrev += parent.child(i).nodeSize;
					}
					if (offsetInParent === posAfterPrev) {
						const mathPos = $from.before() + 1 + posAfterPrev - prevChild.nodeSize;
						const tr = state.tr.setSelection(NodeSelection.create(state.doc, mathPos));
						dispatch?.(tr);
						return true;
					}
				}
			}
		}

		return false;
	};
}

/** must come before the regular keymap in plugin order. */
export const mlarrowHandlers = keymap({
	ArrowUp: mlVerticalArrowHandler('up'),
	ArrowDown: mlVerticalArrowHandler('down'),
	ArrowRight: mlHorizontalArrowHandler('right'),
	ArrowLeft: mlHorizontalArrowHandler('left')
});
