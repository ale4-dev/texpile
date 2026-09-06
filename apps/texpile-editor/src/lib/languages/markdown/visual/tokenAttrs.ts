// token attribute readers and the image-token builders
import type { Token } from 'markdown-it';
import { buildNode, textNodes, type PmNode } from './builders';
import { formatImage } from './inlineSyntax';

export function attrStr(tok: Token, name: string): string {
	const v = tok.attrGet(name);
	return v == null ? '' : String(v);
}

/**
 * A link/image destination as the AUTHOR wrote it.
 *
 * markdown-it percent-encodes every destination it parses (normalizeLink), which is right for a
 * renderer emitting `<img src>` and wrong for us twice over: the src is a path we look up ON DISK,
 * so `images/图片.png` arriving as `images/%E5%9B%BE%E7%89%87.png` finds no file and the image
 * never loads; and it is a value we write BACK to the .md, so editing the block around it rewrote
 * the author's filename into escapes.
 *
 * decodeURI, not decodeURIComponent: it leaves the reserved set (`?#&=+`) alone, so a query string
 * or a `#gh-dark-mode-only` fragment survives intact - the same characters mdurl excludes from the
 * encode this undoes. A destination holding a literal `%` (`100%.png`) is not valid escaping and
 * throws; that one was never encoded, so the raw string is already what the author wrote.
 */
export function dest(tok: Token, name: string): string {
	const raw = attrStr(tok, name);
	try {
		return decodeURI(raw);
	} catch {
		return raw;
	}
}

/** the alt text as the reader sees it: `content` is the raw label, escapes and all */
export function altText(tok: Token): string {
	let out = '';
	for (const c of tok.children ?? []) {
		if (c.type === 'image') out += altText(c);
		else if (c.type === 'math_inline') out += `$${c.content}$`;
		else if (c.type === 'softbreak' || c.type === 'hardbreak') out += ' ';
		else if (c.content) out += c.content;
	}
	return out;
}

/** reconstruct the literal markdown of an image token, for the mixed-content inline chip. */
export function imageMarkdown(tok: Token): string {
	return formatImage(altText(tok), dest(tok, 'src'), attrStr(tok, 'title'));
}

/** `![alt](src "title")` alone in a paragraph: a block figure. title becomes the caption. */
export function imageBlock(tok: Token): PmNode {
	const title = attrStr(tok, 'title');
	return buildNode(
		'image',
		{
			src: dest(tok, 'src'),
			alt: altText(tok) || null,
			numbered: false,
			showCaption: !!title
		},
		title ? textNodes(title) : null
	);
}
