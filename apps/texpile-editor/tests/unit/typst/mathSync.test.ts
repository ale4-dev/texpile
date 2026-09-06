// @vitest-environment jsdom
// An equation edited through MathLive must keep its edit on save even when MathLive is no
// longer there to convert it (T23): the conversion happens at edit time, into the node's attrs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { typstMathSyncPlugin } from '$lib/languages/typst/visual/mathSyncPlugin';
import { serializeToTypst } from '$lib/languages/typst/visual/serializer';

// stands in for mathlive's element: its typst output for a given latex is canned
class StubMathfield extends HTMLElement {
	private latex = '';
	setValue(v: string) {
		this.latex = v;
	}
	getValue(format: string) {
		return format === 'typst' ? this.latex.replace(/\\frac\{(\w+)\}\{(\w+)\}/, '$1/$2') : this.latex;
	}
}

const win = window as unknown as { MathfieldElement?: unknown };

describe('math edits are converted while mathlive is loaded', () => {
	beforeEach(() => {
		if (!customElements.get('stub-mathfield')) customElements.define('stub-mathfield', StubMathfield);
		win.MathfieldElement = StubMathfield;
	});
	afterEach(() => {
		delete win.MathfieldElement;
	});

	it('an edited equation serializes to its new typst after mathlive is gone', () => {
		const math = typSchema.nodes.inline_math.create({ typst: 'x', latexOrig: 'x' }, typSchema.text('x'));
		const doc = typSchema.nodes.doc.create(null, typSchema.nodes.paragraph.create(null, math));
		let state = EditorState.create({ doc, plugins: [typstMathSyncPlugin] });
		const pos = 1;
		const edited = math.type.create({ ...math.attrs }, typSchema.text('\\frac{a}{b}'));
		state = state.apply(state.tr.replaceWith(pos, pos + math.nodeSize, edited));
		const node = state.doc.child(0).child(0);
		expect(node.attrs).toMatchObject({ typst: 'a/b', latexOrig: '\\frac{a}{b}' });

		delete win.MathfieldElement;
		expect(serializeToTypst(state.doc)).toBe('$a/b$');
	});
});
