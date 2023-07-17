/**
 * switchStrings.js -- defines command line switch description
 *
 * @author akahuku@gmail.com
 */

export const switchStrings = [
	'SELECTION',
	['a', 'all', null,
		'do not ignore entries starting with .'],
	['A', 'almost-all', null,
		'do not list implied . and ..'],
	['d', 'directory', null,
		'list directories themselves, not their contents'],
	[null, 'hide', 'PATTERN',
		'do not list implied entries matching shell PATTERN ' +
		'(overridden by -a or -A)'],
	['I', 'ignore', 'PATTERN',
		'do not list implied entries matching shell PATTERN'],
	['B', 'ignore-backups', null,
		'do not list implied entries ending with ~'],
	[null, 'drop-types', 'TYPES',
		`Specify file types to be excluded from listing, separated by commas.  Available file types are:
  fifo
  chardev
  blockdev
  directory
  normal | regular
  symbolic_link | link
  sock
  whiteout
Bonus: each file type may be omitted up to one character if there is no ambiguity.`],
	[null, 'select-types', 'TYPES',
		'Specify file types to be listed, separated by commas.  File types are the same as for the drop-types switch'],
	['R', 'recursive', null,
		'list subdirectories recursively'],

	'SYMBOLIC LINKS',
	['L', 'dereference', null,
		'when showing file information for a symbolic link, show information ' +
		'for the file the link references rather than for the link itself'],
	['H', 'dereference-command-line', null,
		'follow symbolic links listed on the command line'],
	[null, 'dereference-command-line-symlink-to-dir', null,
		'follow each command line symbolic link that points to a directory'],

	'LAYOUT FORMATS',
	['1', null, null,
		`list one file per line.  Avoid \\n with -q or -b`],
	['C', null, null,
		'list entries by columns'],
	['m', null, null,
		'fill width with a comma separated list of entries'],
	['l', null, null,
		'use a long listing format'],
	['g', null, null,
		'like -l, but do not list owner'],
	['n', 'numeric-uid-gid', null,
		'like -l, but list numeric user and group IDs'],
	['o', null, null,
		'like -l, but do not list group information'],
	['x', null, null,
		'list entries by lines instead of by columns'],
	[null, 'format', 'WORD',
		`Specify layout format directly:
  across | horizontal (-x)
  commas (-m)
  long | verbose (-l)
  single-column (-1)
  vertical (-C)`],

	'GENERAL OUTPUT FORMATTING',
	[null, 'author', null,
		'with -l, print the author of each file'],
	[null, 'block-size', 'SIZE',
		`with -l, scale sizes by SIZE when printing them; e.g., 'block-size=M'; see SIZE format below`],
	[null, 'color', '[<prefix>WHEN]',
		`colorize the output; WHEN can be:
  always (default if omitted)
  auto
  never
more info below`],
	[null, 'capability', null,
		`colorize files with capability information added; requires --color, and 'ca' element in LS_COLORS environment variable`],
	['Z', 'context', null,
		'not supported (print any security context of each file)'],
	['F', 'classify', null,
		'append indicator (one of */=>@|) to entries'],
	['D', 'dired', null,
		'not supported (generate output designed for Emacs\' dired mode)'],
	[null, 'file-type', null,
		`same as -F, except do not append '*'`],
	[null, 'full-time', null,
		'like -l --time-style=full-iso'],
	[null, 'group-directories-first', null,
		'group directories before files; can be augmented with a --sort option, but any use of --sort=none (-U) disables grouping'],
	[null, 'header', null,
		'with -l, print a header for each column description'],
	['h', 'human-readable', null,
		'with -l and -s, print sizes like 1K 234M 2G etc.'],
	[null, 'hyperlink', '[<prefix>WHEN]',
		`hyperlink file names; WHEN can be:
  always (default if omitted)
  auto
  never`],
	[null, 'indicator-style', 'WORD',
		`append indicator with style WORD to entry names:
  none (default)
  slash (-p)
  file-type (--file-type)
  classify (-F)`],
	['p', 'indicator-style=slash', null,
		'append slash (/) indicator to directories'],
	['i', 'inode', null,
		'print the index number of each file'],
	[null, 'invalidate-thumbnail-cache', null,
		'invalidate existing cache and re-generate thumbnails'],
	['k', 'kibibytes', null,
		'default to 1024-byte blocks for disk usage; used only with -s and per directory totals'],
	['G', 'no-group', null,
		`in a long listing, don't print group names`],
	['P', 'pager', 'PAGER',
		`set the pager to be used if the content exceeds the height of the terminal:
  $PAGER (refer to the PAGER environment variable)
  less
  more
  pg
  most
  none | off
default value is $PAGER, and then 'less'.
Note: with --thumbnail, lss's built-in pager is used.`],
	[null, 'si', null,
		'same as -h, but use powers of 1000 not 1024'],
	['s', 'size', null,
		'print the allocated size of each file, in blocks'],
	['T', 'tabsize', 'COLS',
		'assume tab stops at each COLS instead of 8'],
	['y', 'thumbnail', null,
		'with -l, -x or -C, add sixel thumbnails'],
	[null, 'no-thumbnail', null,
		'disable sixel thumbnails'],
	[null, 'time', 'WORD',
		`change the default of using modification times;
  atime | access | use: access time (-u)
  ctime | status: change time (-c)
  btime | birth | creation: birth time
with -l, WORD determines which time to show;
with --sort=time, sort by WORD (newest first)`],
	['w', 'width', 'COLS',
		'set output width to COLS.  0 means no limit'],
	[null, 'zero', null,
		'output NUL at the end of each line rather than a newline'],

	'TIME STAMP FORMATTING',
	[null, 'time-style', 'TIME_STYLE',
		'time/date format with -l; see TIME_STYLE below'],

	'FILE NAME FORMATTING',
	['b', 'escape', null,
		'print C-style escapes for nongraphic characters'],
	['N', 'literal', null,
		'print entry names without quoting'],
	['Q', 'quote-name', null,
		'enclose entry names in double quotes'],
	[null, 'quoting-style', 'WORD',
		`use quoting style WORD for entry names:
  literal
  locale
  shell
  shell-always
  shell-escape
  shell-escape-always
  c
  escape
(overrides QUOTING_STYLE environment variable)`],
	['q', 'hide-control-chars', null,
		'print ? instead of nongraphic characters'],
	[null, 'show-control-chars', null,
		`show nongraphic characters as-is (the default, unless program is 'lss' and output is a terminal)`],

	'SORT CONTROL',
	[null, 'sort', 'WORD',
		`sort by WORD instead of name:
  none (-U)
  size (-S)
  time (-t)
  version (-v)
  extension (-X)`],
	['U', null, null,
		'do not sort; list entries in directory order'],
	['X', null, null,
		'sort alphabetically by entry extension'],
	['S', null, null,
		'sort by file size, largest first'],
	['t', null, null,
		'sort by time, newest first; see --time'],
	['v', null, null,
		'natural sort of (version) numbers within text'],
	['f', null, null,
		'do not sort, enable -aU, disable -ls --color'],
	['r', 'reverse', null,
		'reverse order while sorting'],
	['u', null, null,
		`with -lt: sort by, and show, access time;
with -l: show access time and sort by name;
otherwise: sort by access time, newest first`],
	['c', null, null,
		`with -lt: sort by, and show, ctime (time of last modification of file status information);
  with -l: show ctime and sort by name;
  otherwise: sort by ctime, newest first`],
	[null, 'collation', 'METHOD',
		`collation method to be used when sorting by name or extension, valid value is one of:
  intl (default)
  codepoint
  byte`],

	'MISCELLANEOUS',
	[null, 'help', null,
		'display this help and exit'],
	[null, 'diag', null,
		'diagnose terminal capabilities and exit'],
	[null, 'thumbnail-cache-root', null,
		'display path to thumbnail cache root and exit'],
	[null, 'root', null,
		'display path to local repository of lss and exit'],
	[null, 'verbose', null,
		'turn on verbose mode'],
	[null, 'version', null,
		'output version information and exit']
];

export const header = `Usage: <self> [OPTION]... [FILE]...
List information about the FILEs (the current directory by default).
Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.

Mandatory arguments to long options are mandatory for short options too.

`;

export const footer = `
\x1b[1mSIZE\x1b[m
  The SIZE argument is an integer and optional unit (example: 10K is 10*1024).
Units are K,M,G,T,P,E,Z,Y (powers of 1024) or KB,MB,... (powers of 1000).
Binary prefixes can be used, too: KiB=K, MiB=M, and so on.

\x1b[1mTIME STYLE\x1b[m
  The TIME_STYLE argument can be full-iso, long-iso, iso, locale, or +FORMAT.  FORMAT is interpreted like in date(1).  If FORMAT is FORMAT1<newline>FORMAT2, then FORMAT1 applies to non-recent files and FORMAT2 to recent files.  TIME_STYLE prefixed with 'posix-' takes effect only outside the POSIX locale.  Also the TIME_STYLE environment variable sets the default style to use.

\x1b[1mCOLOR\x1b[m
  Using color to distinguish file types is disabled both by default and with --color=never.  With --color=auto, lss emits color codes only when standard output is connected to a terminal.  The LS_COLORS environment variable can change the settings.  Use the dircolors command to set it.

\x1b[1mEXIT STATUS\x1b[m
 0  if OK,
 1  if minor problems (e.g., cannot access subdirectory),
 2  if serious trouble (e.g., cannot access command-line argument).

  The lss is an unofficial port of <a href="https://www.gnu.org/software/coreutils/ls">ls</a> included in <a href="https://www.gnu.org/software/coreutils/">GNU coreutils</a>.`;

