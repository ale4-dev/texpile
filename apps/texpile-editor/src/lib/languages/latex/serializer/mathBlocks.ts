// display-math assembly: equation/align environments and their label plumbing

const DISPLAY_ENVIRONMENTS = [
	'align',
	'align*',
	'alignat',
	'alignat*',
	'equation',
	'equation*',
	'gather',
	'gather*',
	'multline',
	'multline*',
	'flalign',
	'flalign*',
	'eqnarray',
	'eqnarray*'
];

export function hasDisplayEnvironment(content: string): boolean {
	const t = content.trim();
	return DISPLAY_ENVIRONMENTS.some((env) => t.startsWith(`\\begin{${env}}`));
}

export function blockMath(content: string, opts: { numbered: boolean; label?: string; starredEnv?: boolean }): string {
	const processed = content.trim();
	if (hasDisplayEnvironment(processed)) return processed + '\n';
	if (opts.numbered && opts.label) return `\\begin{equation}\\label{${opts.label}}\n${processed}\n\\end{equation}\n`;
	if (opts.numbered) return `\\begin{equation}\n${processed}\n\\end{equation}\n`;
	if (opts.starredEnv) return `\\begin{equation*}\n${processed}\n\\end{equation*}\n`;
	return `\\[\n${processed}\n\\]\n`;
}

function extractEnvironmentContent(latex: string, envName: string): string | null {
	const pattern = new RegExp(`\\\\begin\\{${envName}\\*?\\}([\\s\\S]*)\\\\end\\{${envName}\\*?\\}`, 'i');
	const m = latex.match(pattern);
	return m ? m[1].trim() : null;
}

export function alignEnvironment(
	content: string,
	opts: { environment: string; lineLabels: string[]; label?: string; numbered: boolean }
): string {
	const envName = opts.numbered ? opts.environment : `${opts.environment}*`;
	let inner = extractEnvironmentContent(content, opts.environment);
	if (inner === null) inner = content.trim();
	const lines = inner.split(/\\\\(?:\s*\[.*?\])?/);
	// a trailing \\ on the last row leaves one final EMPTY split segment. left in, the re-join
	// adds a stray separator and the template's own \n compounds into a blank line inside math
	// mode, which is illegal ("Paragraph ended before \align* was complete"). drop it; the join
	// places separators only between real rows, the canonical trailing-\\-free form.
	if (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
	const processed = lines.map((line, i) => {
		const t = line.trim();
		const lbl = opts.lineLabels[i] || '';
		return lbl && opts.numbered ? `${t} \\label{${lbl}}` : t;
	});
	let joined = processed.join(' \\\\\n');
	if (opts.label && opts.numbered && opts.environment === 'multline') {
		joined = joined.replace(/\n$/, '') + ` \\label{${opts.label}}`;
	}
	return `\\begin{${envName}}\n${joined}\n\\end{${envName}}\n`;
}
