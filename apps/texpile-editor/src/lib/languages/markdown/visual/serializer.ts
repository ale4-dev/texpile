// Deterministic ProseMirror -> Markdown serializer: the latexSerializer's sibling dialect.
// String-returning handlers per node type over the shared Ctx contract; doc assembly (verbatim
// orig substitution + per-block memo) delegated to blockAssembly. prosemirror-markdown's
// serializer can't drive prosemirror-flat-list (it walks nested list NODES; flat-list is one
// node per item), so list/emphasis logic lives here; escaping follows prosemirror-markdown's
// rules. Convention: every block handler ends with its own separation ('\n\n', lists '\n'
// mid-run), so plain concatenation of parts is a valid document.
import type { Node, Mark } from 'prosemirror-model';
import { createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { Ctx } from '$lib/serializer/types';
import { escMd, codeSpan, formatLinkDest, formatLinkTitle, formatImage } from './inlineSyntax';
import { listFamily, listMarker, sameList } from './listAttrs';

type MarkDelims = {
	open: string;
	close: string;
	/** emphasis family: delimiters can't touch whitespace, boundary ws moves outside. */
	expel?: boolean;
};

function markDelims(mark: Mark, inTableCell: boolean): MarkDelims | null {
	const a = mark.attrs;
	switch (mark.type.name) {
		case 'link': {
			const title = formatLinkTitle(a.title == null ? '' : String(a.title), inTableCell);
			return { open: '[', close: `](${formatLinkDest(String(a.href ?? ''), inTableCell)}${title})` };
		}
		case 'strong':
			return { open: '**', close: '**', expel: true };
		case 'em':
			return { open: '*', close: '*', expel: true };
		case 's':
			return { open: '~~', close: '~~', expel: true };
		case 'u':
			return { open: '<u>', close: '</u>' };
		case 'sup':
			return { open: '<sup>', close: '</sup>' };
		case 'sub':
			return { open: '<sub>', close: '</sub>' };
		case 'textcolor':
			return { open: `<span style="color: ${String(a.color ?? 'black')}">`, close: '</span>' };
		case 'highlight':
			return { open: '<mark>', close: '</mark>' };
		default:
			return null;
	}
}

// canonical nesting order (outermost first); code is innermost and handled inside run content
const MARK_ORDER = ['link', 'strong', 'em', 's', 'u', 'sup', 'sub', 'textcolor', 'highlight'];

function orderedMarks(marks: readonly Mark[]): Mark[] {
	return marks
		.filter((m) => m.type.name !== 'code')
		.sort((a, b) => {
			const ia = MARK_ORDER.indexOf(a.type.name);
			const ib = MARK_ORDER.indexOf(b.type.name);
			return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
		});
}

/** marks already open stay open while the next run still carries them (`*em **both** em*`) */
function alignMarks(active: Mark[], marks: Mark[]): Mark[] {
	const kept: Mark[] = [];
	for (const m of active) {
		if (!marks.some((x) => x.eq(m))) break;
		kept.push(m);
	}
	return [...kept, ...marks.filter((m) => !kept.some((k) => k.eq(m)))];
}

type InlineRun = {
	content: string;
	marks: Mark[];
	/** plain prose (whitespace and punctuation expelling applies); false for chips and breaks */
	isText: boolean;
};

type InlineOptions = {
	/** the first run may start a source line: block markers get escaped, indentation dropped */
	startOfLine?: boolean;
	inTableCell?: boolean;
	/** headings and titles cannot hold a line break; one becomes a space */
	singleLine?: boolean;
};

const HARD_BREAK = '\\\n';

function cellSafe(s: string): string {
	return s.replace(/\n/g, ' ').replace(/\|/g, '\\|');
}

/** a bare autolink whose visible text IS the href, with no title to carry, renders as <href> */
function bareLinkRun(node: Node): string | null {
	const link = node.marks.find((m) => m.type.name === 'link');
	if (!link?.attrs?.bare || link.attrs.title) return null;
	const href = String(link.attrs.href ?? '');
	return node.isText && node.text === href && !/[\s<>]/.test(href) ? `<${href}>` : null;
}

function inlineMath(node: Node, inTableCell: boolean): string {
	// edge whitespace and a bare `$` inside would both stop the parser reading it back as math
	const tex = node.textContent
		.trim()
		.replace(/\n{2,}/g, '\n')
		.replace(/(^|[^\\])\$/g, '$1\\$');
	if (!tex) return '';
	return inTableCell ? cellSafe(`$${tex}$`) : `$${tex}$`;
}

function imageMarkdown(node: Node, inTableCell = false): string {
	// the caption text is the title; a hidden caption still keeps it in the file
	const caption = renderInline(node, { singleLine: true, inTableCell }).trim();
	return formatImage(String(node.attrs.alt ?? ''), String(node.attrs.src ?? ''), caption, inTableCell);
}

function buildRuns(parent: Node, opts: InlineOptions): InlineRun[] {
	const inTableCell = opts.inTableCell ?? false;
	const singleLine = opts.singleLine ?? false;
	const runs: InlineRun[] = [];
	let atLineStart = opts.startOfLine ?? false;
	parent.forEach((node) => {
		if (node.isText) {
			const text = node.text ?? '';
			const bare = bareLinkRun(node);
			if (bare != null) {
				runs.push({ content: bare, marks: [], isText: false });
			} else if (node.marks.some((m) => m.type.name === 'code')) {
				runs.push({ content: codeSpan(text, inTableCell), marks: orderedMarks(node.marks), isText: false });
			} else {
				runs.push({ content: escMd(text, atLineStart, inTableCell), marks: orderedMarks(node.marks), isText: true });
			}
			atLineStart = false;
			return;
		}
		switch (node.type.name) {
			case 'hard_break':
				if (node.attrs?.lineBreak === false) return; // legacy no-op break
				runs.push({ content: singleLine ? ' ' : inTableCell ? '<br>' : HARD_BREAK, marks: [], isText: false });
				atLineStart = !singleLine && !inTableCell;
				return;
			case 'inline_math':
				runs.push({ content: inlineMath(node, inTableCell), marks: orderedMarks(node.marks), isText: false });
				break;
			case 'inline_latex':
				runs.push({ content: inTableCell ? cellSafe(node.textContent) : node.textContent, marks: orderedMarks(node.marks), isText: false });
				break;
			case 'citation':
				// pandoc-style passthrough; only reachable by pasting from a .tex doc
				runs.push({ content: node.textContent ? `[@${node.textContent}]` : '', marks: [], isText: false });
				break;
			case 'ref':
				runs.push({ content: node.textContent, marks: [], isText: false });
				break;
			case 'image':
				runs.push({ content: imageMarkdown(node, inTableCell), marks: [], isText: false });
				break;
			default:
				runs.push({ content: node.isLeaf ? '' : renderInline(node, { inTableCell }), marks: orderedMarks(node.marks), isText: false });
		}
		atLineStart = false;
	});
	const kept = runs.filter((r) => r.content !== '').map((r) => (singleLine ? { ...r, content: r.content.replace(/\n/g, ' ') } : r));
	// a break with nothing after it is not one the parser would keep
	while (kept.length > 0 && kept[kept.length - 1].content === HARD_BREAK) kept.pop();
	return kept;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const PUNCT_TAIL = /(?:\\?[\p{P}\p{S}])+$/u;
const PUNCT_HEAD = /^(?:\\?[\p{P}\p{S}])+/u;

/** minimal open/close mark transitions over same-mark runs. emphasis delimiters may not touch
 *  whitespace, nor sit between punctuation and a letter (CommonMark's flanking rule), so
 *  boundary whitespace and punctuation move outside them. */
export function renderInline(parent: Node, opts: InlineOptions = {}): string {
	const inTableCell = opts.inTableCell ?? false;
	const runs = buildRuns(parent, opts);
	let out = '';
	let active: Mark[] = [];
	// where the last run's content starts in `out` when it was prose, else -1
	let textStart = -1;

	function expels(marks: Mark[]): boolean {
		return marks.some((m) => markDelims(m, inTableCell)?.expel);
	}

	function emitCloses(closing: Mark[], next: string) {
		let stolen = '';
		if (expels(closing)) {
			const ws = out.match(/\s+$/);
			if (ws && ws[0].length < out.length) {
				out = out.slice(0, -ws[0].length);
				stolen = ws[0];
			} else if (textStart >= 0 && WORD_CHAR.test(next.charAt(0))) {
				const tail = out.slice(textStart).match(PUNCT_TAIL);
				if (tail && tail[0].length < out.length - textStart) {
					out = out.slice(0, -tail[0].length);
					stolen = tail[0];
				}
			}
		}
		for (const m of closing) {
			const d = markDelims(m, inTableCell);
			if (d) out += d.close;
		}
		out += stolen;
	}

	for (const run of runs) {
		const marks = alignMarks(active, run.marks);
		let keep = 0;
		while (keep < active.length && keep < marks.length && active[keep].eq(marks[keep])) keep++;
		emitCloses(active.slice(keep).reverse(), run.content);
		const opening = marks.slice(keep);
		let content = run.content;
		if (run.isText && expels(opening)) {
			const lead = content.match(/^\s+/);
			if (lead && lead[0].length < content.length) {
				out += lead[0];
				content = content.slice(lead[0].length);
			} else if (WORD_CHAR.test(out.charAt(out.length - 1))) {
				const head = content.match(PUNCT_HEAD);
				if (head && head[0].length < content.length) {
					out += head[0];
					content = content.slice(head[0].length);
				}
			}
		}
		for (const m of opening) {
			const d = markDelims(m, inTableCell);
			if (d) out += d.open;
		}
		textStart = run.isText ? out.length : -1;
		out += content;
		active = marks;
	}
	emitCloses([...active].reverse(), '');
	return out;
}

function indentAfterFirstLine(text: string, indent: string): string {
	return text
		.split('\n')
		.map((l, i) => (i === 0 || l === '' ? l : indent + l))
		.join('\n');
}

function nextSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index < ctx.parent.childCount - 1 ? ctx.parent.child(ctx.index + 1) : null;
}

/** children serialized and concatenated (handlers carry their own separators), tail trimmed. */
function renderBlocks(parent: Node, inTableCell = false): string {
	let out = '';
	parent.forEach((child, _offset, i) => {
		out += serializeMdNode(child, { parent, index: i, isLastChild: i === parent.childCount - 1, inTableCell });
	});
	return out.replace(/\n+$/, '');
}

function isEmptyParagraph(node: Node): boolean {
	if (node.type.name !== 'paragraph') return false;
	let empty = true;
	node.forEach((c) => {
		if (c.isText) {
			if (c.marks.some((m) => m.type.name === 'code') ? c.text : c.text?.trim()) empty = false;
		} else if (c.type.name !== 'hard_break') empty = false;
	});
	return empty;
}

function tableRows(node: Node): { header: string[] | null; body: string[][]; cols: number } {
	const rows: { cells: string[]; isHeader: boolean }[] = [];
	node.forEach((row) => {
		if (row.type.name !== 'table_row') return;
		const cells: string[] = [];
		let isHeader = row.childCount > 0;
		row.forEach((cell) => {
			if (cell.type.name !== 'table_header') isHeader = false;
			const parts: string[] = [];
			cell.forEach((p) => parts.push(renderInline(p, { inTableCell: true })));
			cells.push(parts.join(' ').trim());
			// a colspan'd cell still occupies its extra columns in the pipe grid
			for (let s = 1; s < Number(cell.attrs.colspan ?? 1); s++) cells.push('');
		});
		rows.push({ cells, isHeader });
	});
	const cols = Math.max(1, ...rows.map((r) => r.cells.length));
	const header = rows.length > 0 && rows[0].isHeader ? rows[0].cells : null;
	const body = (header ? rows.slice(1) : rows).map((r) => r.cells);
	return { header, body, cols };
}

function pipeTable(node: Node): string {
	const { header, body, cols } = tableRows(node);
	function pad(cells: string[]) {
		const c = [...cells];
		while (c.length < cols) c.push('');
		return `| ${c.join(' | ')} |`;
	}
	// alignment survives in colspec (parse-time delimiter row); default plain dashes
	const spec = typeof node.attrs.colspec === 'string' && node.attrs.colspec ? node.attrs.colspec.split('|') : [];
	const delims: string[] = [];
	for (let i = 0; i < cols; i++) delims.push(spec[i] || '---');
	const lines = [pad(header ?? Array(cols).fill('')), `| ${delims.join(' | ')} |`, ...body.map(pad)];
	return lines.join('\n') + '\n\n';
}

const INTERRUPTS = new Set(['list', 'code_block', 'blockquote', 'heading', 'table', 'block_math']);

/** whether `next` may sit right under a paragraph line without becoming part of it */
function canInterrupt(next: Node): boolean {
	if (!INTERRUPTS.has(next.type.name)) return false;
	if (next.type.name !== 'list') return true;
	// an empty item or an ordered list not starting at 1 does not interrupt a paragraph
	return next.textContent.trim() !== '' && (listFamily(next) !== 'ordered' || Number(next.attrs.order ?? 1) === 1);
}

/** an item's blocks; in a tight list a sub-list sits right under the item text, since a blank
 *  line there would make the whole list loose */
function renderItemBody(item: Node): string {
	const loose = !!item.attrs.loose;
	let out = '';
	item.forEach((child, _offset, i) => {
		let part = serializeMdNode(child, { parent: item, index: i, isLastChild: i === item.childCount - 1, inTableCell: false });
		const next = i + 1 < item.childCount ? item.child(i + 1) : null;
		if (!loose && next && child.type.name === 'paragraph' && canInterrupt(next)) part = part.replace(/\n+$/, '\n');
		out += part;
	});
	return out.replace(/\n+$/, '');
}

/** the item's number: the run's start plus how many items of the same list precede it */
function itemNumber(node: Node, ctx: Ctx): number {
	let first = node;
	let distance = 0;
	if (ctx.parent) {
		for (let i = ctx.index - 1; i >= 0; i--) {
			const prev = ctx.parent.child(i);
			if (!sameList(prev, first)) break;
			first = prev;
			distance++;
		}
	}
	return Number(first.attrs.order ?? 1) + distance;
}

type NodeHandler = (node: Node, ctx: Ctx) => string;

const NODES: Record<string, NodeHandler> = {
	paragraph(node, ctx) {
		if (isEmptyParagraph(node)) return ''; // blank lines are semantic no-ops, as on the LaTeX side
		return renderInline(node, { startOfLine: true, inTableCell: ctx.inTableCell }) + '\n\n';
	},

	heading(node) {
		if (node.childCount === 0) return '';
		const level = Math.min(6, Math.max(1, Number(node.attrs.level ?? 1)));
		// a trailing `#` run after a space is a closing sequence to the parser
		const text = renderInline(node, { singleLine: true }).replace(/(^|\s)(#+)$/, '$1\\$2');
		return `${'#'.repeat(level)} ${text}\n\n`;
	},

	blockquote(node) {
		const inner = renderBlocks(node);
		return (
			inner
				.split('\n')
				.map((l) => (l ? '> ' + l : '>'))
				.join('\n') + '\n\n'
		);
	},

	horizontal_rule: () => '---\n\n',

	code_block(node) {
		const infoString = String(node.attrs.args ?? '')
			.trim()
			.replace(/\n/g, ' ');
		const content = node.textContent;
		// a backtick in the info string is only legal on a tilde fence
		const ch = infoString.includes('`') ? '~' : '`';
		const runs = content.match(ch === '~' ? /~{3,}/g : /`{3,}/g);
		const fence = ch.repeat(runs ? Math.max(3, ...runs.map((r) => r.length)) + 1 : 3);
		return `${fence}${infoString}\n${content}\n${fence}\n\n`;
	},

	// raw source blocks (html in a markdown doc, latex via cross-dialect paste): verbatim
	raw_latex: (node) => (node.textContent ? node.textContent + '\n\n' : ''),

	block_math(node) {
		// display math cannot span a blank line, in TeX or in the block rule
		const tex = node.textContent.trim().replace(/\n{2,}/g, '\n');
		return tex ? `$$\n${tex}\n$$\n\n` : '$$\n$$\n\n';
	},

	image: (node) => imageMarkdown(node) + '\n\n',

	includedoc: (node) => `\\${String(node.attrs.command ?? 'input')}{${String(node.attrs.path ?? '')}}\n\n`,

	abstract: (node) => renderBlocks(node) + '\n\n',
	environment: (node) => renderBlocks(node) + '\n\n',

	list(node, ctx) {
		const marker = listMarker(node);
		const head = listFamily(node) === 'ordered' ? `${itemNumber(node, ctx)}${marker} ` : `${marker} `;
		const box = node.attrs.kind === 'task' ? `[${node.attrs.checked ? 'x' : ' '}] ` : '';
		// continuation lines align under the content, after the marker
		const body = indentAfterFirstLine(renderItemBody(node), ' '.repeat(head.length));
		const next = nextSibling(ctx);
		const sep = next && sameList(node, next) ? (node.attrs.loose ? '\n\n' : '\n') : '\n\n';
		return (head + box + body).replace(/ +$/, '') + sep;
	},

	table: (node) => pipeTable(node),

	table_wrapper(node) {
		let table = '';
		let caption = '';
		let notes = '';
		node.forEach((child) => {
			if (child.type.name === 'table') table = pipeTable(child);
			else if (child.type.name === 'table_caption') caption = renderInline(child, { singleLine: true }).trim();
			else if (child.type.name === 'table_notes') notes = renderInline(child, { singleLine: true }).trim();
		});
		let out = table.replace(/\n+$/, '\n');
		if (caption) out += `\n*${caption}*\n`;
		if (notes && node.attrs.showNotes) out += `\n${notes}\n`;
		return out + '\n';
	}
};

/** Serialize one node to Markdown. Unknown types preserve their content rather than dropping it. */
export function serializeMdNode(node: Node, ctx: Ctx): string {
	const handler = NODES[node.type.name];
	if (handler) return handler(node, ctx);
	if (node.isText) return escMd(node.text ?? '');
	if (node.isInline) {
		// inline strays (should have come through renderInline) degrade to leafText/plain text
		const leafText = node.type.spec.leafText;
		return leafText ? leafText(node) : node.textContent;
	}
	const inner = renderBlocks(node, ctx.inTableCell);
	return inner ? inner + '\n\n' : '';
}

const assembly = createBlockAssembly((node, ctx) => serializeMdNode(node, ctx));

export function serializeToMarkdown(doc: Node): string {
	return assembly.serializeDocChildrenDetailed(doc).text;
}

export function serializeToMarkdownDetailed(doc: Node): DocSerializeResult {
	return assembly.serializeDocChildrenDetailed(doc);
}
