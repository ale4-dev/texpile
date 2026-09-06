// display math environments to block_math nodes, labels and line labels included
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { getTextContent } from '../ast-utils';
import { buildNode, textNode, type PmNode } from '../builders';
import { mathBodyRawSource } from './origCapture';

export function createBlockMath(env: Environment, starred: boolean, environment?: string): PmNode[] {
	// one slot per row (rows split at \\), so a label on the second row stays on the second row
	// when the serializer puts them back; the old positional list slid every label up past an
	// unlabelled row, and \ref then pointed at the wrong equation
	const lineLabels: string[] = [];
	const contentWithoutLabel: Node[] = [];
	let row = 0;
	let anyLabel = false;

	for (const node of env.content) {
		if (node.type === 'macro' && node.content === 'label') {
			const mandatoryArgs = (node as Macro).args?.filter((arg) => arg.openMark === '{') || [];
			const labelText = mandatoryArgs[0] ? getTextContent(mandatoryArgs[0].content) : '';
			if (labelText) {
				while (lineLabels.length <= row) lineLabels.push('');
				lineLabels[row] = labelText;
				anyLabel = true;
			}
		} else {
			// unified-latex gives the row break a content of '\\' OR the whitespace it swallowed
			if (node.type === 'macro' && (node.content === '\\' || /^\s+$/.test(String(node.content)))) row++;
			contentWithoutLabel.push(node);
		}
	}

	// slice the exact source only when NO labels were extracted (the label text would remain in
	// the slice and the serializer would re-add it, duplicating). printRaw is the fallback; the
	// regex strip below keeps both paths label-free.
	let mathContent =
		(!anyLabel ? mathBodyRawSource(env, [`\\begin{${env.env}}`], [`\\end{${env.env}}`]) : null) ?? printRaw(contentWithoutLabel);

	// safety net for labels the tokenizer left embedded in string content, where no AST exists
	const labelRegex = /\\label\s*\{([^}]+)\}/g;
	let match: RegExpExecArray | null;
	while ((match = labelRegex.exec(mathContent)) !== null) {
		if (!lineLabels.includes(match[1])) {
			lineLabels.push(match[1]);
		}
	}
	mathContent = mathContent.replace(/\\label\s*\{[^}]+\}/g, '');

	// the editor expects these environments wrapped in the content string
	const MULTILINE_ENVS = [
		'align',
		'align*',
		'gather',
		'gather*',
		'alignat',
		'alignat*',
		'flalign',
		'flalign*',
		'eqnarray',
		'eqnarray*',
		'multline',
		'multline*'
	];
	if (MULTILINE_ENVS.includes(env.env)) {
		mathContent = `\\begin{${env.env}}${mathContent}\\end{${env.env}}`;
	}

	// first label becomes the main label, rest stay in lineLabels
	const label = lineLabels.find((l) => l) ?? null;

	return [
		buildNode(
			'block_math',
			{ label, numbered: !starred, environment: environment || null, lineLabels, starredEnv: env.env === 'equation*' },
			[textNode(String(mathContent || '').trim())]
		)
	];
}

/** Horizontal-rule macros captured verbatim so borders round-trip exactly. */
