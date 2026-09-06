// The visual doc on screen stays mounted while a re-parse of newer source runs (a source-mode edit,
// then back to visual). Node views settling on that mount dispatched a transaction, which
// serialized the OLD doc over the newer texSource and dropped the queued autosave of it.
import { describe, it, expect, vi } from 'vitest';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';

function parsedWith(text: string): ParsedLatexFile {
	return {
		doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
		preamble: '\\documentclass{article}\n\\begin{document}\n',
		postamble: '\\end{document}\n',
		hadDocumentEnv: true,
		warnings: []
	};
}

function makeBuffer() {
	const scheduleSave = vi.fn();
	const discardQueuedSave = vi.fn();
	const buffer = new DocumentBuffer({
		scheduleSave,
		discardQueuedSave,
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	return { buffer, scheduleSave, discardQueuedSave };
}

describe('DocumentBuffer.onVisualChange while a re-parse is in flight', () => {
	it('ignores transactions from the stale doc', () => {
		const { buffer, scheduleSave } = makeBuffer();
		const old = parsedWith('old');
		buffer.openTex('C:/ws/main.tex', 'ORIGINAL', '\n');
		buffer.adoptParsed(old, 'ORIGINAL');

		buffer.onTexInput('NEWER SOURCE'); // source mode edit, autosave queued for it
		scheduleSave.mockClear();
		buffer.visualStale = true; // the host started re-parsing NEWER SOURCE; `old` is still mounted

		buffer.onVisualChange(old.doc); // a node view settling on the stale mount
		expect(buffer.texSource).toBe('NEWER SOURCE');
		expect(scheduleSave).not.toHaveBeenCalled();
	});

	it('serializes again once the re-parse has been adopted', () => {
		const { buffer, scheduleSave } = makeBuffer();
		buffer.openTex('C:/ws/main.tex', 'ORIGINAL', '\n');
		buffer.adoptParsed(parsedWith('old'), 'ORIGINAL');
		buffer.onTexInput('NEWER SOURCE');
		buffer.visualStale = true;

		const fresh = parsedWith('newer');
		buffer.adoptParsed(fresh, 'NEWER SOURCE');
		expect(buffer.visualStale).toBe(false);
		scheduleSave.mockClear();
		buffer.onVisualChange(parsedWith('newer edited').doc);
		expect(buffer.texSource).toContain('newer edited');
		expect(scheduleSave).toHaveBeenCalledTimes(1);
	});
});
