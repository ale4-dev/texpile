// Does MathLive's re-emitted latex differ from the source only in ways TeX cannot see?
//
// MathLive parses and re-prints rather than preserving bytes, so `\mid \vecx` comes back as
// `\mid\vecx`. Writing that back rewrites a formula the user only clicked into.

// TeX absorbs the whitespace that terminates a control word, so it is not part of the output.
// `\ ` is a control SYMBOL (a real interword space) and never matches: the class needs a letter
const CONTROL_WORD_GAP = /(\\[a-zA-Z@]+)[ \t]+/g;

/** true when the two spellings typeset identically, so the source's is worth keeping */
export function mathLatexEquivalent(a: string, b: string): boolean {
	return a === b || a.replace(CONTROL_WORD_GAP, '$1') === b.replace(CONTROL_WORD_GAP, '$1');
}
