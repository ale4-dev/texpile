import { Plugin } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { tocStore, tocCaretStore, type TocItem } from './tocStore';
import { trailingDebounce } from '$lib/trailingDebounce';

function collectHeadings(doc: Node): TocItem[] {
	const items: TocItem[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			items.push({ level: Number(node.attrs.level ?? 1), text: node.textContent, pos });
		}
	});
	return items;
}

/** Keeps `tocStore` in sync with the document's headings (for the right-rail table of contents).
 * Display-only, so the full-doc walk runs debounced instead of per transaction. */
export function createTocPlugin() {
	const deferredCollect = trailingDebounce(300, (doc: Node) => (tocStore.current = collectHeadings(doc)));
	return new Plugin({
		state: {
			init(_, state) {
				tocStore.current = collectHeadings(state.doc);
				return null;
			},
			apply(tr) {
				if (tr.docChanged) deferredCollect(tr.doc);
				return null;
			}
		},
		view: (view) => {
			tocCaretStore.current = view.state.selection.head;
			return {
				update: (v) => {
					const head = v.state.selection.head;
					if (tocCaretStore.current !== head) tocCaretStore.current = head;
				},
				// a timer outliving this editor would overwrite the NEXT document's TOC
				destroy: () => {
					deferredCollect.cancel();
					tocCaretStore.current = null;
				}
			};
		}
	});
}
