// Typst source-mode CodeMirror chords - the typst sibling of markdown/sourceExtensions.ts. The
// commands are the same pure computations TypstSourceToolbar already clicks, so a chord and its
// button produce identical edits; only the trigger differs.
//
// The chords match Typst VISUAL mode (TypstEditorView's Mod-b/i/u/`/./,/Shift-b/Shift-`/m/Shift-m/
// Alt-0..6) rather than being invented here, so muscle memory survives a mode switch. Mod-k for
// links follows the markdown source keymap; LaTeX source has no link chord because \href takes two
// arguments and its toolbar button owns that flow.
import { keymap, type EditorView } from '@codemirror/view';
import type { Extension, TransactionSpec, EditorState } from '@codemirror/state';
import { computeToggleDelim, computeWrap, computeHeadingLine, computeFence, computeLink, computeMathBlock } from './sourceInsert';

function run(build: (state: EditorState) => TransactionSpec) {
	return (view: EditorView): boolean => {
		view.dispatch(build(view.state));
		return true;
	};
}

export function typSourceShortcuts(): Extension {
	return keymap.of([
		// * and _ are Typst's own strong/emphasis delimiters; the rest have no shorthand and go
		// through the function form the visual serializer also emits.
		{ key: 'Mod-b', run: run((s) => computeToggleDelim(s, '*')) },
		{ key: 'Mod-i', run: run((s) => computeToggleDelim(s, '_')) },
		{ key: 'Mod-u', run: run((s) => computeWrap(s, '#underline[', ']')) },
		{ key: 'Mod-`', run: run((s) => computeToggleDelim(s, '`')) },
		{ key: 'Mod-.', run: run((s) => computeWrap(s, '#super[', ']')) },
		{ key: 'Mod-Shift-,', run: run((s) => computeWrap(s, '#sub[', ']')) },
		{ key: 'Mod-m', run: run((s) => computeToggleDelim(s, '$')) },
		{ key: 'Mod-Shift-m', run: run(computeMathBlock) },
		{ key: 'Mod-Shift-b', run: run((s) => computeWrap(s, '#quote(block: true)[', ']')) },
		{ key: 'Mod-Shift-`', run: run(computeFence) },
		{ key: 'Mod-k', run: run(computeLink) },
		...[0, 1, 2, 3, 4, 5, 6].map((level) => ({
			key: `Mod-Alt-${level}`,
			run: run((s: EditorState) => computeHeadingLine(s, level))
		}))
	]);
}
