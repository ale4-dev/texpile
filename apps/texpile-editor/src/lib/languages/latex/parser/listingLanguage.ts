// The language a LaTeX listing declares, and where it can be written back.
//
// The visual editor's code blocks carry a `lang` attr that drives syntax highlighting. For markdown
// and typst that attr IS the source (the fence info string), so it round-trips for free. LaTeX
// keeps the language in the environment's options instead, and the importer used to hardcode
// `text` - so a listing that plainly said `[language=Python]` opened as unhighlighted plain text,
// and picking a language from the block's own dropdown was forgotten on the next reload.
//
// listings and minted spell language names the way @codemirror/language-data does (Python, Java,
// C++), so a name read out of the source can go straight to the picker, and vice versa.

/** the language declared by `\begin{lstlisting}[language=X]` or `\begin{minted}{x}`, else null */
export function listingLanguage(env: string, args: string): string | null {
	if (!args) return null;
	// minted's language is its mandatory final argument: \begin{minted}[opts]{python}
	if (/^minted$/i.test(env)) return args.match(/\{([^{}]+)\}\s*$/)?.[1]?.trim() || null;
	// listings' is a key in the optional argument. The value may be braced, and may carry a dialect
	// in brackets first (language=[LaTeX]TeX), which names a variant of the same language.
	return args.match(/\blanguage\s*=\s*\{?\s*(?:\[[^\]]*\])?\s*([^,\]}\s]+)/i)?.[1] ?? null;
}

/**
 * Can this environment's source record a language at all?
 *
 * `verbatim` cannot: it has no options, and rewriting it as lstlisting to make room would quietly
 * require \usepackage{listings} in a preamble the editor is in no position to vouch for. Blocks
 * that answer false get a label instead of a picker, because offering a choice that cannot be saved
 * is how the dropdown got useless in the first place.
 */
export function canSetListingLanguage(env: string): boolean {
	// lstlisting/minted imply their own package is already loaded, so adding the option is safe
	return /^(fence|minted|lstlisting|lstinputlisting)$/i.test(env);
}

/**
 * Languages the stock listings package ships definitions for.
 *
 * This is what the picker may offer a lstlisting block. Offering more is not cosmetic: listings
 * aborts the compile on a language it has no definition for, and the CodeMirror catalog is full of
 * them - there is no JavaScript, TypeScript, or Rust in stock listings. The names are listings'
 * own spellings, which match @codemirror/language-data where the two overlap, so highlighting
 * works for the common entries and the rest still compile.
 */
export const LISTINGS_LANGUAGES = [
	'ABAP',
	'ACSL',
	'Ada',
	'Algol',
	'Ant',
	'Assembler',
	'Awk',
	'bash',
	'Basic',
	'C',
	'C++',
	'Caml',
	'CIL',
	'Clean',
	'Cobol',
	'Comsol',
	'csh',
	'Delphi',
	'Eiffel',
	'Elan',
	'Erlang',
	'Euphoria',
	'Fortran',
	'GAP',
	'GCL',
	'Gnuplot',
	'Go',
	'Haskell',
	'HTML',
	'IDL',
	'inform',
	'Java',
	'JVMIS',
	'ksh',
	'Lingo',
	'Lisp',
	'LLVM',
	'Logo',
	'Lua',
	'make',
	'Mathematica',
	'Matlab',
	'Mercury',
	'MetaPost',
	'Miranda',
	'Mizar',
	'ML',
	'Modula-2',
	'MuPAD',
	'NASTRAN',
	'Oberon-2',
	'OCL',
	'Octave',
	'Oz',
	'Pascal',
	'Perl',
	'PHP',
	'PL/I',
	'Plasm',
	'PostScript',
	'POV',
	'Prolog',
	'Promela',
	'PSTricks',
	'Python',
	'R',
	'Reduce',
	'Rexx',
	'RSL',
	'Ruby',
	'S',
	'SAS',
	'Scala',
	'Scilab',
	'sh',
	'SHELXL',
	'Simula',
	'SPARQL',
	'SQL',
	'Swift',
	'tcl',
	'TeX',
	'VBScript',
	'Verilog',
	'VHDL',
	'VRML',
	'XML',
	'XSLT'
];

/** the environment's args with `lang` recorded in them, preserving every other option */
export function argsWithLanguage(env: string, args: string, lang: string): string {
	// markdown/typst info string: the language is its first word, anything after it stays
	if (/^fence$/i.test(env)) return args.trim() ? args.trim().replace(/^\S+/, lang.toLowerCase()) : lang.toLowerCase();
	if (/^minted$/i.test(env)) {
		const opts = args.match(/^\s*(\[[^\]]*\])/)?.[1] ?? '';
		return `${opts}{${lang.toLowerCase()}}`;
	}
	// listings: replace the existing key in place so surrounding options (caption, label, frame,
	// numbers) survive; add one only when there was none
	const key = /\blanguage\s*=\s*\{?\s*(?:\[[^\]]*\])?\s*[^,\]}\s]+\s*\}?/i;
	if (key.test(args)) return args.replace(key, `language=${lang}`);
	const inner = args.match(/^\s*\[(.*)\]\s*$/s)?.[1];
	if (inner !== undefined) return `[language=${lang}${inner.trim() ? `, ${inner.trim()}` : ''}]`;
	return `[language=${lang}]${args}`;
}
