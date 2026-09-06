// `[label]: url` lines as block tokens. markdown-it reads them into env.references and then
// drops the token, so the lines belonged to no block and went with a neighbour's regeneration
import type { MarkdownIt, StateBlock } from 'markdown-it';

type BlockRule = (state: StateBlock, startLine: number, endLine: number, silent: boolean) => boolean;
type NamedRules = { __rules__: { name: string; fn: BlockRule }[] };

export function referenceDefinitionPlugin(md: MarkdownIt): void {
	const parse = (md.block.ruler as unknown as NamedRules).__rules__.find((r) => r.name === 'reference')?.fn;
	if (!parse) return;
	md.block.ruler.at('reference', (state, startLine, endLine, silent) => {
		const before = state.tokens.length;
		if (!parse(state, startLine, endLine, silent)) return false;
		if (silent) return true;
		const token = state.tokens.length > before ? state.tokens[state.tokens.length - 1] : state.push('reference_definition', '', 0);
		token.map = [startLine, state.line];
		token.content = state.getLines(startLine, state.line, state.blkIndent, false);
		return true;
	});
	md.core.ruler.disable('strip_references', true);
}
