// A bib field as the reader sees it: TeX accents decoded, protective braces gone, ties as
// spaces. Display only; the field itself keeps its bytes.
const COMBINING: Record<string, string> = {
	'"': '̈',
	"'": '́',
	'`': '̀',
	'^': '̂',
	'~': '̃',
	'=': '̄',
	'.': '̇',
	c: '̧',
	v: '̌',
	u: '̆',
	H: '̋',
	k: '̨',
	r: '̊',
	b: '̱',
	d: '̣'
};

const SYMBOLS: Record<string, string> = {
	ss: 'ß',
	o: 'ø',
	O: 'Ø',
	ae: 'æ',
	AE: 'Æ',
	oe: 'œ',
	OE: 'Œ',
	aa: 'å',
	AA: 'Å',
	l: 'ł',
	L: 'Ł',
	i: 'ı',
	j: 'ȷ',
	'&': '&',
	'%': '%',
	$: '$',
	'#': '#',
	_: '_',
	'{': '{',
	'}': '}'
};

/** the author part of a citation chip, the way author-year styles print it: Knuth; Lamport and
 * Müller; Smith et al. */
export function bibAuthorShort(raw: string | undefined | null): string {
	const names = bibDisplayText(raw)
		.split(/\s+and\s+/)
		.map((n) => n.trim())
		.filter(Boolean);
	if (names.length === 0) return '';
	const etAl = names.length > 2 || names[names.length - 1].toLowerCase() === 'others';
	if (etAl) return `${surname(names[0])} et al.`;
	return names.map(surname).join(' and ');
}

function surname(name: string): string {
	const comma = name.indexOf(',');
	if (comma > 0) return name.slice(0, comma).trim();
	const parts = name.split(/\s+/);
	return parts[parts.length - 1] ?? '';
}

export function bibDisplayText(raw: string | undefined | null): string {
	if (!raw) return '';
	let s = raw
		// \"{u}  \"u  \v{c}  \v c  (letter accents need a brace or a space before the letter)
		.replace(/\\(["'`^~=.])\{?([A-Za-z])\}?/g, (_, acc: string, ch: string) => ch + COMBINING[acc])
		.replace(/\\([cvuHkrbd])(?:\{([A-Za-z])\}|\s+([A-Za-z]))/g, (_, acc: string, a: string, b: string) => (a ?? b) + COMBINING[acc])
		// a letter macro eats the space after it (TeX does), a symbol one keeps it
		.replace(/\\([a-zA-Z]+)(?![A-Za-z])\s*/g, (m, name: string) => (name in SYMBOLS ? SYMBOLS[name] : m))
		.replace(/\\([&%$#_{}])/g, (_, ch: string) => ch)
		.replace(/[{}]/g, '')
		.replace(/~/g, ' ');
	s = s.normalize('NFC');
	return s.replace(/\s+/g, ' ').trim();
}
