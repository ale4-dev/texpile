// `%` inside \url{} or \href{}{} tokenized as a comment, so the rest of the line (the closing
// brace, the link text, whatever followed) vanished from the argument and the regenerated line
// was unbalanced LaTeX.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { maskUrlSpecials } from '$lib/languages/latex/parser/urlMask';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('% and # inside a URL argument', () => {
	it('survive regeneration in \\href and \\url', () => {
		const out = rt('Link: \\href{https://example.com/a%20b}{example} and \\url{http://a.com/%7Euser#frag}.');
		expect(out).toContain('\\href{https://example.com/a%20b}{example}');
		expect(out).toContain('\\url{http://a.com/%7Euser#frag}');
		expect(out).toContain('and');
	});

	it('the mask is length-preserving and leaves everything outside the URL alone', () => {
		const src = 'A \\% b \\url{x%y} % real comment\n\\href{p#q}{50\\% off}';
		const masked = maskUrlSpecials(src);
		expect(masked.length).toBe(src.length);
		expect(masked).toContain('% real comment');
		expect(masked).toContain('{50\\% off}');
		expect(masked).not.toContain('x%y');
		expect(masked).not.toContain('p#q');
	});
});
