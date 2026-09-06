// memoized preamble scan: user-defined commands and packages the body conversion consults
import type { Node, Root } from '@unified-latex/unified-latex-types';
import type { ParseOptions } from '../types';
import { heuristicMarkTexPrimitiveDefs, envPairsFromNewcommands } from '../heuristics';
import { parseLatex } from '../parser';
import { listNewcommands } from '@unified-latex/unified-latex-util-macros';

type PreambleScan = {
	key: string;
	delimPairs: Map<string, string>;
	newcommands: ReturnType<typeof listNewcommands>;
};
let preambleScanMemo: PreambleScan | null = null;

export function scanPreambleText(preamble: string, parseOptions: ParseOptions): PreambleScan {
	if (preambleScanMemo && preambleScanMemo.key === preamble) return preambleScanMemo;
	const scan: PreambleScan = { key: preamble, delimPairs: new Map(), newcommands: [] };
	// the substring probes are just a cheap trigger for the parse; extraction is AST-based
	// either way. (\edef doesn't contain "\def", hence all four.)
	const wantsDefs = ['\\def', '\\edef', '\\gdef', '\\xdef'].some((t) => preamble.includes(t));
	const wantsNewcommands = /\\(?:new|renew|provide)command|\\(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand/.test(preamble);
	if (wantsDefs || wantsNewcommands) {
		let preAst: Root | null = null;
		try {
			preAst = parseLatex(preamble, parseOptions);
		} catch {
			/* a malformed preamble must not break body parsing */
		}
		if (preAst) {
			// listNewcommands first: heuristicMarkTexPrimitiveDefs splices the tree in place, and
			// listNewcommands must see the same unmutated tree its own parse used to give it
			if (wantsNewcommands) {
				try {
					scan.newcommands = listNewcommands(preAst);
					// an env shortcut defined with newcommand rather than def; the span between the pair is
					// math either way, and reading it as prose text-escapes the maths
					envPairsFromNewcommands(scan.newcommands, scan.delimPairs);
				} catch {
					/* ditto */
				}
			}
			if (wantsDefs) {
				try {
					heuristicMarkTexPrimitiveDefs(preAst.content as Node[], preamble, scan.delimPairs);
				} catch {
					/* ditto */
				}
			}
		}
	}
	preambleScanMemo = scan;
	return scan;
}

/**
 * Convert a LaTeX string to a ProseMirror doc, extracting the document environment's content
 * when present. options.preamble feeds the \newcommand / \def scans below.
 */
