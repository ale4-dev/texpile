// keeps a math node's `typst` attr current with its LaTeX at edit time, while MathLive (which
// made the edit) is certainly loaded. the save then re-emits the attr and never has to convert;
// without this an edited equation reverted to its original source whenever MathLive was absent
import { Plugin, type Transaction } from 'prosemirror-state';
import { latexToTypst } from './latexToTypst';

const MATH = new Set(['inline_math', 'block_math']);

/** the ranges the transactions changed, in the final doc's coordinates */
function changedRanges(trs: readonly Transaction[]): [number, number][] {
	const ranges: [number, number][] = [];
	for (const tr of trs) {
		if (!tr.docChanged) continue;
		for (const r of ranges) {
			r[0] = tr.mapping.map(r[0], -1);
			r[1] = tr.mapping.map(r[1], 1);
		}
		tr.mapping.maps.forEach((map, i) => {
			const rest = tr.mapping.slice(i + 1);
			map.forEach((_from, _to, newFrom, newTo) => ranges.push([rest.map(newFrom, -1), rest.map(newTo, 1)]));
		});
	}
	return ranges;
}

export const typstMathSyncPlugin = new Plugin({
	appendTransaction(trs, _old, state) {
		let tr: Transaction | null = null;
		for (const [from, to] of changedRanges(trs)) {
			state.doc.nodesBetween(from, to, (node, pos) => {
				if (!MATH.has(node.type.name)) return true;
				const latex = node.textContent;
				if (latex === node.attrs.latexOrig) return false;
				const typst = latexToTypst(latex);
				if (typst != null) (tr ??= state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, typst, latexOrig: latex });
				return false;
			});
		}
		return tr;
	}
});
