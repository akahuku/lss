/**
 * base.js -- mutual variables
 *
 * @author akahuku@gmail.com
 */

import {EventEmitter} from 'node:events';
import {URL} from 'node:url';
import path from 'node:path';
import bindings from 'bindings';

import {stdout} from './utils.js';
import {printf} from './format.js';

export const EXIT_CODE = {
	EXIT_SUCCESS: 0,
	LS_MINOR_PROBLEM: 1,
	LS_FAILURE: 2
};

export const __dirname = path.dirname(new URL('', import.meta.url).pathname);
export const self = process.argv0;

export function error (status, errorObj, format, ...args) {
	let message = `${self}: `;
	if (errorObj && !format) {
		message += errorObj.message;
	}
	else if (!errorObj && format) {
		message += printf(format, ...args);
	}
	else if (errorObj && format) {
		message += printf(format, ...args);

		// append detailed message, other than well-known errors
		if (/ENOENT/.test(errorObj.message)) {
			message += `: no such file or directory`;
		}
		else if (/EACCES/.test(errorObj.message)) {
			message += `: permission denied`;
		}
		else {
			message += ` (${errorObj.message})`;
		}
	}
	else {
		message += 'Some kind of error occurred.';
	}

	stdout(message + '\n');
	runtime.isVerbose && errorObj && console.dir(errorObj);
	status && process.exit(status);

	return message;
}

export const pref = {
	/*
	 * 'Z'     (horizontal column, -x)
	 * 'Z,'    (horizontal with commas, -m)
	 * '1'     (one file per line, -1)
	 * 'И'     (vertical column, -C)
	 * 'long'  (long format, -l)
	 * 'longt' (long format with thumbnail)
	 */

	format: 'И',

	/*
	 * When true, in a color listing, color each symlink name according to the
	 * type of file it points to.  Otherwise, color them according to the
	 * 'ln' directive in LS_COLORS.  Dangling (orphan) symlinks are treated
	 * specially, regardless.  This is set when 'ln=target' appears in
	 * LS_COLORS.
	 */

	colorSymlinkAsReferent: false,

	/*
	 * mtime (default, --time=mtime/modification)
	 * ctime (-c, --time=ctime/status)
	 * atime (-u, --time=atime/access/use)
	 * birthtime (--time=birth/creation)
	 */

	timeType: 'mtime',

	/*
	 * strftime formats for non-recent and recent files, respectively,
	 * in -l output.
	 */

	longTimeFormat: [
		// TBD: must be initialized with values according to locale
		'%b %e  %Y',
		'%b %e %H:%M'
	],

	/*
	 * The file characteristic to sort by.  Controlled by -t, -S, -U, -X, -v.
	 * The values of each item of this enum are important since they are
	 * used as indices in the sort functions array (see sort_files()).
	 *
	 * 'name' (default)
	 * 'extension' (-X)
	 * 'width'
	 * 'size' (-S)
	 * 'version' (-v)
	 * 'time' (-t; must be second to last)
	 * 'none' (-U; must be last)
	 */

	sortType: 'name',

	/*
	 * Direction of sort.
	 * false means highest first if numeric,
	 * lowest first if alphabetic;
	 * these are the defaults.
	 * true means the opposite order in each case.  -r
	 */

	sortReverse: false,

	/*
	 * Print flags
	 */

	printScontext: false,
	printOwner: true,
	printAuthor: false,
	printGroup: true,
	printIdsAsNumber: false,
	printInode: false,
	printDirName: true,
	printHyperlink: false,
	printCapability: false,
	printHeader: false,
	printThumbnail: false,

	/*
	 * True means mention the size in blocks of each file.  -s
	 */

	printBlockSize: false,

	/*
	 * Human-readable options for output, when printing block counts.
	 */

	humanOutputOpts: 0,

	/*
	 * The units to use when printing block counts.
	 */

	outputBlockSize: 0,

	/*
	 * Likewise, but for file sizes.
	 */

	fileHumanOutputOpts: 0,
	fileOutputBlockSize: 1,

	/*
	 * True means use colors to mark types.  Also define the different
	 * colors as well as the stuff for the LS_COLORS environment variable.
	 * The LS_COLORS variable is now in a termcap-like format.
	 */

	printWithColor: false,

	/*
	 * 'none' (default)
	 * 'slash' (-p,--indicator-style=slash)
	 * 'file_type' (--indicator-style=file-type)
	 * 'classify' (--indicator-style=classify)
	 */

	indicatorStyle: 'none',

	/*
	 * 'undefined' (default)
	 * 'never'
	 * 'command_line_arguments' (-H)
	 * 'command_line_symlink_to_dir' (the default, in certain cases)
	 * 'always' (-L)
	 */

	dereference: 'undefined',

	/*
	 * True means when a directory is found, display info on its
	 * contents.  -R
	 */

	recursive: false,

	/*
	 * True means when an argument is a directory name, display info
	 * on it itself.  -d
	 */

	immediateDirs: false,

	/*
	 * True means that directories are grouped before files.
	 */

	directoriesFirst: false,

	/*
	 * Which files to ignore.
	 *
	 * 'default'
	 *   Ignore files whose names start with '.',
	 *   and files specified by --hide and --ignore.
	 *
	 * 'dot_and_dottot'
	 *   Ignore '.', '..', and files specified by --ignore.
	 *
	 * 'minimal'
	 *   Ignore only files specified by --ignore.
	 */

	ignoreMode: 'default',

	/*
	 * A list of shell-style globbing patterns.
	 * If a non-argument file name matches any of these patterns,
	 * it is ignored.  Controlled by -I.  Multiple -I options
	 * accumulate.  The -B option adds '*~' and '.*~' to this list.
	 */

	ignorePatterns: [],

	/*
	 * Similar to IGNORE_PATTERNS, except that -a or -A causes
	 * this variable itself to be ignored.
	 */

	hidePatterns: [],

	/*
	 * Set of file types to display.
	 *
	 * 'fifo'
	 * 'chardev'
	 * 'blockdev'
	 * 'directory'
	 * 'normal'
	 * 'symbolic_link'
	 * 'sock'
	 * 'whiteout'
	 */

	selectTypes: null,
	dropTypes: null,

	/*
	 * True means output nongraphic chars in file names as '?'.
	 * (-q, --hide-control-chars)
	 * qmark_funny_chars and the quoting style (-Q,
	 * --quoting-style=WORD) are independent.  The algorithm is: first,
	 * obey the quoting style to get a string representing the file
	 * name;  then, if qmarkFunnyChars is set, replace all
	 * nonprintable chars in that string with '?'.  It's necessary to
	 * replace nonprintable chars even in quoted strings, because we
	 * don't want to mess up the terminal if control chars get sent to
	 * it, and some quoting methods pass through control chars as-is.
	 */

	qmarkFunnyChars: false,

	/*
	 * Quoting options for file and dir name output.
	 */

	filenameQuotingOptions: null,
	dirnameQuotingOptions: null,

	/*
	 * The number of chars per hardware tab stop.  Setting this to zero
	 * inhibits the use of TAB characters for separating columns.  -T
	 */

	tabSize: 8,

	/*
	 * lss extension: Filename collation method.
	 *
	 *   - intl
	 *   - codepoint
	 *   - byte
	 */

	collationMethod: 'intl',

	/*
	 * lss extension: default pager names array
	 *
	 *   - $PAGER
	 *   - less
	 *   - more
	 *   - pg
	 *   - most
	 *   - none | off
	 */

	pager: ['$PAGER', 'less'],

	/*
	 * lss extension: drop thumbnail caches
	 */

	invalidateThumbnailCache: false,

	/*
	 * Color Name  FG  BG            Style  Set  Reset
	 * ----------  --  --        ---------  ---  -----
	 *      Black  30  40             Bold    1     22
	 *        Red  31  41              Dim    2     22
	 *      Green  32  42           Italic    3     23
	 *     Yellow  33  43        Underline    4     24
	 *       Blue  34  44            Blink    5     25
	 *    Magenta  35  45          Inverse    7     27
	 *       Cyan  36  46           Hidden    8     28
	 *      White  37  47           Strike    9     29
	 *    Default  39  49
	 *      Reset   0   0
	 */
	colorMap: {
		knownType: {
			lc: '\x1b[',	// C_LEFT
			rc: 'm',		// C_RIGHT
			ec: null,		// C_END
			rs: '0',		// C_RESET
			no: null,		// C_NORM
			fi: null,		// C_FILE
			di: '01;34',	// C_DIR
			ln: '01;36',	// C_LINK
			pi: '33',		// C_FIFO
			so: '01;35',	// C_SOCK
			bd: '01;33',	// C_BLK
			cd: '01;33',	// C_CHR
			mi: null,		// C_MISSING
			or: null,		// C_ORPHAN
			ex: '01;32',	// C_EXEC
			do: '01;35',	// C_DOOR
			su: '37;41',	// C_SETUID
			sg: '30;43',	// C_SETGID
			st: '37;44',	// C_STICKY
			ow: '34;42',	// C_OTHER_WRITABLE
			tw: '30;42',	// C_STICKY_OTHER_WRITABLE
			ca: null,		// C_CAP
			mh: null,		// C_MULTIHARDLINK
			cl: '\x1b[K'	// C_CLR_TO_EOL
		},
		extensions: [
			//    {ext: '.tar', seq: '01;31'},
			//    {ext: '.tgz', seq: '01;31', caseIgnore: true},
			//        :
			//        :
		]
	}
};

export const runtime = {
	event: new EventEmitter,
	isVerbose: false,
	isSignalInitialized: false,
	defaultGCFOptions: null,
	defaultGCFOptionsA: null,
	termInfo: null,
	addon: new Proxy({}, {
		get: (obj, prop) => {
			try {
				const addon = bindings('lss.node');
				runtime.addon = addon;
				return addon[prop];
			}
			catch {
				runtime.addon = null;
			}
		}
	}),

	/*
	 * Record of one pending directory waiting to be listed.
	 */

	pendingDirectories: [],

	/*
	 * The contents of each directory are prefixed with a newline,
	 * but the first block does not require it.
	 * A flag for this purpose
	 */

	isFirstCallOfPrintDirectory: true,

	/*
	 * Desired exit status
	 */

	exitStatus: EXIT_CODE.EXIT_SUCCESS,

	/*
	 * Host name of local machine
	 */

	hostname: '',

	/*
	 * Whether we used any colors in the output so far.  If so, we will
	 * need to restore the default color later.  If not, we will need to
	 * call prep_non_filename_text before using color for the first time.
	 */

	usedColor: false,

	/*
	 * True means to check for orphaned symbolic link, for displaying
	 * colors, or to group symlink to directories with other dirs.
	 */

	checkSymlinkMode: false,

	/*
	 * Whether files needs may need padding due to quoting.
	 */

	cwdSomeQuoted: false,

	/*
	 * Whether quoting style _may_ add outer quotes,
	 * and whether aligning those is useful.
	 */

	alignVariableOuterQuotes: false,

	/*
	 * The line length to use for breaking lines in many-per-line
	 * format.  Can be set with -w.  If zero, there is no limit.
	 */

	lineLength: 0,

	/*
	 * Maximum number of columns ever possible for this display.
	 */

	maxIndex: 0,

	/*
	 * If true, the file listing format requires that stat be called on
	 * each file.
	 */

	formatNeedsStat: false,

	/*
	 * Similar to 'formatNeedsStat', but set if only the file type is
	 * needed.
	 */

	formatNeedsType: false,

	/*
	 * Current time in seconds and nanoseconds since 1970,
	 * updated as needed when deciding whether a file is recent.
	 */

	currentTime: 0n,

	/*
	 * Whether any of the files has an ACL.  This affects the width of the
	 * mode column.
	 */

	anyHasAcl: false,

	/*
	 * Character added to the end of a line.
	 * If the --zero switch is specified, this is the NUL character.
	 */

	eolbyte: '\n',

	/*
	 * Preformatted short month names
	 *
	 * some exsamples:
	 * <en locale>
	 *   shortMonths = [
	 *       'Jan', 'Feb', 'Mar', 'Apr',
	 *       'May', 'Jun', 'Jul', 'Aug',
	 *       'Sep', 'Oct', 'Nov', 'Dec'
	 *   ]
	 *
	 * <fr locale>
	 *   shortMonths = [
	 *       'janv.', 'févr.', 'mars ', 'avr. ',
	 *       'mai  ', 'juin ', 'juil.', 'août ',
	 *       'sept.', 'oct. ', 'nov. ', 'déc. '
	 *   ]
	 *
	 * <ja locale>
	 *   shortMonths = [
	 *       ' 1月', ' 2月', ' 3月', ' 4月',
	 *       ' 5月', ' 6月', ' 7月', ' 8月',
	 *       ' 9月', '10月', '11月', '12月'
	 *   ]
	 *
	 * <th locale>
	 *   shortMonths = [
	 *       ' Thg 1', ' Thg 2', ' Thg 3',
	 *       ' Thg 4', ' Thg 5', ' Thg 6',
	 *       ' Thg 7', ' Thg 8', ' Thg 9',
	 *       'Thg 10', 'Thg 11', 'Thg 12'
	 *   ]
	 */

	shortMonths: null,

	/*
	 * True if precomputed formats should be used.
	 * This can be false if a format or month abbreviation is unusually long,
	 * or if a month abbreviation contains '%'.
	 */

	isAbmonAvailable: false,

	/*
	 * The set of 'active' directories, from the current command-line
	 * argument to the level in the hierarchy at which files are being
	 * listed.
	 * A directory is represented by its device and inode numbers.
	 * A directory is added to this set when ls begins listing it or
	 * its entries, and it is removed from the set just after ls has
	 * finished processing it.
	 * This set is used solely to detect loops, e.g., with
	 *
	 *   mkdir loop; cd loop; ln -s ../loop sub; ls -RL
	 */

	activeDirSet: null,

	/*
	 * Intl.Collator object used to sort by file name.
	 */

	collator: null,

	/*
	 * total number of processed files
	 */

	totalFileNum: 0,

	/*
	 * max columns for each display element
	 */

	maxColumns: {
		inode: 0,
		blockSize: 0,
		nlink: 0,
		scontext: 0,
		owner: 0,
		group: 0,
		author: 0,
		majorDeviceNumber: 0,
		minorDeviceNumber: 0,
		fileSize: 0
	}
};
