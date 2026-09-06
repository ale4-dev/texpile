// CodeMirror's snippet parser turns `\{` into a bare `{`, so every literal brace pair in a snippet
// has to be written `\\{`; `\left{` used to insert `\left{\right}` and `\{` inserted `{}`.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { snippet } from '@codemirror/autocomplete';
import { LW_MACROS } from '$lib/languages/latex/intellisense/data/lwMacros';
import { TEX_MACROS } from '$lib/languages/latex/intellisense/data/texMacros';
import { AT_SUGGESTIONS } from '$lib/languages/latex/intellisense/data/atSuggestions';

function inserted(template: string): string {
	let state = EditorState.create({ doc: '' });
	snippet(template)({ state, dispatch: (tr) => (state = tr.state) }, null, 0, 0);
	return state.doc.toString();
}

describe('snippet braces', () => {
	it.each([
		['left{', '\\left\\{\\right\\}'],
		['{', '\\{\\}'],
		['bigl\\{', '\\bigl\\{\\bigr\\}']
	])('\\%s inserts %s', (label, text) => {
		const m = [...LW_MACROS, ...TEX_MACROS].find((x) => x.label === label);
		expect(m?.snippet).toBeTruthy();
		expect(inserted('\\' + m!.snippet!)).toBe(text);
	});

	it('the @{ suggestion inserts escaped braces', () => {
		const s = AT_SUGGESTIONS.find((x) => x.prefix === '{');
		expect(inserted(s!.body)).toBe('\\left\\{  \\right\\}');
	});

	it('no template built from the tables carries a brace the parser would strip', () => {
		// the macro builder prepends the backslash; @-suggestions are used as written
		const templates = [
			...[...LW_MACROS, ...TEX_MACROS].filter((x) => x.snippet).map((x) => '\\' + x.snippet),
			...AT_SUGGESTIONS.map((x) => x.body)
		];
		const stripped = templates.filter((t) => /(?<!\\)\\[{}]/.test(t));
		expect(stripped).toEqual([]);
	});
});
