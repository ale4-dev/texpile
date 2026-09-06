// text escaping and inline-mark wrapping for the LaTeX serializer
import type { Node, Mark } from 'prosemirror-model';

const ESCAPE_RE = /[\\{}#%&$_^]/g;
const ESCAPE_MAP: Record<string, string> = {
	'\\': '\\textbackslash{}',
	'{': '\\{',
	'}': '\\}',
	'#': '\\#',
	'%': '\\%',
	'&': '\\&',
	$: '\\$',
	_: '\\_',
	'^': '\\^{}'
};

/** text-mode escaping, single pass (runs per text node on every serialization). */
export function sanitizeText(text: string): string {
	return text.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

export type EscMode = 'text' | 'href' | 'math' | 'verbatim' | 'raw';

/** The single escaper. Only `text` mutates; href/math/verbatim/raw pass through. */
export function esc(value: string, mode: EscMode = 'text'): string {
	return mode === 'text' ? sanitizeText(value) : value;
}

// em is \textit (not \emph); highlight is soul's \hl. href is NOT escaped.
const MARKS: Record<string, (attrs: Record<string, unknown>) => { open: string; close: string }> = {
	strong: () => ({ open: '\\textbf{', close: '}' }),
	em: () => ({ open: '\\textit{', close: '}' }),
	u: () => ({ open: '\\underline{', close: '}' }),
	sup: () => ({ open: '\\textsuperscript{', close: '}' }),
	sub: () => ({ open: '\\textsubscript{', close: '}' }),
	code: () => ({ open: '\\texttt{', close: '}' }),
	link: (a) => ({ open: `\\href{${String(a.href ?? '')}}{`, close: '}' }),
	textcolor: (a) => ({
		open: `\\textcolor${typeof a.model === 'string' && a.model ? `[${a.model}]` : ''}{${esc(String(a.color ?? 'black'))}}{`,
		close: '}'
	}),
	highlight: (a) => ({ open: `{\\sethlcolor{${esc(String(a.color ?? 'yellow'))}}\\hl{`, close: '}}' })
};

/** Wrap `result` in each mark's open/close pair, inner to outer. shared with non-text leaves
 * that carry marks (an unknown macro chip under \textbf has no text node to carry the bold). */
export function applyMarks(text: string, marks: readonly Mark[]): string {
	let result = text;
	for (const mark of marks) {
		// a bare \url{href} parses to a link whose text IS the href; if unedited, round-trip
		// \url back instead of widening to \href{href}{href} (a visible styling change under
		// most hyperref setups). compare against the esc()'d href: `result` is already
		// text-escaped, but \url's own argument must stay RAW.
		if (mark.type.name === 'link' && mark.attrs?.bare && result === esc(String(mark.attrs.href ?? ''), 'text')) {
			result = `\\url{${String(mark.attrs.href ?? '')}}`;
			continue;
		}
		const make = MARKS[mark.type.name];
		if (!make) continue;
		const { open, close } = make(mark.attrs ?? {});
		result = open + result + close;
	}
	return result;
}

/** The marks a node's own handler wraps around it (text, and leaf atoms borrowing a mark);
 * null for anything else, which renderChildren's run-merge leaves untouched. */
export function markableMarks(node: Node): readonly Mark[] | null {
	return node.isText || node.type.spec.leafText ? node.marks : null;
}

/** Order-sensitive on purpose: same set in a different order must NOT merge
 * (\textbf{\texttt{X}} vs \texttt{\textbf{X}} are different commands), so require exact match. */
export function marksKey(marks: readonly Mark[]): string {
	return marks.map((m) => `${m.type.name}:${JSON.stringify(m.attrs)}`).join('|');
}
