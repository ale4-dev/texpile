// \chapter and \part show as level-1 headings, and regenerated as \section: a book lost its
// chapter structure on the first edit of any heading.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('\\chapter and \\part', () => {
	it.each(['\\chapter{Intro}', '\\chapter*{Preface}', '\\part{One}'])('%s regenerates as itself', (heading) => {
		expect(rt(`${heading}\n\nText.`)).toContain(heading);
	});

	it('\\section is untouched', () => {
		expect(rt('\\section{S}\n\nText.')).toContain('\\section{S}');
	});
});
