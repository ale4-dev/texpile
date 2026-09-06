// enumitem options on the list environment ([resume], [label=(\alph*)], [noitemsep]) were parsed
// as attached arguments and then never emitted, so an edited list silently lost them.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('list environment options', () => {
	it.each(['[resume]', '[label=(\\alph*)]', '[noitemsep,topsep=0pt]'])('enumerate%s keeps its options', (opts) => {
		const out = rt(`\\begin{enumerate}${opts}\n\\item one\n\\item two\n\\end{enumerate}`);
		expect(out).toContain(`\\begin{enumerate}${opts}\n`);
		expect(out.split('\\begin{enumerate}').length - 1).toBe(1);
		expect(out.split('\\item').length - 1).toBe(2);
		expect(out).toContain('one');
		expect(out).toContain('two');
	});

	it('a list without options is unchanged', () => {
		const out = rt('\\begin{itemize}\n\\item one\n\\end{itemize}');
		expect(out).toContain('\\begin{itemize}\n\\item');
	});
});
