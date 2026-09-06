// \item[label] labels are shown in the editor as leading bold text, so the serializer has to take
// that text back out before rewriting the bracket. Matching it against the raw source only worked
// for plain ascii labels: a tie, a dash ligature, math or nested markup all missed, and the label
// was written twice (once as [label], once as \textbf in the body).
import { describe, it, expect } from 'vitest';
import { Fragment, type Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

function regenerate(body: string): string {
	const file = `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
	const parsed = parseLatexFile(file);
	// drop orig so every block goes through the deterministic rules, which is what an edit does
	const kids: Node[] = [];
	for (let i = 0; i < parsed.doc.childCount; i++) {
		const c = parsed.doc.child(i);
		kids.push(c.type.create({ ...c.attrs, orig: null }, c.content, c.marks));
	}
	const out = serializeLatexFile(parsed, parsed.doc.copy(Fragment.fromArray(kids)));
	return out.slice(out.indexOf('\\begin{document}') + 16, out.lastIndexOf('\\end{document}')).trim();
}

describe('description item labels', () => {
	for (const label of ['Case~1', '2020--2021', '\\emph{x} y', 'A $x$ B', '(I)', 'Step 1', '\\textbf{Note}']) {
		it(`writes ${JSON.stringify(label)} once`, () => {
			const out = regenerate(`\\begin{description}\n\\item[${label}] body text\n\\end{description}`);
			// the label survives as the bracket, and the body is left holding nothing but the body
			expect(out).toContain(`\\item[${label}]`);
			const body = out
				.replace(/^\\begin\{description\}\s*\\item\[[\s\S]*?\]/, '')
				.replace(/\\par|\\end\{description\}/g, '')
				.trim();
			expect(body).toBe('body text');
		});
	}

	it('drops the bracket rather than duplicating a label it cannot find', () => {
		// a label whose text the user has since replaced: nothing in the body accounts for it
		const file =
			'\\documentclass{article}\n\\begin{document}\n\\begin{description}\n\\item[Term] body\n\\end{description}\n\\end{document}\n';
		const parsed = parseLatexFile(file);
		const list = parsed.doc.child(0);
		const para = list.child(0);
		const retyped = para.type.create(para.attrs, para.type.schema.text('something else entirely'));
		const edited = list.type.create({ ...list.attrs, orig: null }, Fragment.fromArray([retyped]));
		const out = serializeLatexFile(parsed, parsed.doc.copy(Fragment.fromArray([edited])));
		expect(out).toMatch(/\\item\s+something else entirely/);
		expect(out).not.toContain('[Term]');
	});
});
