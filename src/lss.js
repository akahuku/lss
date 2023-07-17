/**
 * lss.js -- unofficial port of ls in GNU coreutils
 *
 * Copyright (C) 2024 akahuku@gmail.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * @see https://github.com/coreutils/coreutils/blob/master/src/ls.c
 * @see https://www.gnu.org/software/coreutils/ls
 */

import {default as nodePath} from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import {
	EXIT_CODE, __dirname, self, error, pref, runtime
} from './base.js';

import {argumentUtils} from './argument.js';
import {humanUtils} from './human.js';
import {pargs, splitFromString} from './pargs.js';
import {printf} from './format.js';
import {quoteUtils} from './quoting.js';
import {statUtils} from './stat.js';
import {strftime, getDefaultLocale} from './time.js';
import {log} from './logger.js';
import * as pathUtils from './path.js';

import {
	printSwitches, getTerminalCapabilitiesFromSpec, less,
	fileEscape, fileExists, delay, delay0, waitKeyPressed,
	splitDCSSequences, iterateLines, countLines, stdout
} from './utils.js';

import Unistring from '@akahuku/unistring';
import micromatch from 'micromatch';

const CELL_RIGHT_MARGIN_COLS = 2;
const MIN_COLUMN_WIDTH = 3;
const HALF_YEAR_NS = BigInt((365.2425 * 24 * 60 * 60 * 1e9) / 2);
const FILE_TYPE_MAP = {
    'unknown':       {mode: '?', indicator: 'or'},
    'fifo':          {mode: 'p', indicator: 'pi'},
    'chardev':       {mode: 'c', indicator: 'cd'},
    'directory':     {mode: 'd', indicator: 'di'},
    'blockdev':      {mode: 'b', indicator: 'bd'},
    'normal':        {mode: '-', indicator: 'fi'},
    'symbolic_link': {mode: 'l', indicator: 'ln'},
    'sock':          {mode: 's', indicator: 'so'},
    'whiteout':      {mode: 'w', indicator: 'fi'},
    'arg_directory': {mode: 'd', indicator: 'di'}
};
const LINK_ARROW = ' -> ';
const PROMPT_BOTTOM = ' - press q to quit';
const LIMIT_MSECS_TO_PRINT_STRIP_STATUS = 1000;
const USE_8452 = false;
const THUMBNAIL_LINES = 4;
let   THUMBNAIL_COLS;
const THUMBNAIL_CAPTION_MIN_COLS = 10;
const FOLD_THRESHOLD_DEVIATION = 60;
const MARGIN = ' '.repeat(CELL_RIGHT_MARGIN_COLS);
const NEWLINES = '\v'.repeat(THUMBNAIL_LINES);
const UPSEQ = `\x1b[${THUMBNAIL_LINES}A`;
let   ADVANCE;

let extraPref;
let capUtils;
let idUtils;
let thumbnailUtils;
let versionUtils;

// <<< parseArgs
function parseArgs () {
	function validateFormat (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				['#Z', 'across', 'horizontal'],
				['#Z,', 'commas'],
				['#1', 'single-column'],
				['#И', 'vertical'],
				['#long', 'long', 'verbose']
			], options
		).value;
	}

	function validateTimeStyle (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				'full-iso',
				'long-iso',
				'iso',
				'locale'
			], options
		).value;
	}

	function validateTimeType (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				['atime', 'access', 'use'],
				['ctime', 'status'],
				['mtime', 'modification'],
				['#birthtime', 'btime', 'birth', 'creation']
			], options
		).value;
	}

	function validateSortType (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				'none',
				'time',
				'size',
				'extension',
				'version',
				'width'
			], options
		).value;
	}

	function validateIndicatorStyle (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				'none',
				'slash',
				'file-type',
				'classify'
			], options
		).value;
	}

	function validateWhen (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				['always', 'yes', 'force'],
				['never', 'no', 'none'],
				['auto', 'tty', 'if-tty'],
			], options
		).value;
	}

	function validateQuotingStyle (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				'literal',
				'shell',
				'shell-always',
				'shell-escape',
				'shell-escape-always',
				'c',
				'c-maybe',
				'escape',
				'locale',
				'clocale'
			], options
		).value;
	}

	function validateCollationMethod (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				'intl',
				'codepoint',
				'byte',
			], options
		).value;
	}

	function validateFileType (context, param, options) {
		return argumentUtils.xargmatch(
			context, param, [
				'blockdev',
				'chardev',
				'directory',
				'fifo',
				['normal', 'regular'],
				['symbolic_link', 'link'],
				'sock',
				'whiteout',
			], options
		).value;
	}

	function validatePager (context, param, options) {
		return param.split(',').map(p => {
			return argumentUtils.xargmatch(
				context, p.replace(/^\s+|\s+$/, ''), [
					'$PAGER',
					'less',
					'more',
					'pg',
					'most',
					['none', 'off']
				], options
			).value;
		});
	}

	function parseNaturalNumber (spec) {
		const e = humanUtils.xstrtoumax(spec, 0);
		if ('value' in e) {
			return e.value <= 0xffff ? e.value : 0;
		}
		else if (e.error === humanUtils.LONGINT_OVERFLOW) {
			return 0;
		}
		return -1;
	}

	function getQuotingStyleFromEnv () {
		if (!('QUOTING_STYLE' in process.env)) {
			return null;
		}

		const p = process.env['QUOTING_STYLE'];
		const result = validateQuotingStyle(
			'QUOTING_STYLE', p, {onNotMatch: null}
		);

		if (!('value' in result)) {
			error(0, null,
				`ignoring invalid value in environment variable QUOTING_STYLE: %s`,
				quoteUtils.quote(p));
			return null;
		}

		return result.value;
	}

	function getAlignVariableOuterQuotes (qs) {
		function isOuterQuoteAvailable () {
			return qs == 'shell'
				|| qs == 'shell_escape'
				|| qs == 'c_maybe';
		}
		function isHorizontalLayout () {
			return (pref.format == 'И' || pref.format == 'Z')
				&& runtime.lineLength;
		}

		return (pref.format == 'long' || isHorizontalLayout())
			&& isOuterQuoteAvailable();
	}

	function initTimeStyleAsStrftimeFormat (timeStyleOption) {
		const styles = timeStyleOption.split('\n', 3);
		if (styles.length == 3) {
			throw new Error(`Invalid time style format "${timeStyleOption.substring(1)}"`);
		}
		if (styles.length == 1) {
			styles.push(styles[0]);
		}
		pref.longTimeFormat[0] = styles[0];
		pref.longTimeFormat[1] = styles[1];
	}

	function initTimeStyleByKeyword (timeStyleOption) {
		const res = validateTimeStyle(
			'time style', timeStyleOption, {
				onNotMatch: (payload) => {
					const argListCopy = [].concat(
						payload.argList,
						payload.argList.map(a => `posix-${a}`)
					);
					const validList = argumentUtils
						.argmatchValid(argListCopy);
					const message = `${self}: ${payload.invalidMessage}
${validList}
  • +FORMAT (e.g., +%H:%M) for a 'date'-style format`;

					console.error(message);
					emitTryHelp(EXIT_CODE.LS_FAILURE);
				}
			}
		);

		switch (res) {
		case 'full-iso':
			pref.longTimeFormat[0] = pref.longTimeFormat[1] =
				'%Y-%m-%d %H:%M:%S.%N %z';
			break;
		case 'long-iso':
			pref.longTimeFormat[0] = pref.longTimeFormat[1] =
				'%Y-%m-%d %H:%M';
			break;
		case 'iso':
			pref.longTimeFormat[0] = '%Y-%m-%d ';
			pref.longTimeFormat[1] = '%m-%d %H:%M';
			break;
		case 'locale':
			if (isHardCodedTimeLocale()) {
				pref.longTimeFormat[0] = '%b %e  %Y';
				pref.longTimeFormat[1] = '%b %e %H:%M';
			}
			break;
		}
	}

	function initAbmon () {
		const result = [];
		const formatter = Intl.DateTimeFormat(
			getDefaultLocale(),
			{month: 'short'});
		let requiredMonWidth = 12;
		let currentMaxWidth;
		do {
			currentMaxWidth = requiredMonWidth;
			requiredMonWidth = 0;
			for (let i = 0; i < 12; i++) {
				let abbr = formatter.format(
					new Date(`2000-${i + 1}-01 00:00:00`));
				if (abbr.includes('%')) {
					return null;
				}
				const cols = getColumnsFor(abbr);
				const padLength = Math.max(0, currentMaxWidth - cols);
				const pad = getSpaces(padLength);
				requiredMonWidth = Math.max(
					requiredMonWidth,
					Math.min(cols, currentMaxWidth));
				if (/\d+/.test(abbr)) {
					result[i] = pad + abbr;
				}
				else {
					result[i] = abbr + pad;
				}
			}
		} while (currentMaxWidth > requiredMonWidth);

		return result;
	}

	const args = pargs(
		[
			process.env['LSS_OPTIONS'] ?? '',
			Buffer.from((process.argv[2] ?? ''), 'hex')
		],
		[
			// selection
			'a:all',
			'A:almost-all',
			'd:directory',
			'  drop-types=#',
			'  hide[]=#',
			'I:ignore[]=#',
			'B:ignore-backups',
			'  select-types=#',
			'R:recursive',

			// symbolic links
			'L:dereference',
			'H:dereference-command-line',
			'  dereference-command-line-symlink-to-dir',

			// layout formats
			'1:one-file-per-line',
			'C:by-columns',
			'm:with-comma',
			'l:long-listing',
			'g:without-owner',
			'n:numeric-uid-gid',
			'o:long-listing-without-group',
			'x:by-lines',
			'  format=#',

			// general output formatting
			'  author',
			'  block-size=#',
			'  color=?',
			'  capability',
			'Z:context',
			'F:classify=?',
			'D:dired',
			'  file-type',
			'  full-time',
			'  group-directories-first',
			'  header',
			'h:human-readable',
			'  hyperlink=?',
			'  invalidate-thumbnail-cache',
			'  indicator-style=#',
			'p:indicator-style-slash',
			'i:inode',
			'k:kibibytes',
			'G:no-group',
			'P:pager=#',
			'  si',
			's:size',
			'T:tabsize=#',
			'y:thumbnail',
			'  no-thumbnail',
			'  time=#',
			'w:width=#',
			'  zero',

			// time stamp formatting
			'  time-style=#',

			// file name formatting
			'b:escape',
			'N:literal',
			'Q:quote-name',
			'  quoting-style=#',
			'q:hide-control-chars',
			'  show-control-chars',

			// sort control
			'  sort=#',
			'U:sort-key-none',
			'X:sort-key-extension',
			'S:sort-key-file-size',
			't:sort-key-time',
			'v:sort-key-version',
			'f:disable-sort',
			'r:reverse',
			'u:time-type-atime',
			'c:time-type-ctime',
			'  collation=#',

			// miscellaneous
			'?:help',
			'  diag',
			'  thumbnail-cache-root',
			'  root',
			'  verbose',
			'  version'
		],
		{
			onQueryAmbiguousParam: (sw, param) => {
				if (sw.long == 'color'
				 || sw.long == 'classify'
				 || sw.long == 'hyperlink') {
					return !!validateWhen(`--${sw.long}`, param, {
						onNotMatch: (payload) => {}
					});
				}
			},
			allowInvert: false
		}
	);

	if ('error' in args) {
		if (args.error.parseArgErrorCode == 0) {
			error(0, null,
				'unrecognized option %s',
				quoteUtils.quote(args.error.switchString));
			return {result: 'help2'};
		}
		else {
			throw args.error;
		}
	}

	if ('help' in args.switches
	 && args.switches.help.value === true) {
		return {result: 'help'};
	}

	let kibibytesSpecified = false;
	let formatOption = null;
	let hideControlCharsOption = null;
	let quotingStyleOption = null;
	let timeStyleOption = null;
	let sortOption = null;
	let tabSizeOption = -1;
	let widthOption = -1;

	for (const i in args.switches) {
		let param = args.switches[i].string;

		switch (i) {
		// options for file selection
		case 'all':
			pref.ignoreMode = 'minimal';
			break;

		case 'almost-all':
			pref.ignoreMode = 'dot_and_dotdot';
			break;

		case 'directory':
			pref.immediateDirs = true;
			break;

		case 'hide':
			pref.hidePatterns.push.apply(
				pref.hidePatterns,
				args.switches[i].map(a => a.string));
			break;

		case 'ignore':
			pref.ignorePatterns.push.apply(
				pref.ignorePatterns,
				args.switches[i].map(a => a.string));
			break;

		case 'ignore-backups':
			pref.ignorePatterns.push('*~', '.*~');
			break;

		case 'select-types':
			if (!pref.selectTypes) {
				pref.selectTypes = new Set;
			}
			param.split(',').forEach(type => {
				const validated = validateFileType(
					args.switches[i].name,
					type.replace(/^\s+|\s+$/g, ''));
				if (validated) {
					if (validated == 'directory') {
						pref.selectTypes.add('directory');
						pref.selectTypes.add('arg_directory');
					}
					else {
						pref.selectTypes.add(validated);
					}
				}
			});
			break;

		case 'drop-types':
			if (!pref.dropTypes) {
				pref.dropTypes = new Set;
			}
			param.split(',').forEach(type => {
				const validated = validateFileType(
					args.switches[i].name,
					type.replace(/^\s+|\s+$/g, ''));
				if (validated) {
					if (validated == 'directory') {
						pref.dropTypes.add('directory');
						pref.dropTypes.add('arg_directory');
					}
					else {
						pref.dropTypes.add(validated);
					}
				}
			});
			break;

		case 'recursive':
			pref.recursive = true;
			break;

		// options controlling symbolic link behavior
		case 'dereference':
			pref.dereference = 'always';
			break;

		case 'dereference-command-line':
			pref.dereference = 'command_line_arguments';
			break;

		case 'dereference-command-line-symlink-to-dir':
			pref.dereference = 'command_line_symlink_to_dir';
			break;

		// options for format of layout
		case 'by-columns':
			formatOption = 'И';
			break;

		case 'by-lines':
			formatOption = 'Z';
			break;

		case 'format':
			formatOption = validateFormat(args.switches[i].name, param);
			break;

		case 'long-listing':
			formatOption = 'long';
			break;

		case 'long-listing-without-group':
			formatOption = 'long';
			pref.printGroup = false;
			break;

		case 'numeric-uid-gid':
			pref.numericIds = true;
			formatOption = 'long';
			break;

		case 'one-file-per-line':
			/* -1 has no effect after -l. */
			if (formatOption != 'long') {
				formatOption = '1';
			}
			break;

		case 'with-comma':
			formatOption = 'Z,';
			break;

		case 'without-owner':
			formatOption = 'long';
			pref.printOwner = false;
			break;

		// display options
		case 'author':
			pref.printAuthor = true;
			break;

		case 'block-size':
			{
				const e = humanUtils.humanOptions(param);
				if (e.error) {
					console.error(`invalid argument '${param}' for --blocksize`);
					process.exit(EXIT_CODE.LS_FAILURE);
				}
				pref.fileHumanOutputOpts = pref.humanOutputOpts = e.opts;
				pref.fileOutputBlockSize = pref.outputBlockSize = e.block_size;
			}
			break;

		case 'color':
			param = param == '' ?
				'always' : validateWhen(args.switches[i].name, param);
			pref.printWithColor = param == 'always'
				|| (param == 'auto' && process.stdout.isTTY);
			break;

		case 'capability':
			pref.printCapability = true;
			break;

		case 'context':
			pref.printScontext = true;
			break;

		case 'classify':
			param = param == '' ?
				'always' : validateWhen(args.switches[i].name, param);
			if (param == 'always'
			 || param == 'if-tty' && process.stdout.isTTY) {
				pref.indicatorStyle = 'classify';
			}
			break;

		case 'escape':
			quotingStyleOption = 'escape';
			break;

		case 'dired':
			throw new Error(printf(
				`%s option is not supported.`,
				quoteUtils.quote(args.switches[i].name)));
			break;

		case 'file-type':
			pref.indicatorStyle = 'file-type';
			break;

		case 'full-time':
			formatOption = 'long';
			timeStyleOption = 'full-iso';
			break;

		case 'group-directories-first':
			pref.directoriesFirst = true;
			break;

		case 'header':
			pref.printHeader = true;
			break;

		case 'hide-control-chars':
			hideControlCharsOption = true;
			break;

		case 'human-readable':
			pref.fileHumanOutputOpts =
			pref.humanOutputOpts =
				humanUtils.human_autoscale
				| humanUtils.human_SI
				| humanUtils.human_base_1024;
			pref.fileOutputBlockSize =
			pref.outputBlockSize = 1;
			break;

		case 'hyperlink':
			param = param == '' ?
				'always' : validateWhen(args.switches[i].name, param);
			pref.printHyperlink = param == 'always'
				|| (param == 'auto' && process.stdout.isTTY);
			break;

		case 'invalidate-thumbnail-cache':
			pref.ignoreThumbnailCache = true;
			break;

		case 'indicator-style':
			pref.indicatorStyle = validateIndicatorStyle(args.switches[i].name, param);
			break;

		case 'indicator-style-slash':
			pref.indicatorStyle = 'slash';
			break;

		case 'inode':
			pref.printInode = true;
			break;

		case 'kibibytes':
			kibibytesSpecified = true;
			break;

		case 'literal':
			quotingStyleOption = 'literal';
			break;

		case 'no-group':
			pref.printGroup = false;
			break;

		case 'pager':
			pref.pager = validatePager(args.switches[i].name, param);
			break;

		case 'quote-name':
			quotingStyleOption = 'c';
			break;

		case 'quoting-style':
			quotingStyleOption = validateQuotingStyle(args.switches[i].name, param);
			break;

		case 'show-control-chars':
			hideControlCharsOption = false;
			break;

		case 'si':
			pref.fileHumanOutputOpts =
			pref.humanOutputOpts =
				humanUtils.human_autoscale
				| humanUtils.human_SI;
			pref.fileOutputBlockSize =
			pref.outputBlockSize = 1;
			break;

		case 'size':
			pref.printBlockSize = true;
			break;

		case 'tabsize':
			tabSizeOption = parseNaturalNumber(param);
			if (tabSizeOption < 0) {
				throw new Error(printf(
					`Invalid tab size: %s`,
					quoteUtils.quote(param)));
			}
			break;

		case 'time':
			param = param == '' ?
				'mtime' : validateTimeType(args.switches[i].name, param);
			pref.timeType = param;
			break;

		case 'time-style':
			timeStyleOption = param;
			break;

		case 'thumbnail':
			pref.printThumbnail = true;
			break;

		case 'no-thumbnail':
			pref.printThumbnail = false;
			break;

		case 'width':
			widthOption = parseNaturalNumber(param);
			if (widthOption < 0) {
				throw new Error(printf(
					`Invalid line width: %s`,
					quoteUtils.quote(param)));
			}
			break;

		case 'zero':
			runtime.eolbyte = '\x00';
			hideControlCharsOption = false;
			formatOption = formatOption != 'long' ? '1' : formatOption;
			pref.printWithColor = false;
			pref.printThumbnail = false;
			pref.pager = ['none'];
			quotingStyleOption = 'literal';
			break;

		// time type options
		case 'time-type-atime':
			pref.timeType = 'atime';
			break;
		case 'time-type-ctime':
			pref.timeType = 'ctime';
			break;

		// sort options
		case 'collation':
			pref.collationMethod = validateCollationMethod(args.switches[i].name, param);
			break;
		case 'disable-sort':
			// Same as -a -U -1 --color=none --hyperlink=none,
			// while disableing -s
			pref.ignoreMode = 'minimal';
			sortOption = 'none';
			formatOption = formatOption == 'long' ? null : formatOption;
			pref.printWithColor = false;
			pref.printHyperlink = false;
			pref.printBlockSize = false;
			break;
		case 'sort':
			sortOption = validateSortType(args.switches[i].name, param);
			break;
		case 'sort-key-extension':
			sortOption = 'extension';
			break;
		case 'sort-key-file-size':
			sortOption = 'size';
			break;
		case 'sort-key-none':
			sortOption = 'none';
			break;
		case 'sort-key-time':
			sortOption = 'time';
			break;
		case 'sort-key-version':
			sortOption = 'version';
			break;
		case 'reverse':
			pref.sortReverse = true;
			break;

		case 'verbose':
			runtime.isVerbose = true;
			break;

		case 'diag':
		case 'thumbnail-cache-root':
		case 'root':
		case 'version':
			return {result: i};

		default:
			return {result: 'help2'};
		}
	}

	/*
	 * output block size tweaks
	 */

	if (pref.outputBlockSize <= 0) {
		const lsBlockSize = process.env['LS_BLOCK_SIZE'];
		const blockSize = process.env['BLOCK_SIZE'];
		const e = humanUtils.humanOptions(lsBlockSize);

		pref.humanOutputOpts = e.opts;
		pref.outputBlockSize = e.block_size;

		if (lsBlockSize != undefined && lsBlockSize != ''
		 || blockSize != undefined && blockSize != '') {
			pref.fileHumanOutputOpts = pref.humanOutputOpts;
			pref.fileOutputBlockSize = pref.outputBlockSize;
		}

		if (kibibytesSpecified) {
			pref.humanOutputOpts = 0;
			pref.outputBlockSize = 1024;
		}
	}

	/*
	 * format tweaks
	 */

	if (formatOption !== null) {
		pref.format = formatOption;
	}
	else {
		switch (getSelfType()) {
		case 'LS_LS':
			if (process.stdout.isTTY) {
				pref.format = 'И';
			}
			else {
				pref.format = '1';
			}
			break;
		case 'LS_MULTI_COL':
			pref.format = 'И';
			break;
		default:
			pref.format = 'long';
			break;
		}
	}

	/*
	 * width tweaks
	 *
	 * If the line length was not set by a switch but is needed to
	 * determine output, go to the work of obtaining it from the
	 * environment.
	 */

	if (pref.format == 'И'
	 || pref.format == 'Z'
	 || pref.format == 'Z,'
	 || pref.printWithColor
	 || pref.printThumbnail) {
		if (widthOption < 0) {
			widthOption = process.stdout.columns ?? -1;
		}
		if (widthOption < 0) {
			if ('COLUMNS' in process.env) {
				const p = process.env['COLUMNS'];
				widthOption = parseNaturalNumber(p);
				if (widthOption < 0) {
					error(0, null,
						`ignoring invalid width in environment variable COLUMNS: %s`,
						quoteUtils.quote(p));
				}
			}
		}
	}
	runtime.lineLength = widthOption < 0 ? 80 : widthOption;
	runtime.maxIndex = Math.ceil(runtime.lineLength / MIN_COLUMN_WIDTH);

	/*
	 * tab size tweaks
	 */

	if (pref.format == 'И'
	 || pref.format == 'Z'
	 || pref.format == 'Z,') {
		if (tabSizeOption < 0) {
			if ('TABSIZE' in process.env) {
				const p = process.env['TABSIZE'];
				tabSizeOption = parseNaturalNumber(p);
				if (tabSizeOption < 0) {
					error(0, null,
						`ignoring invalid tab size in enviroment variable TABSIZE: %s`,
						quoteUtils.quote(p));
				}
			}
		}
	}
	pref.tabSize = tabSizeOption < 0 ? 8 : tabSizeOption;

	/*
	 * funny chars tweaks
	 */

	if (hideControlCharsOption === null) {
		pref.qmarkFunnyChars = getSelfType() == 'LS_LS' && process.stdout.isTTY;
	}
	else {
		pref.qmarkFunnyChars = hideControlCharsOption;
	}
	quoteUtils.defaultQuotingOptions.replacement = pref.qmarkFunnyChars ? '?' : null;

	/*
	 * quoting tweaks
	 */

	if (quotingStyleOption === null) {
		quotingStyleOption = getQuotingStyleFromEnv();
	}
	if (quotingStyleOption === null) {
		if (getSelfType() == 'LS_LS') {
			if (process.stdout.isTTY) {
				quotingStyleOption = 'shell_escape';
			}
		}
		else {
			quotingStyleOption = 'escape';
		}
	}
	if (quotingStyleOption !== null) {
		quoteUtils.defaultQuotingOptions.style = quotingStyleOption;
	}
	runtime.alignVariableOuterQuotes =
		getAlignVariableOuterQuotes(quotingStyleOption);

	// set filename quote chars
	pref.filenameQuotingOptions =
		quoteUtils.defaultQuotingOptions.clone();
	if (quotingStyleOption == 'escape') {
		pref.filenameQuotingOptions.setCharQuoting(' ', true);
	}
	if (pref.indicatorStyle == 'file-type') {
		pref.filenameQuotingOptions.setCharQuoting('*=>@|', true);
	}
	else if (pref.indicatorStyle == 'classify') {
		pref.filenameQuotingOptions.setCharQuoting('=>@|', true);
	}

	// set dirname quote chars
	pref.dirnameQuotingOptions =
		quoteUtils.defaultQuotingOptions.clone();
	pref.dirnameQuotingOptions.setCharQuoting(':', true);

	/*
	 * sort type tweaks
	 */

	if (sortOption !== null) {
		pref.sortType = sortOption;
	}
	else if (pref.format != 'long'
	 && /^[cab]time$/.test(pref.timeType)) {
		pref.sortType = 'time';
	}
	else {
		pref.sortType = 'name';
	}

	/*
	 * time style tweaks
	 */

	if (pref.format == 'long') {
		if (timeStyleOption === null
		 && !('TIME_STYLE' in process.env)) {
			timeStyleOption = 'locale';
		}

		if (!timeStyleOption.startsWith('posix-')
		 || !isHardCodedTimeLocale()) {
			timeStyleOption = timeStyleOption.replace(/^posix-/, '');

			/*
			 * If the timeStyleOption begins with a + sign,
			 * the remainder is passed directly to strftime().
			 */

			if (timeStyleOption.startsWith('+')) {
				initTimeStyleAsStrftimeFormat(
					timeStyleOption.substring(1));
			}

			/*
			 * If not, initialize longTimeFormat[] according to
			 * valid keywords.
			 */

			else {
				initTimeStyleByKeyword(timeStyleOption);
			}
		}

		const abmon = initAbmon();
		if (abmon) {
			runtime.shortMonths = abmon;
			runtime.isAbmonAvailable = true;
		}
	}

	/*
	 * string collator tweaks
	 */

	runtime.collator = new Intl.Collator(undefined, {
		usage: 'sort',
		sensitivity: 'variant',
		caseFirst: 'lower'
	});

	return {result: 'parsed', args};
}
// >>>

/*
 * classes
 */

class NullDirent {
	constructor (name) {
		this.name = name;
	}

	isBlockDevice ()     { return false }
	isCharacterDevice () { return false }
	isFIFO ()            { return false }
	isSymbolicLink ()    { return false }
	isFile ()            { return false }
	isSocket ()          { return false }
	isDirectory ()       { return true }
}

class FileInfo {
	constructor (name, ino, fileType) {
		this.stat = {ino};
		this.statOk = false;
		this.fileType = fileType;

		// The file name (Buffer)
		this.name = name;

		// For symbolic link, name of the file linked to (Buffer|null)
		this.linkName = null;
		// Permission mode of file linked to (Number)
		this.linkMode = 0;
		// True if linked-to file exists (Boolean)
		this.linkOk = false;

		// For terminal hyperlinks (string|null)
		this.absoluteName = null;
		// security context (string|null)
		this.scontext = null;
		// For long listings, true if the file has an access control list,
		// or a security context (string|null)
		this.aclType = null;
		// For color listings, true if a regular file has capability info
		// (Boolean)
		this.hasCapability = false;
		// Whether file name needs quoting (Boolean|null)
		// It has tri-state,
		//   null: unknown - needs quoting (but may not change)
		//   false:        - no quoting needed
		//   true:         - needs quoting
		this.quoted = null;

		this.cache = {
			// isDirectory: 1 or 0, used for sort key
			// name: NFC normalized name
			// nameBuffer: buffer of name
			// extension: NFC normalized extension
			// extensionBuffer: buffer of extension
			// width: columns of decorated name
			// number: used for sort key (size, time)
			// short: decorated string to display for short format layouts
			//        {content, columns}
			// nameDecorated: decorated name
			//        {content, sequence, usedColor}
			// linkNameDecorated: decorated link name
			//        {content, sequence, usedColor}
		};
	}

	getFrills () {
		const widthInvalidated = pref.format == 'Z,';
		let result = '';

		if (pref.printInode) {
			const w = widthInvalidated ? 0 : runtime.maxColumns.inode;
			result += printf('%*s ', w, formatInode(this));
		}
		if (pref.printBlockSize) {
			const w = widthInvalidated ? 0 : runtime.maxColumns.blockSize;
			let s;
			if (this.statOk) {
				s = humanUtils.humanReadable(
					statUtils.ST_NBLOCKS(this.stat),
					pref.humanOutputOpts,
					this.stat.blksize,
					pref.outputBlockSize);
			}
			else {
				s = '?';
			}
			result += printf('%*s ', w, s);
		}
		if (pref.printScontext) {
			const w = widthInvalidated ? 0 : runtime.maxColumns.scontext;
			result += printf('%*s ', w, this.scontext);
		}

		return result;
	}

	getDecoratedName (isSymlinkTarget, ignoreAbsoluteName) {
		const name = isSymlinkTarget ? this.linkName : this.name;
		if (!name) return null;

		const escapeSequence = pref.printWithColor ?
			getColorIndicator(this, isSymlinkTarget) : null;
		const usedColorThisTime = pref.printWithColor
			&& (!!escapeSequence || isColored('no'));
		const decorated = getDecoratedName(
			name,
			pref.filenameQuotingOptions,
			this.quoted,
			escapeSequence,
			!isSymlinkTarget && !pref.printThumbnail,
			ignoreAbsoluteName ? null : this.absoluteName);

		if (!isSymlinkTarget) {
			this.quoted = decorated.quoted;
		}

		return {
			// e.g. NAME
			//      \x1b[1mNAME
			//      \x1b]8;;LINK\x07NAME\x1b]8;;\x07
			//      \x1b[1m\x1b]8;;LINK\x07NAME\x1b]8;;\x07
			content: decorated.content,
			// e.g. 01;34 / null
			escapeSequence,
			// e.g. true / false
			usedColorThisTime
		};
	}

	toShortFormat () {
		let result;

		if ('short' in this.cache) {
			result = this.cache['short'];
		}
		else {
			// frills
			let content = this.getFrills();

			// name
			const name = this.getDecoratedName();
			content += name.content;
			if (name.usedColorThisTime) {
				stdout.buffering(true);
				prepNonFilenameText();
				content += stdout.buffering(false);
			}

			// indicator
			if (pref.indicatorStyle != 'none') {
				content += getTypeIndicator(
					this.statOk, this.stat.mode, this.fileType);
			}

			this.cache['short'] = result = {
				content,
				columns: getColumnsForA(content)
			};
		}

		return result;
	}

	toLongFormat () {
		let result;

		if ('long' in this.cache) {
			result = this.cache['long'];
		}
		else {
			let content = '';

			// name
			const name = this.getDecoratedName();
			content += name.content;
			if (name.usedColorThisTime) {
				stdout.buffering(true);
				prepNonFilenameText();
				content += stdout.buffering(false);
			}

			// indicator
			if (this.fileType == 'symbolic_link') {
				if (this.linkName) {
					content += LINK_ARROW;
					const linkName = this.getDecoratedName(true);
					content += linkName.content;

					if (linkName.usedColorThisTime) {
						stdout.buffering(true);
						prepNonFilenameText();
						content += stdout.buffering(false);
					}

					if (pref.indicatorStyle != 'none') {
						content += getTypeIndicator(
							true, this.linkMode, 'unknown');
					}
				}
			}
			else if (pref.indicatorStyle != 'none') {
				content += getTypeIndicator(
					this.statOk, this.stat.mode, this.fileType);
			}

			this.cache['long'] = result = {
				content,
				columns: getColumnsForA(content)
			};
		}

		return result;
	}

	toThumbnailCaptionFormat () {
		let result;

		if ('thumbcap' in this.cache) {
			result = this.cache['thumbcap'];
		}
		else {
			const contents = [];

			/*
			 * frills
			 */
			// TBD: what should be printed?

			/*
			 * name
			 */
			// name
			const name = this.getDecoratedName(false, false);
			contents.unshift(name.content);
			if (name.usedColorThisTime) {
				stdout.buffering(true);
				prepNonFilenameText();
				const seq = stdout.buffering(false);
				contents[0] += seq;
			}

			// indicator
			if (pref.indicatorStyle != 'none') {
				const indicator = getTypeIndicator(
					this.statOk, this.stat.mode, this.fileType);
				contents[0] += indicator;
			}

			/*
			 * store
			 */
			contents.reverse();
			this.cache['thumbcap'] = result = {
				content: contents.join('\n'),
				columns: Math.max.apply(Math, contents.map(c => getColumnsForA(c)))
			};
		}

		return result;
	}

	// collation initializers
	initDirectoryIndicator () {
		if (this.fileType == 'directory' || this.fileType == 'arg_directory') {
			this.cache.isDirectory = 1;
		}
		else if (this.linkMode !== undefined) {
			this.cache.isDirectory = statUtils.S_ISDIR(this.linkMode) ? 1 : 0;
		}
		else if (this.stat.mode !== undefined) {
			this.cache.isDirectory = statUtils.S_ISDIR(this.stat.mode) ? 1 : 0;
		}
		else {
			throw new Error('Cannnot determine if this FileInfo is a directory.');
		}
	}

	initStatPropForCollation (prop) {
		this.cache.number = this.stat[prop] ?? 0;
	}

	initWidthForCollation () {
		const {buf, pad} = getQuotedName(this.name, pref.filenameQuotingOptions, this.quoted);
		this.cache.width = getColumnsFor(pad ? ' ' + buf : buf);
	}

	initNameForCollation () {
		this.cache.nameBuffer = this.name;
		this.cache.name = this.name.toString().normalize('NFC');
	}

	initVersionForCollation () {
		this.initNameForCollation();
	}

	initExtensionForCollation () {
		let lastDotPosition = -1;

		for (let i = this.name.length - 1; i >= 0; i--) {
			if (this.name[i] == 0x2e) {
				lastDotPosition = i;
				break;
			}
		}

		if (lastDotPosition >= 0) {
			this.cache.extensionBuffer = Buffer.concat([
				this.name.subarray(lastDotPosition + 1),
			]);
			this.cache.extension = this.cache.extensionBuffer
				.toString()
				.normalize('NFC');
		}
		else {
			this.cache.extensionBuffer = Buffer.from('');
			this.cache.extension = '';
		}
	}

	initSizeForCollation () {
		this.initNameForCollation();
		this.initStatPropForCollation('size');
	}

	initTimeForCollation () {
		this.initNameForCollation();
		this.initStatPropForCollation(pref.timeType + 'Ns');
	}

	// collators
	collate_name_intl (a) {
		const thisName = this.cache.name;
		const thatName = a.cache.name;
		return runtime.collator.compare(thisName, thatName);
	}

	collate_name_codepoint (a) {
		const thisName = this.cache.name;
		const thatName = a.cache.name;
		return compare(thisName, thatName);
	}

	collate_name_byte (a) {
		const thisName = this.cache.nameBuffer;
		const thatName = a.cache.nameBuffer;
		return Buffer.compare(thisName, thatName);
	}

	collate_extension_intl (a) {
		const thisExtension = this.cache.extension;
		const thatExtension = a.cache.extension;
		return runtime.collator.compare(thisExtension, thatExtension);
	}

	collate_extension_codepoint (a) {
		const thisExtension = this.cache.extension;
		const thatExtension = a.cache.extension;
		return compare(thisExtension, thatExtension);
	}

	collate_extension_byte (a) {
		const thisExtension = this.cache.extensionBuffer;
		const thatExtension = a.cache.extensionBuffer;
		return Buffer.compare(thisExtension, thatExtension);
	}

	collate_number (a) {
		const thisNumber = this.cache.number;
		const thatNumber = a.cache.number;
		return compare(thisNumber, thatNumber);
	}

	collate_version (a) {
		const thisName = this.cache.name;
		const thatName = a.cache.name;
		return versionUtils.filevercmp(thisName, thatName);
	}

	collate_width (a) {
		const thisWidth = this.cache.width;
		const thatWidth = a.cache.width;
		return compare(thisWidth, thatWidth);
	}

	collate_directory (a) {
		const thisDir = this.cache.isDirectory;
		const thatDir = a.cache.isDirectory;
		return compare(thisDir, thatDir);
	}
}

class InodeHash {
	constructor () {
		this.set = new Set;
		this.stack = [];
	}

	getKey (dev, ino) {
		return `${dev}-${ino}`;
	}

	register (dev, ino) {
		const key = this.getKey(dev, ino);
		if (this.set.has(key)) {
			return false;
		}
		else {
			this.set.add(key);
			return true;
		}
	}

	remove (dev, ino) {
		const key = this.getKey(dev, ino);
		return this.set.delete(key);
	}

	pushDevAndInode (dev, ino) {
		this.stack.push({dev, ino});
	}

	popDevAndInode () {
		return this.stack.shift();
	}
}

class HorizontalPrinter {
	constructor () {
		/*
		 * +-----+ +-------+ +-----+ +---+
		 * |  0  | |   1   | |  2  | | 3 |
		 * +-----+ +-------+ +-----+ +---+
		 *
		 * this.columns = [
		 *    7, 9, 7, 5
		 * ];
		 * this.thumbnails = [
		 *    [
		 *       (first line of #0 thumbnail),
		 *       (2nd line of #0 thumbnail),
		 *       (3rd line of #0 thumbnail),
		 *       (4th line of #0 thumbnail),
		 *    ],
		 *       :
		 *       :
		 *    [
		 *       (first line of #3 thumbnail),
		 *       (2nd line of #3 thumbnail),
		 *       (3rd line of #3 thumbnail),
		 *       (4th line of #3 thumbnail),
		 *    ]
		 * ];
		 * this.lines = [
		 *    [ ... (each line of #0 content) ],
		 *       :
		 *       :
		 *    [ ... (each line of #3 content) ]
		 * ];
		 * this.maxLines = (max number of lines of each cell)
		 */
		this.columns = [];
		this.thumbnails = [];
		this.lines = [];
		this.maxLines = THUMBNAIL_LINES;
	}

	push (file, columns) {
		/*
                   <-> -- CELL_RIGHT_MARGIN_COLS
<------columns------->
thumb    text block
-------- ----------
######## [INODE]
######## [BLOCKS]
######## [SCON]
######## [NAME-LED]
[----NAME-REST----]
		*/

		/*
		 * thumbnail
		 */
		const thumbLines = [];
		{
			const thumb = thumbnailUtils.get(file.absoluteName);
			if (thumb.error) {
				error(0, null, `cannot get thumbnail data: ${thumb.error}`);
			}
			if (thumb.source && runtime.isVerbose) {
				console.log(`thumbnail: ${thumb.source}`);
			}
			if (Array.isArray(thumb.content)) {
				thumbLines.push.apply(thumbLines, thumb.content.map(strip => `${strip} `));
			}
			else {
				const thumbContent = thumb.content ?
					/*
					 * ESC 7 - save cursor position (DEC)
					 * ESC 8 - restores the cursor to the last saved position (DEC)
					 */
					`\x1b7${thumb.content}\x1b8` : '';

				if (this.thumbnails.length == 0) {
					// leftmost thumbnail
					thumbLines.push(`${NEWLINES}${UPSEQ}${thumbContent}${ADVANCE}`);
				}
				else {
					// other thumbnails
					thumbLines.push(`${thumbContent}${ADVANCE}`);
				}
			}

			while (thumbLines.length < THUMBNAIL_LINES) {
				thumbLines.push(ADVANCE);
			}
		}

		/*
		 * text block
		 */
		const textBlockContents = Unistring.getFoldedLines(
			file.toThumbnailCaptionFormat().content,
			{
				columns: new Array(THUMBNAIL_LINES)
					.fill(columns - (THUMBNAIL_COLS + CELL_RIGHT_MARGIN_COLS))
					.concat([columns - CELL_RIGHT_MARGIN_COLS]),
				ansi: true
			}
		);

		/*
		 * store all data
		 */
		this.columns.push(columns - CELL_RIGHT_MARGIN_COLS);
		this.thumbnails.push(thumbLines);
		this.lines.push(textBlockContents);
		this.maxLines = Math.max(this.maxLines, textBlockContents.length);
	}

	async print () {
		const lines = [];

		for (let lineIndex = 0; lineIndex < this.maxLines; lineIndex++) {
			const newLine = lineIndex < this.maxLines - 1 ? '\r\n' : '\n';
			let line = '';
			let sixelExists = false;

			for (let itemIndex = 0; itemIndex < this.lines.length; itemIndex++) {
				const currentColumns = this.columns[itemIndex];
				const currentThumbnail = lineIndex >= this.thumbnails[itemIndex].length ?
					'' : this.thumbnails[itemIndex][lineIndex];
				const currentLine = lineIndex >= this.lines[itemIndex].length ?
					'' : this.lines[itemIndex][lineIndex];
				const currentPadding = getSpaces(
					currentColumns
					- (lineIndex < THUMBNAIL_LINES ? THUMBNAIL_COLS : 0)
					- getColumnsForA(currentLine)
				);
				const currentMargin = itemIndex == this.lines.length - 1 ? '' : MARGIN;

				if (currentThumbnail != '' && currentThumbnail.charAt(0) != ' ') {
					sixelExists = true;
				}

				line += currentThumbnail + currentLine + currentPadding + currentMargin;
			}

			if (USE_8452 && sixelExists) {
				lines.push('\x1b[?8452h', line, '\x1b[?8452l', newLine);
			}
			else {
				lines.push(line, newLine);
			}
		}

		await printSequenceChunks(lines.join(''));

		return this.maxLines;
	}

	clear () {
		this.lines.length = this.columns.length = this.thumbnails.length = 0;
		this.maxLines = THUMBNAIL_LINES;
	}
}

/*
 * utility functions
 */

function getSelfType () {
	switch (self.replace(/\.js$/, '').toLowerCase()) {
	case 'dirss':
		return 'LS_MULTI_COL';
	case 'vdirss':
		return 'LS_LONG_FORMAT';
	case 'lss':
	default:
		return 'LS_LS';
	}
}

function getTimeLocale () {
	let result;
	['LC_ALL', 'LC_TIME', 'LANG'].some(name => {
		if (name in process.env) {
			result = process.env[name];
			return true;
		}
		return false;
	});
	return result;
}

function isHardCodedTimeLocale () {
	const locale = getTimeLocale();
	return locale == 'C' || locale == 'POSIX';
}

function getColumnsFor (s, options) {
	if (options) {
		options = {
			...runtime.defaultGCFOptions,
			...options
		};
	}
	else {
		options = runtime.defaultGCFOptions;
	}

	return Unistring.getColumnsFor(s.toString(), options);
};

function getColumnsForA (s, options) {
	if (options) {
		options = {
			...runtime.defaultGCFOptionsA,
			...options
		};
	}
	else {
		options = runtime.defaultGCFOptionsA;
	}

	return Unistring.getColumnsFor(s, options);
};

function compare (a, b) {
	return ((a > b) | 0) - ((a < b) | 0);
}

function setExitStatus (isSerious) {
	if (isSerious) {
		runtime.exitStatus = EXIT_CODE.LS_FAILURE;
	}
	else if (runtime.exitStatus == 0) {
		runtime.exitStatus = EXIT_CODE.LS_MINOR_PROBLEM;
	}
}

function fileFailure (errorObj, isSerious, message, file) {
	setExitStatus(isSerious);
	return error(
		0, errorObj, message,
		file ? quoteUtils.quoteaf(file) : null);
}

function toBuffer (o) {
	if (Buffer.isBuffer(o)) {
		return o;
	}
	if (typeof o == 'string') {
		return Buffer.from(o);
	}
	return o;
}

function getPromptLines () {
	return ((process.env['PS1'] ?? '').match(/\\n/g) ?? []).length + 1;
}

function pagerNeeded (lines, isRecursiveLast) {
	if (pref.recursive && !isRecursiveLast) return false;

	if (lines <= runtime.termInfo.lines - getPromptLines()) {
		//error(0, null, 'lines: %d, terminal lines: %d', lines, runtime.termInfo.lines);
		return false;
	}
	if (pref.pager.includes('none')) {
		//error(0, null, 'pager is disabled');
		return false;
	}
	if (!process.stdout.isTTY) {
		//error(0, null, 'stdout is redirected');
		return false;
	}
	if (stdout.bufferingDepth) {
		//error(0, null, 'buffering is enabled');
		return false;
	}

	return true;
}

function isThumbnailEnabled () {
	if (!pref.printThumbnail) return false;

	if (!runtime.lineLength) {
		error(0, null, 'cannot determine the width of a line');
		return false;
	}
	if (!process.stdout.isTTY) {
		error(0, null, 'stdout is redirected');
		return false;
	}
	if (!runtime.termInfo.da1.sixel) {
		error(0, null, 'this terminal does not seem to support sixel graphics');
		return false;
	}
	if (!THUMBNAIL_COLS || !ADVANCE) {
		error(0, null, 'this terminal returned invalid dimensions');
		return false;
	}
	if (!thumbnailUtils.init()) {
		error(0, null, 'failed to initialize the thumbnailUtils');
		return false;
	}

	return true;
}

function getPagerPrompt (printed, total) {
	if (printed && total) {
		return printf('Listing %d of %d entries', printed, total);
	}
	else if (printed) {
		return printf('Listing %d entries', printed);
	}
	else if (total) {
		return printf('Listing %d entries', total);
	}
	else {
		return 'LSS output';
	}
}

async function waitKeyWithPrompt (prompt) {
	let result;

	stdout.eraseLine();
	stdout(`\x1b[7m${prompt}${PROMPT_BOTTOM}\x1b[m`);
	stdout.showCursor(true);
	result = await waitKeyPressed();
	stdout.eraseLine();
	stdout.showCursor(false);

	switch (result) {
	case 'q': case 'Q':
		return 'quit';
	case '\r': case '\n':
		return 'next-line';
	default:
		return 'next-page';
	}
}

function callPager (data, prompt) {
	function getLessPrompt () {
		return prompt + '?e (END):?pB (%pB\\%)..';
	}

	const pager = pref.pager.reduce((result, current) => {
		if (result) {
			return result;
		}
		if (current == '$PAGER') {
			current = process.env['PAGER'];
		}
		return current;
	}, null);

	let modifiedPrompt = prompt;
	if (pager == 'less') {
		modifiedPrompt = getLessPrompt();
	}
	modifiedPrompt += PROMPT_BOTTOM;

	return less(data, modifiedPrompt, pager);
}

async function callInternalPager (data, title) {
	const terminalRows = runtime.termInfo.lines - getPromptLines();
	let printedLines = 0;
	let line = '';

	loop: for (const chunk of iterateLines(data, true)) {
		const chunkLines = (line.match(/\n/g) || []).length + 1;

		if (printedLines + chunkLines > terminalRows) {
			switch (await waitKeyWithPrompt(title)) {
			case 'quit':
				break loop;
			case 'next-page':
				printedLines = 0;
				break;
			}
		}

		switch (chunk[1]) {
		case 0:
			line += chunk[0];
			break;
		default:
			await printSequenceChunks(line + chunk[0]);
			printedLines += chunkLines;
			line = '';
			break;
		}
	}
}

const getSpaces = (() => {
	let s = '';
	return length => {
		if (length <= 0) {
			return '';
		}
		if (length > s.length) {
			return s = ' '.repeat(length);
		}
		else {
			return s.substring(0, length);
		}
	}
})();

/*
 * color handling functions
 */

function getColorMap (...keys) {
	return keys
		.map(key => pref.colorMap.knownType[key])
		.filter(ind => ind !== null)
		.join('');
}

function isColored (type) {
	const seq = pref.colorMap.knownType[type];
	if (!seq || /^0*$/.test(seq)) {
		return false;
	}
	return true;
}

function isAnyColored (...types) {
	return types.some(isColored);
}

function restoreDefaultColor () {
	putIndicator('lc', 'rc');
}

function setNormalColor () {
	if (pref.printWithColor && isColored('no')) {
		putIndicator('lc', 'no', 'rc');
	}
}

function prepNonFilenameText () {
	if (pref.colorMap.knownType.ec != null) {
		putIndicator('ec');
	}
	else {
		putIndicator('lc', 'rs', 'rc');
	}
}

function toIndicator (sequence) {
	if (sequence != '') {
		const lc = getColorMap('lc');
		const rc = getColorMap('rc');
		return [`${lc}${sequence}${rc}`, `${lc}${rc}`];
	}
	else {
		return ['', ''];
	}
}

function putIndicator (...keys) {
	if (!runtime.usedColor) {
		runtime.usedColor = true;
		initSignals();
	}
	stdout(getColorMap(...keys));
}

function getColorIndicator (file, isSymlinkTarget) {
	let name;
	let mode;
	let linkOk;
	let type;

	if (isSymlinkTarget) {
		name = file.linkName.toString();
		mode = file.linkMode;
		linkOk = file.linkOk ?? null;
	}
	else {
		name = file.name.toString();
		mode = pref.colorSymlinkAsReferent && file.linkOk ?
			file.linkMode :
			file.stat.mode;
		linkOk = file.linkOk;
	}

	if (linkOk === null && isColored('mi')) {
		type = 'mi';
	}
	else if (!file.statOk) {
		type = FILE_TYPE_MAP[file.fileType].indicator;
	}
	else {
		if (statUtils.S_ISREG(mode)) {
			type = 'fi';

			if ((mode & statUtils.bits.S_ISUID)
			 && isColored('su')) {
				type = 'su';
			}
			else if ((mode & statUtils.bits.S_ISGID)
				&& isColored('sg')) {
				type = 'sg';
			}
			else if (isColored('ca') && file.hasCapability) {
				type = 'ca';
			}
			else if ((mode & statUtils.bits.S_IXUGO)
				&& isColored('ex')) {
				type = 'ex';
			}
			else if (1 < file.stat.nlink
				&& isColored('mh')) {
				type = 'mh';
			}
		}
		else if (statUtils.S_ISDIR(mode)) {
			type = 'di';

			if ((mode & statUtils.bits.S_ISVTX)
			 && (mode & statUtils.bits.S_IWOTH)
			 && isColored('tw')) {
				type = 'tw';
			}
			else if ((mode & statUtils.bits.S_IWOTH)
				&& isColored('ow')) {
				type = 'ow';
			}
			else if ((mode & statUtils.bits.S_ISVTX)
				&& isColored('st')) {
				type = 'st';
			}
		}
		else if (statUtils.S_ISLNK(mode)) {
			type = 'ln';
		}
		else if (statUtils.S_ISFIFO(mode)) {
			type = 'pi';
		}
		else if (statUtils.S_ISSOCK(mode)) {
			type = 'so';
		}
		else if (statUtils.S_ISBLK(mode)) {
			type = 'bd';
		}
		else if (statUtils.S_ISCHR(mode)) {
			type = 'cd';
		}
		else if (statUtils.S_ISDOOR(mode)) {
			type = 'do';
		}
		else {
			type = 'or';
		}
	}

	let ext;
	if (type == 'fi') {
		for (const e of pref.colorMap.extensions) {
			if (e.caseIgnore) {
				if (name.toLowerCase().endsWith(e.ext.toLowerCase())) {
					ext = e;
					break;
				}
			}
			else {
				if (name.endsWith(e.ext)) {
					ext = e;
					break;
				}
			}
		}
	}

	if (type == 'ln' && !linkOk) {
		if (pref.colorSymlinkAsReferent || isColored('or')) {
			type = 'or';
		}
	}

	const result = ext ? ext.seq : pref.colorMap.knownType[type];
	//stdout(`<${type}:${result}>`);
	return result;
}

/*
 * file ignore / hide functions
 */

function patternsMatch (patterns, name) {
	return micromatch.isMatch(name, patterns);
}

function fileShouldBeIgnored (name) {
	if (Buffer.isBuffer(name)) {
		name = name.toString();
		if (/\ufffd/.test(name)) {
			return false;
		}
	}

	if (typeof name != 'string') {
		throw new Error('fileShouldBeIgnored: invalid type');
	}

	switch (pref.ignoreMode) {
	case 'default':
		if (name.startsWith('.')) return true;
		if (patternsMatch(pref.hidePatterns, name)) return true;
		if (patternsMatch(pref.ignorePatterns, name)) return true;
		break;

	case 'dot_and_dotdot':
		if (name == '.' || name == '..') return true;
		if (patternsMatch(pref.ignorePatterns, name)) return true;
		break;

	case 'minimal':
		if (patternsMatch(pref.ignorePatterns, name)) return true;
		break;

	default:
		throw new Error(`Unknown ignore mode: ${pref.ignoreMode}`);
	}

	return false;
}

/*
 * sort functions
 */

function sortFileInfos (currentFiles) {
	function createSortExpression (orders) {
		const codes = [];

		for (const order of orders) {
			let keys = [], asc = true;
			if (/^([^\s]+)\s+(asc|desc)/.test(order)) {
				keys.push(RegExp.$1);
				asc = RegExp.$2 == 'asc';
			}
			else {
				keys.push(order);
			}

			if (keys[0] == 'name' || keys[0] == 'extension') {
				keys.push(pref.collationMethod);
			}

			if (asc) {
				codes.push(`a.collate_${keys.join('_')}(b)`);
			}
			else {
				codes.push(`b.collate_${keys.join('_')}(a)`);
			}
		}

		return `return ${codes.join('||')};`;
	}

	function reorder () {
		if (!pref.directoriesFirst && !pref.sortReverse) return;
		let dirs = [], files = [];

		for (const file of currentFiles) {
			if (pref.directoriesFirst) {
				file.initDirectoryIndicator();
				if (file.cache.isDirectory) {
					dirs.push(file);
				}
				else {
					files.push(file);
				}
			}
			else {
				files.push(file);
			}
		}
		if (pref.sortReverse) {
			dirs = dirs.reverse();
			files = files.reverse();
		}
		currentFiles.length = 0;
		currentFiles.push(...dirs);
		currentFiles.push(...files);
	}

	function sort () {
		const orders = [];

		switch (pref.sortType) {
		case 'name':
			orders.push('name');
			break;
		case 'extension':
			orders.push('extension', 'name');
			break;
		case 'width':
			orders.push('width', 'name');
			break;
		case 'version':
			orders.push('version', 'name');
			break;
		case 'size': case 'time':
			orders.push('number', 'name');
			break;
		}

		const needInitDirectry = pref.directoriesFirst;
		const needInitWidth = pref.sortType == 'width'
			 || (runtime.lineLength && (pref.format == 'И' || pref.format == 'Z'));
		for (const file of currentFiles) {
			if (needInitDirectry) {
				file.initDirectoryIndicator();
			}

			if (needInitWidth) {
				file.initWidthForCollation();
			}

			switch (pref.sortType) {
			case 'name':
				file.initNameForCollation();
				break;
			case 'extension':
				file.initExtensionForCollation();
				break;
			case 'version':
				file.initVersionForCollation();
				break;
			case 'size':
				file.initSizeForCollation();
				break;
			case 'time':
				file.initTimeForCollation();
				break;
			}
		}

		if (pref.sortReverse) {
			for (let i = 0; i < orders.length; i++) {
				orders[i] += ' desc';
			}
		}

		if (pref.directoriesFirst) {
			orders.unshift('directory desc');
		}

		const expr = createSortExpression(orders);
		const sorter = new Function('a', 'b', expr);
		currentFiles.sort(sorter);
	}

	if (currentFiles.length < 2) {
		return;
	}

	if (pref.sortType == 'none') {
		reorder();
	}
	else {
		sort();
	}
}

/*
 * format functions
 */

function formatMode (file) {
	let modebuf;
	if (file.statOk) {
		modebuf = statUtils
			.getFileModeString(file.stat)
			.substring(0, 10);
	}
	else {
		modebuf = FILE_TYPE_MAP[file.fileType].mode + '?'.repeat(9);
	}

	switch (file.aclType) {
	case 'lsm_context_only':
		modebuf += '.';
		break;
	case 'yes':
		modebuf += '+';
		break;
	}

	return modebuf;
}

function formatUserOrGroup (name, id, width) {
	const output = typeof name == 'string' ? name : id.toString();
	return printf('%-*s ', width, output);
}

function formatUser (id, width) {
	if (id !== null) {
		return formatUserOrGroup(
			pref.numericIds ? null : idUtils.user(id), id, width);
	}
	else {
		return formatUserOrGroup('?', id, width);
	}
}

function formatGroup (id, width) {
	if (id !== null) {
		return formatUserOrGroup(
			pref.numericIds ? null : idUtils.group(id), id, width);
	}
	else {
		return formatUserOrGroup('?', id, width);
	}
}

function formatSize (file) {
	if (file.statOk
	 && (statUtils.S_ISCHR(file.stat.mode) || statUtils.S_ISBLK(file.stat.mode))) {
		const deviceColumns = runtime.maxColumns.majorDeviceNumber + 2 + runtime.maxColumns.minorDeviceNumber;
		const blanksColumns = runtime.maxColumns.fileSize - deviceColumns;

		const majorMaxColumns = runtime.maxColumns.majorDeviceNumber + Math.max(0, blanksColumns);
		const minorMaxColumns = runtime.maxColumns.minorDeviceNumber;
		return printf('%*s, %*s',
			majorMaxColumns,
			((file.stat.rdev >> 8) & 0xff).toString(),
			minorMaxColumns,
			(file.stat.rdev & 0xff).toString());
	}
	else {
		const sizeString = file.statOk ? humanUtils.humanReadable(
			file.stat.size,
			pref.fileHumanOutputOpts,
			1,
			pref.fileOutputBlockSize) : '?';
		return printf(
			'%*s',
			runtime.maxColumns.fileSize,
			sizeString);
	}
}

function formatInode (file) {
	return file.statOk && file.stat.ino != 0 ?
		file.stat.ino.toString() : '?';
}

function formatDateTimeFromFileInfo (file) {
	let whenTimespec;
	let btimeOk = true;
	let convertedDateTime = '';

	switch (pref.timeType) {
	case 'ctime':
		whenTimespec = file.stat.ctimeNs;
		break;
	case 'mtime':
		whenTimespec = file.stat.mtimeNs;
		break;
	case 'atime':
		whenTimespec = file.stat.atimeNs;
		break;
	case 'birthtime':
		whenTimespec = file.stat['birthtimeNs'];
		if (!whenTimespec) {
			btimeOk = false;
		}
		break;
	default:
		error(EXIT_CODE.LS_FAILURE, null,
			`Unknown timeType: %s`,
			quoteUtils.quote(pref.timeType));
	}

	if (file.statOk && btimeOk) {
		if (runtime.currentTime < whenTimespec) {
			runtime.currentTime = BigInt(Date.now() * 1e6);
		}

		const sixMonthsAgo = runtime.currentTime - HALF_YEAR_NS;
		const recent = sixMonthsAgo < whenTimespec
			&& whenTimespec < runtime.currentTime;

		convertedDateTime = formatDateTimeFromTime(whenTimespec, recent);
	}

	if (convertedDateTime == '') {
		if (whenTimespec) {
			convertedDateTime = (whenTimespec / 1000000n).toFixed();
		}
		else {
			convertedDateTime = '?';
		}

		const dt = formatDateTimeFromTime(process.hrtime.bigint());
		const cols = getColumnsFor(dt);
		convertedDateTime = printf('%*s', cols, value);
	}

	return convertedDateTime;
}

function formatDateTimeFromTime (timeNs, recent) {
	const d = new Date(Number(timeNs / 1000000n));
	const format = pref.longTimeFormat[recent ? 1 : 0]
		.replace(/%b/g, $0 => {
			return runtime.isAbmonAvailable ?
				runtime.shortMonths[d.getMonth()] :
				$0;
		})

		/*
		 * following specifiers are GNU extensions.
		 */

		// %N - nanoseconds
		.replace(/%(\d*)N/g, ($0, $1) => {
			return (timeNs % 1000000000n)
				.toLocaleString(undefined, {
					minimumIntegerDigits: $1 - 0 || 9,
					useGrouping: false
				});
		})
		// %k - implemented in time.js
		// %l - implemented in time.js
		// %q - implemented in time.js
		// %s - implemented in time.js
		;

	return strftime(format, d);
}

function computeUserOrGroupColumns (name, id) {
	if (typeof name == 'string') {
		return getColumnsFor(name);
	}
	else {
		return id.toString().length;
	}
}

function computeUserColumns (id) {
	return computeUserOrGroupColumns(
		pref.numericIds ? null : idUtils.user(id), id);
}

function computeGroupColumns (id) {
	return computeUserOrGroupColumns(
		pref.numericIds ? null : idUtils.group(id), id);
}

/*
 * layout functions
 */

const getQuotedName = (() => {
	const cache = new Map;

	function quotearg_buffer_cache (name, options) {
		const result = cache.get(name)?.get(options);
		if (result) {
			return result;
		}

		let cache1;
		if (cache.has(name)) {
			cache1 = cache.get(name);
		}
		else {
			cache.set(name, cache1 = new Map);
		}

		const content = quoteUtils.quotearg_buffer(name, options);
		cache1.set(options, content);

		return content;
	}

	return function getQuotedName (name, options, needsGeneralQuoting) {
		let buf;
		let quoted;

		if (needsGeneralQuoting !== false) {
			buf = quotearg_buffer_cache(name, options);
			quoted = buf != name;
		}
		else {
			buf = name.toString();
			quoted = false;
		}

		const pad = runtime.alignVariableOuterQuotes
			&& runtime.cwdSomeQuoted
			&& !quoted;

		return {buf, pad}
	}
})();

function getHyperlink (linkText, absoluteName, quoted) {
	const hn = fileEscape(runtime.hostname, false);
	const nn = fileEscape(absoluteName, true);

	/*
	 * NOTE: This OSC 8 escape sequence is not widely supported.
	 *
	 * Hyperlinks (a.k.a. HTML-like anchors) in terminal emulators
	 *   https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
	 *
	 * OSC 8 adoption in terminal emulators
	 *   https://github.com/Alhadis/OSC8-Adoption
	 */
	const linkHeader = printf(
		'\x1b]8;;file://%s%s%s\x07',
		hn,
		nn.startsWith('/') ? '' : '/',
		nn);
	const linkFooter = '\x1b]8;;\x07';

	if (quoted) {
		/*
		 * original buf: "foo"
		 *   linked buf: "\x1b]8;;LINK\x07foo\x1b]8;;\x07"
		 */
		return linkText.replace(/^(.)(.*)(.)$/u, ($0, left, text, right) => {
			return `${left}${linkHeader}${text}${linkFooter}${right}`;
		});
	}
	else {
		return `${linkHeader}${linkText}${linkFooter}`;
	}
}

function getDecoratedName (
  name, options, needsGeneralQuoting,
  escapeSequence, allowPad, absoluteName) {
	const {buf, pad} = getQuotedName(
		name, options, needsGeneralQuoting);
	const quoted = runtime.alignVariableOuterQuotes
		&& runtime.cwdSomeQuoted
		&& !pad;
	let result = '';

	if (pad && allowPad) {
		result += ' ';
	}
	if (escapeSequence) {
		stdout.buffering(true);
		printColorIndicator(escapeSequence);
		result += stdout.buffering(false);
	}
	if (pref.printHyperlink && absoluteName != null) {
		result += getHyperlink(buf, absoluteName, quoted);
	}
	else {
		result += buf;
	}

	return {
		content: result,
		quoted,
		pad
	};
}

function getTypeIndicator (statOk, mode, type) {
	let c;

	if (statOk ? statUtils.S_ISREG(mode) : type == 'normal') {
		if (statOk && pref.indicatorStyle == 'classify'
		 && (mode & statUtils.bits.S_IXUGO)) {
			c = '*';
		}
		else {
			c = '';
		}
	}
	else {
		if (statOk ? statUtils.S_ISDIR(mode)
		 : (type == 'directory' || type == 'arg_directory')) {
			c = '/';
		}
		else if (pref.indicatorStyle == 'slash') {
			c = '';
		}
		else if (statOk ? statUtils.S_ISLNK(mode)
		 : type == 'symbolic_link') {
			c = '@';
		}
		else if (statOk ? statUtils.S_ISFIFO(mode)
		 : type == 'fifo') {
			c = '|';
		}
		else if (statOk ? statUtils.S_ISSOCK(mode)
		 : type == 'sock') {
			c = '=';
		}
		else if (statOk && statUtils.S_ISDOOR(mode)) {
			c = '>';
		}
		else {
			c = '';
		}
	}

	return c;
}

function calculateColumns (files, byColumns) {
	function getLongestFoldedLine (s, columns) {
		const result = gflCache.get(s)?.get(columns);
		if (result) {
			return result;
		}

		let cache1;
		if (gflCache.has(s)) {
			cache1 = gflCache.get(s);
		}
		else {
			gflCache.set(s, cache1 = new Map);
		}

		const content = Unistring
			.getFoldedLines(s, {columns, ansi: true})
			.reduce((result, current) => {
				return Math.max(
					result,
					getColumnsForA(current.replace(/\s+$/, '')));
			}, 0);
		cache1.set(columns, content);

		return content;
	}

	function calculateThresholdColumns (files) {
		const averageLength = files.reduce((result, file, index) => {
			const col = file.toThumbnailCaptionFormat().columns;
			return (index * result + col) / (index + 1);
		}, 0);
		const sd = Math.sqrt(
			files.reduce((result, file) => {
				const col = file.toThumbnailCaptionFormat().columns;
				return result + Math.pow(col - averageLength, 2);
			}, 0) / files.length
		);
		const thresholdColumns = Math.round(
			(FOLD_THRESHOLD_DEVIATION - 50) / 10 * sd + averageLength
		);

		return thresholdColumns;
	}

	function getTextColumnLength (files) {
		return files.reduce((result, current) => {
			return Math.max(
				result,
				current.toShortFormat().columns + CELL_RIGHT_MARGIN_COLS);
		}, 0);
	}

	function getThumbnailColumnLength (files) {
		const threshold = Math.max(
			THUMBNAIL_CAPTION_MIN_COLS,
			Math.min(calculateThresholdColumns(files), halfScreenThreshold));

		return files.reduce((result, current) => {
			let {content, columns} = current.toThumbnailCaptionFormat();

			if (columns > threshold) {
				columns = getLongestFoldedLine(content, threshold);
			}

			return Math.max(
				result,
				columns + THUMBNAIL_COLS + CELL_RIGHT_MARGIN_COLS);
		}, 0);
	}

	const maxCols = 0 < runtime.maxIndex && runtime.maxIndex < files.length ?
		runtime.maxIndex : files.length;
	const halfScreenThreshold = Math.trunc(runtime.lineLength / 2)
		- THUMBNAIL_COLS - CELL_RIGHT_MARGIN_COLS;
	const data = [];
	const gflCache = new Map;

	// generate matrices for all possible columns
	for (let cols = 1; cols <= maxCols; cols++) {
		const matrix = [];
		const rows = Math.ceil(files.length / cols);

		for (let col = 0; col < cols; col++) {
			const rowArray = [];
			for (let row = 0; row < rows; row++) {
				const index = byColumns ?
					col * rows + row :
					row * cols + col;
				index < files.length && rowArray.push(files[index]);
			}
			if (rowArray.length) {
				matrix[col] = rowArray;
			}
		}

		if (matrix.length == cols) {
			data.push(matrix);
		}
	}

	// find the best columns while reducing matrices
	for (let i = data.length - 1; i >= 0; i--) {
		const matrix = data[i];

		for (let col = 0; col < matrix.length; col++) {
			matrix[col] = pref.printThumbnail ?
				getThumbnailColumnLength(matrix[col]) :
				getTextColumnLength(matrix[col]);
		}
		matrix[matrix.length - 1] -= CELL_RIGHT_MARGIN_COLS;

		const total = matrix.reduce((result, current) => result + current);
		if (total <= runtime.lineLength) {
			return {cols: matrix.length, columnArray: matrix};
		}
	}

	return {cols: 1, columnArray: null};
}

// print functions
async function printSequenceChunks (s) {
	if (stdout.bufferingDepth == 0) {
		let prevType = -1;
		for (const [chunk, type] of splitDCSSequences(s)) {
			stdout(chunk);
			if (prevType == 2 && type != 2) {
				await delay0();
			}
			prevType = type;
		}
	}
	else {
		stdout(s);
	}
}

function printColorIndicator (escapeSequence) {
	if (escapeSequence) {
		isColored('no') && restoreDefaultColor();
		putIndicator('lc');
		stdout(escapeSequence);
		putIndicator('rc');
		return true;
	}
	return false;
}

function printIndentSpaces (from, to) {
	const ts = pref.tabSize;
	while (from < to) {
		if (ts != 0
		 && Math.trunc(to / ts) > Math.trunc((from + 1) / ts)) {
			stdout('\t');
			from += ts - from % ts;
		}
		else {
			stdout(' ');
			from++;
		}
	}
}

function printFrillsAndDecoratedName (file) {
	/*
	 * NOTE: this method is called from:
	 *   printWithSeparator (format: 'И', 'Z', 'Z,')
	 *   printHorizontal    (format: 'Z')
	 *   printManyPerLine   (format: 'И')
	 *   printOnePerLine    (format: '1')
	 */

	/*
	 * NOTE:
	 *
	 * structure of file.toShortFormat().content is:
	 *   [normal-color]? [inode]? [blocksize]? [scontext]? [DecoratedName] [Indicator]
	 *
	 * DecoratedName patterns:
	 *   [pad]? [color]? [hyperlink]? [name] [hyperlink-reset]? [color-reset]?
	 *
	 * name patterns:
	 *   "name"
	 *   "'name'"
	 */

	setNormalColor();
	const s = file.toShortFormat();
	stdout(s.content);
	return s;
}

function printLongFormat (file, prevLeadColumns) {
	let buf = [];

	// inode
	if (pref.printInode) {
		buf.push(printf('%*s ',
			runtime.maxColumns.inode,
			formatInode(file)));
	}

	// block size
	if (pref.printBlockSize) {
		const blocks = file.statOk ? humanUtils.humanReadable(
			statUtils.ST_NBLOCKS(file.stat),
			pref.humanOutputOpts,
			file.stat.blksize,
			pref.outputBlockSize) : '?';
		buf.push(printf('%*s ',
			runtime.maxColumns.blockSize,
			blocks));
	}

	// mode and number of links
	buf.push(printf('%s %*s ',
		formatMode(file),
		runtime.maxColumns.nlink,
		file.statOk ? file.stat.nlink.toString() : '?'));

	// owner / group / author / security context
	if (pref.printOwner) {
		buf.push(formatUser(file.stat.uid, runtime.maxColumns.owner));
	}
	if (pref.printGroup) {
		buf.push(formatGroup(file.stat.gid, runtime.maxColumns.group));
	}
	if (pref.printAuthor) {
		buf.push(formatUser(file.stat.author, runtime.maxColumns.author));
	}
	if (pref.printScontext) {
		buf.push(formatUserOrGroup(file.scontext, 0, runtime.maxColumns.scontext));
	}

	// device number for char or block device / file size
	buf.push(formatSize(file), ' ');

	// modified time (or other format times)
	buf.push(formatDateTimeFromFileInfo(file), ' ');

	// output once here
	stdout(buf = buf.join(''));

	// ouput file name
	if (runtime.lineLength > 0) {
		let leadColumns;
		if (prevLeadColumns) {
			leadColumns = prevLeadColumns;
		}
		else {
			const pad = runtime.alignVariableOuterQuotes
				&& runtime.cwdSomeQuoted
				&& !file.quoted ? 1 : 0;
			leadColumns = getColumnsFor(buf) + pad;
		}

		const restColumns = runtime.lineLength - leadColumns;
		if (restColumns >= 10) {
			const folded = Unistring.getFoldedLines(
				file.toLongFormat().content,
				{columns: restColumns, ansi: true});
			stdout(folded.join(`\n${getSpaces(leadColumns)}`));
			return {lines: folded.length, leadColumns};
		}
	}

	stdout(file.toLongFormat().content);
	return {lines: 1, leadColumns: 0};
}

printLongFormat.header = function () {
	const FORMAT = '%2$-*1$.*1$s';
	const colors = toIndicator(extraPref?.SGR?.long?.header || '');
	let buf = [];

	// inode
	if (pref.printInode) {
		buf.push(printf(
			FORMAT,
			runtime.maxColumns.inode,
			'inode'));
	}

	// block size
	if (pref.printBlockSize) {
		buf.push(printf(
			FORMAT,
			runtime.maxColumns.blockSize,
			'block'));
	}

	// mode
	buf.push(printf(
		'%-10.10s%s',
		'mode',
		pref.anyHasAcl ? ' ' : ''));

	// link number
	buf.push(printf(
		FORMAT,
		runtime.maxColumns.nlink,
		'link'));

	// owner
	if (pref.printOwner) {
		buf.push(printf(FORMAT, runtime.maxColumns.owner, 'owner'));
	}
	// group
	if (pref.printGroup) {
		buf.push(printf(FORMAT, runtime.maxColumns.group, 'group'));
	}
	// author
	if (pref.printAuthor) {
		buf.push(printf(FORMAT, runtime.maxColumns.author, 'author'));
	}
	// security context
	if (pref.printScontext) {
		buf.push(printf(FORMAT, runtime.maxColumns.scontext, 'context'));
	}

	// size
	buf.push(printf(
		FORMAT,
		runtime.maxColumns.fileSize,
		'size'));

	// time
	let timename;
	switch (pref.timeType) {
	case 'ctime': timename = 'changed at'; break;
	case 'mtime': timename = 'modified at'; break;
	case 'atime': timename = 'accessed at'; break;
	case 'birthtime': timename = 'created at'; break;
	}
	buf.push(printf(
		FORMAT,
		getColumnsFor(formatDateTimeFromTime(process.hrtime.bigint())),
		timename));

	// name
	let namebuf;
	buf = buf.map(a => `${colors[0]}${a}${colors[1]}`).join(' ');
	if (runtime.lineLength) {
		namebuf = printf(FORMAT, runtime.lineLength - (getColumnsForA(buf) + 1), 'name');
	}
	else {
		namebuf = 'name';
	}
	namebuf = ` ${colors[0]}${namebuf}${colors[1]}`;
	buf += namebuf;

	// print whole line
	stdout(buf);
	stdout(runtime.eolbyte);
};

async function printLongFormatWithThumbnail (file, index) {
	{
		/*
		 * ESC 7 - save cursor position (DEC)
		 * ESC 8 - restores the cursor to the last saved position (DEC)
		 */
		const thumb = thumbnailUtils.get(file.absoluteName);
		if (thumb.error) {
			error(0, null, `cannot get thumbnail data: ${thumb.error}`);
		}
		if (thumb.source && runtime.isVerbose) {
			console.log(`thumbnail: ${thumb.source}`);
		}
		if (Array.isArray(thumb.content)) {
			await printSequenceChunks(
				`${NEWLINES}${UPSEQ}\x1b7${thumb.content.join('')}\x1b8`);
		}
		else if (thumb.content) {
			await printSequenceChunks(
				`${NEWLINES}${UPSEQ}\x1b7${thumb.content}\x1b8`);
		}
	}

	/*
thumb    A block                         B block
-------- ------------------------------- -------
######## [MODE]                   [SIZE] [NAME]
######## [OWNER]:[GROUP] [AUTHOR] [SCON]
########                          [TIME]
########       [INODE], [BLOCKS], [LINK]
	 */

	const ablock = new Array(THUMBNAIL_LINES);

	// line #1: mode and size
	const mode = formatMode(file);
	const size = formatSize(file);
	ablock[0] = `${mode}  ${size}`;

	// line #2: owner, group, author and security context
	ablock[1] = [];
	if (pref.printOwner && pref.printGroup) {
		ablock[1].push(printf('%s:%s',
			idUtils.user(file.stat.uid),
			idUtils.group(file.stat.gid)));
	}
	else if (pref.printOwner) {
		ablock[1].push(idUtils.user(file.stat.uid));
	}
	else if (pref.printGroup) {
		ablock[1].push(idUtils.group(file.stat.gid));
	}
	if (pref.printAuthor) {
		ablock[1].push(idUtils.user(file.stat.uid));
	}
	if (pref.printScontext) {
		ablock[1].push(file.scontext);
	}
	ablock[1] = ablock[1].join(' ');

	// line #3: time
	ablock[2] = formatDateTimeFromFileInfo(file);

	// line #4: inode, block size, number of links
	ablock[3] = [];
	if (pref.printInode) {
		ablock[3].push(printf('#%*s', runtime.maxColumns.inode, formatInode(file)));
	}
	if (pref.printBlockSize) {
		const blocks = file.statOk ? humanUtils.humanReadable(
			statUtils.ST_NBLOCKS(file.stat),
			pref.humanOutputOpts,
			file.stat.blksize,
			pref.outputBlockSize) : '?';
		ablock[3].push(printf('%*s blocks', runtime.maxColumns.blockSize, blocks));
	}
	ablock[3].push(printf('%*s links',
		runtime.maxColumns.nlink,
		file.statOk ? file.stat.nlink.toString() : '?'));
	ablock[3] = ablock[3].join(', ');

	// compute max columns of A-block
	const maxCols = ablock.reduce((result, current) => {
		return Math.max(result, getColumnsFor(current));
	}, 0);

	// B-block
	const bblock = Unistring.getFoldedLines(
		file.toLongFormat().content,
		{
			columns: runtime.lineLength - (THUMBNAIL_COLS + maxCols + CELL_RIGHT_MARGIN_COLS),
			ansi: true
		}
	);

	// setup colors
	const primaryColor = toIndicator(extraPref?.SGR?.long_thumbnail?.primary || '');
	const secondaryColor = toIndicator(extraPref?.SGR?.long_thumbnail?.secondary || '32');
	const colors = new Array(4).fill(secondaryColor).fill(primaryColor, 0, 1);
	const cellHeight = Math.max(ablock.length, bblock.length);

	// output
	for (let i = 0; i < cellHeight; i++) {
		if (i < ablock.length && i < bblock.length) {
			stdout(ADVANCE);
			stdout(printf(
				'%s%*.*s%s %s%s',
				colors[i][0],
				maxCols, maxCols,
				ablock[i],
				colors[i][1],
				i == 0 && file.quoted ? '' : ' ',
				bblock[i]));
		}
		else if (i < ablock.length) {
			stdout(ADVANCE);
			stdout(printf(
				'%s%*.*s%s',
				colors[i][0],
				maxCols, maxCols,
				ablock[i],
				colors[i][1]));
		}
		else if (i < bblock.length) {
			stdout.cursorForward(THUMBNAIL_COLS + maxCols + CELL_RIGHT_MARGIN_COLS);
			stdout(bblock[i]);
		}

		if (i < cellHeight - 1) {
			stdout('\r\n');
		}
		else {
			stdout('\n');
		}
	}

	return cellHeight;
}

async function printDirectory (name, realName, isCommandlineArg, needPrintDirectoryName) {
	const files = [];
	let dirp;
	let totalBlocks = 0;
	let fileCount = 0;

	clearFiles();

	if (pref.recursive || needPrintDirectoryName) {
		if (stdout.buffered) {
			if (process.stdout.isTTY) {
				stdout(`\x1b[9m${' '.repeat(runtime.termInfo.columns)}\x1b[29m\n`);
			}
			else {
				stdout('\n');
			}
		}

		const escapeSequence = pref.printWithColor ?
			pref.colorMap.knownType['di'] :
			null;
		const absoluteName = pref.printHyperlink ?
			nodePath.normalize(name.toString()) :
			null;

		stdout(getDecoratedName(
			realName ?? name,
			pref.dirnameQuotingOptions,
			true,
			escapeSequence,
			true,
			absoluteName
		).content);

		if (escapeSequence) {
			prepNonFilenameText();
		}

		stdout(': ');
	}

	try {
		dirp = fs.opendirSync(
			name,
			{encoding: 'buffer'});
	}
	catch (err) {
		fileFailure(
			err, isCommandlineArg,
			`cannot open directory %s`,
			name
		);
		return;
	}

	try {
		if (runtime.activeDirSet) {
			let stat;
			try {
				stat = fs.statSync(name);
			}
			catch (err) {
				fileFailure(
					err, isCommandlineArg,
					`cannot determine device and inode of %s`,
					name
				);
				return;
			}

			/*
			 * If we've already visited this dev/inode pair, warn that
			 * we've found a loop, and do not process this directory.
			 */
			if (!runtime.activeDirSet.register(stat.dev, stat.ino)) {
				stdout(`: not listing already-listed directory\n`);
				setExitStatus(true);
				return;
			}

			runtime.activeDirSet.pushDevAndInode(stat.dev, stat.ino);
		}

		if (pref.recursive || needPrintDirectoryName) {
			stdout('\n');
		}

		/*
		 * Read the directory entries, and insert the subfiles into the
		 * 'files' array.
		 */
		while (true) {
			let next;
			try {
				switch (fileCount++) {
				case 0: next = new NullDirent('.'); break;
				case 1: next = new NullDirent('..'); break;
				default: next = dirp.readSync(); break;
				}

				if (!next) {
					break;
				}
				if (fileShouldBeIgnored(next.name)) {
					continue;
				}

				let type;
				if (next.isBlockDevice()) {
					type = 'blockdev';
				}
				else if (next.isCharacterDevice()) {
					type = 'chardev';
				}
				else if (next.isDirectory()) {
					type = 'directory';
				}
				else if (next.isFIFO()) {
					type = 'fifo';
				}
				else if (next.isSymbolicLink()) {
					type = 'symbolic_link';
				}
				else if (next.isFile()) {
					type = 'normal';
				}
				else if (next.isSocket()) {
					type = 'sock';
				}

				if (pref.selectTypes
				 && pref.selectTypes.size
				 && !pref.selectTypes.has(type)) {
					continue;
				}
				if (pref.dropTypes
				 && pref.dropTypes.has(type)) {
					continue;
				}

				const f = gobbleFile(name, next.name, type, 0);
				if (!f) continue;
				totalBlocks += f.blocks;

				/*
				 * In this narrow case, print out each name right away,
				 * so ls uses constant memory while processing the entries of
				 * this directory.  Useful when there are many (millions)
				 * of entries in a directory.
				 */
				if (pref.format == '1'
				 && pref.sortType == 'none'
				 && !pref.printBlockSize
				 && !pref.recursive) {
					await printCurrentFiles(name, [f.file]);
					clearFiles();
				}
				else {
					files.push(f.file);
				}
			}
			catch (err) {
				fileFailure(
					err, isCommandlineArg,
					`reading directory`
				);
				if (err.errno != 'EOVERFLOW') {
					break;
				}
			}
		}
	}
	finally {
		if (dirp) {
			try {
				dirp.closeSync();
			}
			catch (err) {
				fileFailure(
					err, isCommandlineArg,
					`closing directory`
				);
			}
			finally {
				dirp = null;
			}
		}
	}

	/*
	 * Sort the directory contents.
	 */
	sortFileInfos(files);

	/*
	 * If any member files are subdirectories, perhaps they should have their
	 * contents listed rather than being mentioned here as files.
	 */
	if (pref.recursive) {
		extractDirsFromFiles(files, name, false);
	}

	let header;
	if (pref.format == 'long' || pref.printBlockSize) {
		const blockString = humanUtils.humanReadable(
			totalBlocks,
			pref.humanOutputOpts,
			files.length ? files[0].stat.blksize : 4096,
			pref.outputBlockSize);
		header = `total ${blockString}${runtime.eolbyte}`;
	}

	if (files.length) {
		await printCurrentFiles(name, files, header);
	}
	else if (header) {
		stdout(header);
	}
}

function printCurrentFiles (path, files, header) /* returns promise */ {
	async function printContent (content, lines) {
		if (process.stdout.isTTY
		 && stdout.bufferingDepth == 0
		 && !pref.recursive
		 && !pref.pager.includes('none')
		 && lines > runtime.termInfo.lines - getPromptLines()) {
			await callPager(content, getPagerPrompt(0, files.length));
		}
		else {
			stdout(content);
		}
	}

	function printProgress (consumedTime, printedEntries) {
		if (process.stdout.isTTY
		 && !pref.recursive
		 && consumedTime >= LIMIT_MSECS_TO_PRINT_STRIP_STATUS
		 && printedEntries < files.length) {
			process.stdout.write(printf(
				'printed %d of %d entries',
				printedEntries, files.length));
		}
	}

	/*
	 * simple printers
	 */

	async function printOnePerLine () {
		let printedLines = 0, content;

		stdout.buffering(true);
		try {
			if (header) {
				stdout(header);
				printedLines++;
			}

			if (runtime.lineLength) {
				for (const file of files) {
					const folded = Unistring.getFoldedLines(
						file.toShortFormat().content,
						{columns: runtime.lineLength, ansi: true});
					printedLines += folded.length;
					setNormalColor();
					stdout(folded.join('\n') + runtime.eolbyte);
				}
			}
			else {
				for (const file of files) {
					printFrillsAndDecoratedName(file);
					stdout(runtime.eolbyte);
				}
				printedLines += files.length;
			}
		}
		finally {
			content = stdout.buffering(false);
		}

		await printContent(content, printedLines);
	}

	async function printWithSeparator (separator) {
		let printedLines = 0, content;

		stdout.buffering(true);
		try {
			if (header) {
				stdout(header);
				printedLines++;
			}

			for (let filesno = 0, pos = 0; filesno < files.length; filesno++) {
				const len = runtime.lineLength ? files[filesno].toShortFormat().columns : 0;

				if (filesno) {
					let lineSeparator;
					if (!runtime.lineLength
					 || (pos + len + 2 < runtime.lineLength && pos <= 0x10000 - len - 2)) {
						pos += 2;
						lineSeparator = ' ';
					}
					else {
						printedLines += runtime.lineLength ?
							Math.ceil((pos + len) / runtime.lineLength) : 1;
						pos = 0;
						lineSeparator = runtime.eolbyte;
					}
					stdout(separator + lineSeparator);
				}

				printFrillsAndDecoratedName(files[filesno]);
				pos += len;
			}

			stdout(runtime.eolbyte);
		}
		finally {
			content = stdout.buffering(false);
		}

		await printContent(content, printedLines);
	}

	/*
	 * by long format
	 */

	async function printLongConventional () {
		let printedLines = 0, content;

		stdout.buffering(true);
		try {
			if (header) {
				stdout(header);
				printedLines++;
			}
			if (pref.printHeader) {
				printLongFormat.header();
				printedLines++;
			}

			let leadColumns = 0;
			for (const file of files) {
				setNormalColor();
				const result = printLongFormat(file, leadColumns);
				stdout(runtime.eolbyte);
				printedLines += result.lines;
				leadColumns = result.leadColumns;
			}
		}
		finally {
			content = stdout.buffering(false);
		}

		await printContent(content, printedLines);
	}

	/*
	 * by horizontal columns
	 */

	async function printHorizontalConventional () {
		const {cols, columnArray} = calculateColumns(files);
		if (cols == 1) {
			return await printOnePerLine();
		}

		let printedLines = 0, content;

		stdout.buffering(true);
		try {
			if (header) {
				stdout(header);
				printedLines++;
			}

			let nameLength = printFrillsAndDecoratedName(files[0]).columns;
			let maxNameLength = columnArray[0];
			let pos = 0;

			for (let i = 1; i < files.length; i++) {
				const col = i % cols;
				if (col == 0) {
					stdout(runtime.eolbyte);
					pos = 0;
					printedLines++;
				}
				else {
					printIndentSpaces(pos + nameLength, pos + maxNameLength);
					pos += maxNameLength;
				}

				nameLength = printFrillsAndDecoratedName(files[i]).columns;
				maxNameLength = columnArray[col];
			}

			stdout(runtime.eolbyte);
			printedLines++;
		}
		finally {
			content = stdout.buffering(false);
		}

		await printContent(content, printedLines);
	}

	/*
	 * by vertical columns
	 */

	async function printManyPerLineConventional () {
		const {cols, columnArray} = calculateColumns(files, true);
		if (cols == 1) {
			return await printOnePerLine();
		}

		let printedLines = 0, content;

		stdout.buffering(true);
		try {
			if (header) {
				stdout(header);
				printedLines++;
			}

			for (let row = 0, rows = Math.ceil(files.length / cols); row < rows; row++) {
				let col = 0;
				let filesno = row;
				let pos = 0;

				while (true) {
					const nameLength = printFrillsAndDecoratedName(files[filesno]).columns;
					const maxNameLength = columnArray[col++];

					filesno += rows;
					if (filesno >= files.length) break;

					printIndentSpaces(pos + nameLength, pos + maxNameLength);
					pos += maxNameLength;
				}

				stdout(runtime.eolbyte);
				printedLines++;
			}
		}
		finally {
			content = stdout.buffering(false);
		}

		await printContent(content, printedLines);
	}

	/*
	 * with thumbnails
	 */

	async function printLongWithThumbnail () {
		const terminalRows = runtime.termInfo.lines - getPromptLines();
		const pagerEnabled = pagerNeeded(files.length * THUMBNAIL_LINES);
		let printedLines = 0;

		if (header) {
			stdout(header);
			printedLines++;
		}

		loop: for (let i = 0; i < files.length; i++) {
			// 'more' job
			if (pagerEnabled && printedLines + THUMBNAIL_LINES > terminalRows) {
				switch (await waitKeyWithPrompt(getPagerPrompt(i, files.length))) {
				case 'quit':
					break loop;
				case 'next-page':
					printedLines = 0;
					break;
				}
			}

			// print current entry
			!pref.recursive && process.stdout.isTTY && stdout.eraseLine();
			setNormalColor();
			printedLines += await printLongFormatWithThumbnail(files[i], i);
		}
	}

	async function printHorizontalWithThumbnail () /* returns promise */ {
		const {cols, columnArray} = calculateColumns(files);
		const terminalRows = runtime.termInfo.lines - 2;
		const rows = Math.ceil(files.length / cols);
		const pagerEnabled = pagerNeeded(rows * THUMBNAIL_LINES);
		let printedLines = 0, printedEntries = 0;

		if (header) {
			stdout(header);
			printedLines++;
		}

		loop: for (let row = 0; row < rows; row++) {
			const packer = new HorizontalPrinter;
			let consumedTime;

			// prepare current strip
			{
				const startTime = Date.now();
				let col = 0, filesno = row * cols;
				do {
					const pad = col + 1 >= cols ? CELL_RIGHT_MARGIN_COLS : 0;
					packer.push(
						files[filesno],
						columnArray[col++] + pad);
				} while (++filesno < Math.min(files.length, row * cols + cols));
				consumedTime = Date.now() - startTime;
			}

			// 'more' job
			if (pagerEnabled && printedLines + packer.maxLines > terminalRows) {
				switch (await waitKeyWithPrompt(getPagerPrompt(printedEntries, files.length))) {
				case 'quit':
					break loop;
				case 'next-page':
					printedLines = 0;
					break;
				}
			}

			// print current strip
			!pref.recursive && process.stdout.isTTY && stdout.eraseLine();
			await packer.print();
			printedLines += packer.maxLines;
			printedEntries += packer.columns.length;
			printProgress(consumedTime, printedEntries);
		}
	}

	async function printManyPerLineWithThumbnail () {
		const {cols, columnArray} = calculateColumns(files, true);
		const terminalRows = runtime.termInfo.lines - 2;
		const rows = Math.ceil(files.length / cols);
		const pagerEnabled = pagerNeeded(rows * THUMBNAIL_LINES);
		let printedLines = 0, printedEntries = 0;

		if (header) {
			stdout(header);
			printedLines++;
		}

		loop: for (let row = 0; row < rows; row++) {
			const packer = new HorizontalPrinter;
			let consumedTime;

			// prepare current strip
			{
				const startTime = Date.now();
				let col = 0, filesno = row;
				do {
					const pad = col + 1 >= cols ? CELL_RIGHT_MARGIN_COLS : 0;
					packer.push(
						files[filesno],
						columnArray[col++] + pad);
				} while ((filesno += rows) < files.length);
				consumedTime = Date.now() - startTime;
			}

			// 'more' job
			if (pagerEnabled && printedLines + packer.maxLines > terminalRows) {
				switch (await waitKeyWithPrompt(getPagerPrompt(printedEntries, files.length))) {
				case 'quit':
					break loop;
				case 'next-page':
					printedLines = 0;
					break;
				}
			}

			// print current strip
			!pref.recursive && process.stdout.isTTY && stdout.eraseLine();
			await packer.print();
			printedLines += packer.maxLines;
			printedEntries += packer.columns.length;
			printProgress(consumedTime, printedEntries);
		}
	}

	let result;

	stdout.showCursor(false);

	switch (pref.format) {
	case 'И':
		if (runtime.lineLength) {
			if (isThumbnailEnabled()) {
				result = printManyPerLineWithThumbnail();
			}
			else {
				result = printManyPerLineConventional();
			}
		}
		else {
			result = printWithSeparator(' ');
		}
		break;

	case 'long':
		if (isThumbnailEnabled()) {
			result = printLongWithThumbnail();
		}
		else {
			result = printLongConventional();
		}
		break;

	case 'Z':
		if (runtime.lineLength) {
			if (isThumbnailEnabled()) {
				result = printHorizontalWithThumbnail();
			}
			else {
				result = printHorizontalConventional();
			}
		}
		else {
			result = printWithSeparator(' ');
		}
		break;

	case '1':
		result = printOnePerLine();
		break;

	case 'Z,':
		result = printWithSeparator(',');
		break;
	}

	return result.finally(() => {
		stdout.showCursor(true);
		runtime.totalFileNum += files.length;
	});
}

/*
 * ls core functions
 */

function clearFiles () {
	runtime.cwdSomeQuoted = false;
	runtime.anyHasAcl = false;

	for (const i in runtime.maxColumns) {
		runtime.maxColumns[i] = 0;
	}
}

function gobbleFileFromCommandlineArg (dirName, fileName, fileType, inode) {
	return gobbleFileCore(dirName, fileName, fileType, inode, true);
}

function gobbleFile (dirName, fileName, fileType, inode) {
	return gobbleFileCore(dirName, fileName, fileType, inode, false);
}

function gobbleFileCore (dirName, fileName, fileType, inode, isCommandlineArg) {
	/*
	 * When coloring a directory (we may know the type from direct.d_type),
	 * we have to stat it in order to indicate sticky and/or other-writable
	 * attributes.
	 */
	function isColoredDirectory () {
		return fileType == 'directory'
			&& pref.printWithColor
			&& isAnyColored('ow', 'st', 'tw');
	}

	/*
	 * When dereferencing symlinks, the inode and type must come from stat,
	 * but readdir provides the inode and type of lstat.
	 */
	function isStatRequiredSymblicLink () {
		return (pref.printInode || runtime.formatNeedsType)
			&& (fileType == 'symbolic_link' || fileType == 'unknown')
			&& (pref.dereference == 'always'
				|| pref.colorSymlinkAsReferent
				|| runtime.checkSymlinkMode);
	}

	/*
	 * This is so that --color ends up highlighting files with these mode bits
	 * set even when options like -F are not specified.  Note we do a redundant
	 * stat in the very unlikely case where C_CAP is set but not the others.
	 */
	function ice2 () {
		return pref.printWithColor
			&& isAnyColored('ex', 'su', 'sg', 'ca');
	}

	/*
	 * --indicator-style=classify (aka -F)
	 * requires that we stat each regular file to see if it's executable.
	 */
	function ice1 () {
		return fileType == 'normal'
			&& (pref.indicatorStyle == 'classify' || ice2());
	}

	/*
	 * Command line dereferences are already taken care of by the above
	 * assertion that the inode number is not yet known.
	 */
	function isStatRequiredFileType () {
		return runtime.formatNeedsType
			&& (fileType == 'command_line_arg' || fileType == 'unknown' || ice1());
	}

	function needsQuoting (name) {
		return name != quoteUtils.quotearg_buffer(
			name, pref.filenameQuotingOptions);
	}

	dirName = toBuffer(dirName);
	fileName = toBuffer(fileName);

	let blocks = 0;
	const f = new FileInfo(fileName, inode, fileType);

	// Get stat only if it is needed
	if (isCommandlineArg
	 || pref.printHyperlink
	 || pref.printThumbnail
	 || runtime.formatNeedsStat
	 || pref.printInode && inode == 0
	 || isColoredDirectory()
	 || isStatRequiredSymblicLink()
	 || isStatRequiredFileType()) {
		let fullName;
		let do_deref;
		let err;

		if (pathUtils.isAbsolute(fileName) || dirName.length == 0) {
			fullName = fileName;
		}
		else {
			fullName = pathUtils.joinPath(dirName, fileName);
		}

		if (pref.printHyperlink || pref.printThumbnail) {
			try {
				/*
				 * NOTE: fs.realpath() requires valid utf8 sequence,
				 * so string in other encoding will result in an error.
				 */
				f.absoluteName = fs.realpathSync(fullName);
			}
			catch (err) {
				f.absoluteName = null;
			}
		}

		switch (pref.dereference) {
		case 'always':
			try {
				f.stat = fs.statSync(fullName, {bigint: true});
			}
			catch (e) {
				err = e;
			}
			do_deref = true;
			break;

		case 'command_line_arguments':
		case 'command_line_symlink_to_dir':
			if (isCommandlineArg) {
				try {
					f.stat = fs.statSync(fullName, {bigint: true});
				}
				catch (e) {
					err = e;
				}
				do_deref = true;

				if (pref.dereference == 'command_line_arguments') {
					break;
				}

				const need_lstat = err ?
					err.code == 'ENOENT' :
					!statUtils.S_ISDIR(Number(f.stat.mode));
				if (!need_lstat) {
					break;
				}

				/*
				 * stat failed because of ENOENT, maybe indicating a dangling
				 * symlink.  Or stat succeeded, FULL_NAME does not refer to a
				 * directory, and --dereference-command-line-symlink-to-dir is
				 * in effect.  Fall through so that we call lstat instead.
				 */
			}
			/*FALLTHRU*/

		default:
			try {
				f.stat = fs.lstatSync(fullName, {bigint: true});
			}
			catch (e) {
				err = e;
			}
			do_deref = false;
			break;
		}

		if (err) {
			fileFailure(
				err, isCommandlineArg,
				`cannot access %s`,
				fullName
			);
			return null;
		}

		f.statOk = true;
		f.stat = statUtils.wrap(f.stat);
		blocks = statUtils.ST_NBLOCKS(f.stat);

		if (pref.printWithColor
		 && pref.printCapability
		 && (fileType == 'normal' || statUtils.S_ISREG(f.stat.mode))
		 && isColored('ca')) {
			f.hasCapability = capUtils.hasCapabilityWithCache(fullName, f);
		}

		if (pref.format == 'long' || pref.printScontext) {
			// TODO: implement the function to retrieve security context
			f.scontext = '?';
			f.aclType = 'none';
			runtime.anyHasAcl = false;
		}

		if (statUtils.S_ISLNK(f.stat.mode)
		 && (pref.format == 'long' || runtime.checkSymlinkMode)) {
			try {
				f.linkName = fs.readlinkSync(
					fullName,
					{encoding: 'buffer'});
			}
			catch (err) {
				fileFailure(
					err, isCommandlineArg,
					`cannot read symbolic link %s`,
					fullName
				);
			}

			const linkName = pathUtils.makeLinkName(fullName, f.linkName);

			/*
			 * Use the slower quoting path for this entry, though
             * don't update cmdSomeQuoted since alignment not
			 * affected.
			 */
			if (linkName
			 && f.quoted === false
			 && f.linkName != f.linkNameDecorated) {
				f.quoted = null;
			}

			/*
			 * Avoid following symbolic links when possible, ie, when
			 * they won't be traced and when no indicator is needed.
			 */
			if (linkName
			 && (pref.indicatorStyle == 'file-type'
			  || pref.indicatorStyle == 'classify'
			  || runtime.checkSymlinkMode)) {
				try {
					const linkStat = fs.statSync(linkName);
					f.linkOk = true;
					f.linkMode = linkStat.mode;
				}
				catch (e) {
					f.linkOk = false;
					f.linkMode = null;
				}
			}
		}

		if (statUtils.S_ISLNK(f.stat.mode)) {
			f.fileType = 'symbolic_link';
		}
		else if (statUtils.S_ISDIR(f.stat.mode)) {
			if (isCommandlineArg && !pref.immediateDirs) {
				f.fileType = 'arg_directory';
			}
			else {
				f.fileType = 'directory';
			}
		}
		else {
			f.fileType = 'normal';
		}

		if (pref.format == 'long' || pref.printBlockSize) {
			const blocksString = humanUtils.humanReadable(
				blocks,
				pref.humanOutputOpts,
				// TODO: We are not certain that this is a suitable
				//       alternative to ST_NBLOCKSIZE.
				f.stat.blksize,
				pref.outputBlockSize);
			const len = getColumnsFor(blocksString);
			if (runtime.maxColumns.blockSize < len) {
				runtime.maxColumns.blockSize = len;
			}
		}

		if (pref.format == 'long') {
			if (pref.printOwner) {
				const len = computeUserColumns(f.stat.uid);
				if (runtime.maxColumns.owner < len) {
					runtime.maxColumns.owner = len;
				}
			}
			if (pref.printGroup) {
				const len = computeGroupColumns(f.stat.gid);
				if (runtime.maxColumns.group < len) {
					runtime.maxColumns.group = len;
				}
			}
			if (pref.printAuthor) {
				const len = computeUserColumns(f.stat.author);
				if (runtime.maxColumns.author < len) {
					runtime.maxColumns.author = len;
				}
			}
		}

		if (pref.printScontext) {
			const len = getColumnsFor(f.scontext);
			if (runtime.maxColumns.scontext < len) {
				runtime.maxColumns.scontext = len;
			}
		}

		if (pref.format == 'long') {
			const len = getColumnsFor(f.stat.nlink);
			if (runtime.maxColumns.nlink < len) {
				runtime.maxColumns.nlink = len;
			}
			if (statUtils.S_ISCHR(f.stat.mode) || statUtils.S_ISBLK(f.stat.mode)) {
				const major = (f.stat.rdev >> 8) & 0xff;
				const majlen = getColumnsFor(major.toString());
				if (runtime.maxColumns.majorDeviceNumber < majlen) {
					runtime.maxColumns.majorDeviceNumber = majlen;
				}

				const minor = f.stat.rdev & 0xff;
				const minlen = getColumnsFor(minor.toString());
				if (runtime.maxColumns.minorDeviceNumber < minlen) {
					runtime.maxColumns.minorDeviceNumber = minlen;
				}

				const len = runtime.maxColumns.majorDeviceNumber + 2 +
					runtime.maxColumns.minorDeviceNumber;
				if (runtime.maxColumns.fileSize < len) {
					runtime.maxColumns.fileSize = len;
				}
			}
			else {
				const sizeString = humanUtils.humanReadable(
					f.stat.size,
					pref.fileHumanOutputOpts,
					1,
					pref.fileOutputBlockSize);
				const len = getColumnsFor(sizeString);
				if (runtime.maxColumns.fileSize < len) {
					runtime.maxColumns.fileSize = len;
				}
			}
		}
	}

	if (pref.printInode) {
		const len = getColumnsFor(f.stat.ino);
		if (runtime.maxColumns.inode < len) {
			runtime.maxColumns.inode = len;
		}
	}

	if (!runtime.cwdSomeQuoted && runtime.alignVariableOuterQuotes) {
		/*
		 * Determine if any quoted for padding purposes.
		 */
		const fileNameQuoted = getQuotedName(fileName, pref.filenameQuotingOptions).buf;
		f.quoted = fileName != fileNameQuoted;
		if (f.quoted) {
			runtime.cwdSomeQuoted = true;
		}
	}

	return {file: f, blocks};
}

function extractDirsFromFiles (currentFiles, dirName, isCommandlineArg) {
	function isDirectory (f) {
		return f.fileType == 'directory' || f.fileType == 'arg_directory';
	}

	function isBasenameDotFile (f) {
		const lastComponent = f.name
			.subarray(pathUtils.getLastComponentPosition(f.name))
			.toString();
		return /^\.\.?(?:\/|$)/.test(lastComponent);
	}

	const ignoreDotfiles = dirName !== null;
	dirName = toBuffer(dirName);

	for (let i = 0; i < currentFiles.length; i++) {
		const f = currentFiles[i];

		if (isDirectory(f) && (!ignoreDotfiles || !isBasenameDotFile(f))) {
			const name = !dirName || f.name[0] == 0x2f/*slash*/ ?
				f.name :
				pathUtils.concatFilenameToPath(dirName, f.name);

			queueDirectory(name, f.linkName, isCommandlineArg);

			if (f.fileType == 'arg_directory') {
				currentFiles.splice(i, 1);
				i--;
			}
		}
	}

	if (dirName && runtime.activeDirSet) {
		/*
		 * Insert a marker entry at last.  When we dequeue this marker
		 * entry, we'll know that DIRNAME has been processed and may
		 * be removed from the set of active directories.
		 */
		queueDirectory(null, dirName, false);
	}
}

function queueDirectory (name, realName, isCommandlineArg) {
	runtime.pendingDirectories.push({
		name: toBuffer(name),
		realName: toBuffer(realName),
		isCommandlineArg
	});
}

function emitTryHelp (status) {
	console.error(printf(
		'Try %s for more information.',
		quoteUtils.quote(`${self} --help`)));
	process.exit(status);
}

function initSignals () {
	function handleSignal (signal, code) {
		process.emit('terminate');
		prepNonFilenameText();
		console.log(`\ngot ${signal} signal. exit.`);
		process.exit(128 + code);
	}

	if (!runtime.isSignalInitialized) {
		process.on('SIGINT', handleSignal)
		process.on('SIGTERM', handleSignal)
		runtime.isSignalInitialized = true;
	}
}

async function printHelp () /* returns promise */ {
	const m = await import('./switchStrings.js');
	const switchStrings = m.switchStrings;
	const header = m.header.replace(/<self>/g, self);
	const footer = m.footer.replace(/<self>/g, self);

	await printSwitches(switchStrings, {
		awidth: runtime.termInfo.awidth,
		lines: runtime.termInfo.lines,
		header, footer
	});
}

function loadExtraPref () {
	const DESKTOP_CONFIG_DIR = 'XDG_CONFIG_DIR';

	let configDir, epPath, content;

	if (DESKTOP_CONFIG_DIR in process.env
	 && fileExists(process.env[DESKTOP_CONFIG_DIR])) {
		configDir = process.env[DESKTOP_CONFIG_DIR];
	}
	else {
		configDir = nodePath.join(os.homedir(), '.config');
	}

	epPath = nodePath.join(configDir, 'lss.json');
	if (fileExists(epPath)) {
		try {
			content = fs.readFileSync(epPath, {encoding: 'utf8'});
		}
		catch {
			content = undefined;
		}
	}

	if (content) {
		try {
			extraPref = JSON.parse(content);
		}
		catch {
			extraPref = undefined;
		}
	}
}

function initThumbnailUtils (t) {
	const cellWidth = runtime.termInfo.width && runtime.termInfo.columns ?
		runtime.termInfo.width / runtime.termInfo.columns :
		0;
	const cellHeight = runtime.termInfo.height && runtime.termInfo.lines ?
		runtime.termInfo.height / runtime.termInfo.lines :
		0;
	const thumbSize = Math.trunc(cellHeight) * THUMBNAIL_LINES;

	t.useSystemIcons = true;
	t.useStripDecomposition = USE_8452;
	t.useBackgroundCutoff = true;
	t.background = runtime.termInfo.bg;

	if (cellWidth && cellHeight) {
		t.cellHeight = cellHeight;
		t.thumbSize = thumbSize;

		THUMBNAIL_COLS = Math.ceil(thumbSize / cellWidth) + 1;
		ADVANCE = `\x1b[${THUMBNAIL_COLS}C`;
	}

	return t;
}

function getDynamicImports () {
	const dynamicImports = [];

	if (pref.printCapability) {
		dynamicImports.push(import('./capability.js').then(module => {
			capUtils = module.capUtils;
		}));
	}
	if (pref.printWithColor) {
		dynamicImports.push(import('./parseLsColors.js').then(module => {
			module.parseLsColors();
		}));
	}
	if (pref.ignoreThumbnailCache || pref.printThumbnail) {
		dynamicImports.push(import('./thumbnail.js').then(module => {
			const utils = initThumbnailUtils(module.thumbnailUtils);

			if (pref.ignoreThumbnailCache) {
				utils.invalidateCache();
			}
			if (pref.printThumbnail) {
				thumbnailUtils = utils;
			}
			else {
				utils.init();
			}
		}));
	}
	if (pref.format == 'long') {
		dynamicImports.push(import('./id.js').then(module => {
			idUtils = module.idUtils;
		}));
	}
	if (pref.sortType == 'version') {
		dynamicImports.push(import('./version.js').then(module => {
			versionUtils = module.versionUtils;
		}));
	}

	return dynamicImports;
}

try {
	runtime.termInfo = getTerminalCapabilitiesFromSpec(process.argv[3]);
	runtime.defaultGCFOptions = {
		awidth: runtime.termInfo.awidth
	};
	runtime.defaultGCFOptionsA = {
		awidth: runtime.termInfo.awidth,
		ansi: true
	};
	runtime.event.on('argmatch_die', payload => {
		console.error(payload.message);
		emitTryHelp(EXIT_CODE.LS_FAILURE);
	});
	printf.awidth =
	strftime.awidth =
	Unistring.awidth = runtime.termInfo.awidth;

	const argsParseResult = parseArgs();
	switch (argsParseResult.result) {
	case 'help':
		await printHelp();
		process.exit(EXIT_CODE.EXIT_SUCCESS);
		break;

	case 'help2':
		// emitTryHelp calls process.exit.
		emitTryHelp(EXIT_CODE.LS_FAILURE);
		break;

	case 'diag':
		console.log('*** diagnostics on terminal capabilities ***');
		console.log(`                 sixel support: ${runtime.termInfo.da1.sixel ? 'yes' : 'no'}`);
		console.log(`      terminal width in pixels: ${runtime.termInfo.width ?? '?'}`);
		console.log(`     terminal height in pixels: ${runtime.termInfo.height ?? '?'}`);
		console.log(`          cell width in pixels: ${runtime.termInfo.width && runtime.termInfo.columns ? (runtime.termInfo.width / runtime.termInfo.columns) : '?'}`);
		console.log(`         cell height in pixels: ${runtime.termInfo.height && runtime.termInfo.lines ? (runtime.termInfo.height / runtime.termInfo.lines) : '?'}`);
		console.log(`             number of columns: ${runtime.termInfo.columns ?? '?'}`);
		console.log(`               number of lines: ${runtime.termInfo.lines ?? '?'}`);
		console.log(`              background color: ${runtime.termInfo.bg ?? '?'}`);
		console.log(`columns of ambiguous character: ${runtime.termInfo.awidth ?? '?'}`);
		console.log();

		(await import('./thumbnail.js')).thumbnailUtils.diagnose();

		process.exit(EXIT_CODE.EXIT_SUCCESS);
		break;

	case 'thumbnail-cache-root':
		process.stdout.write(initThumbnailUtils((await import('./thumbnail.js')).thumbnailUtils).cacheRootDir ?? '');
		process.exit(EXIT_CODE.EXIT_SUCCESS);
		break;

	case 'root':
		process.stdout.write(fs.realpathSync(nodePath.join(__dirname, '..')));
		process.exit(EXIT_CODE.EXIT_SUCCESS);
		break;

	case 'version':
		{
			const pkg = JSON.parse(
				fs.readFileSync(
					nodePath.join(__dirname, '../package.json'),
					{encoding: 'utf8'}
				)
			);
			console.log(`\
${self} ${pkg.version} (based on GNU coreutils 9.3)
License GPLv3+: GNU GPL version 3 or later \x1b]8;;https://gnu.org/licenses/gpl.html\x07https://gnu.org/licenses/gpl.html\x1b]8;;\x07.
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.`);
			process.exit(EXIT_CODE.EXIT_SUCCESS);
		}
		break;
	}

	const args = argsParseResult.args;

	/*
	 * Final adjustment of pref, and then freeze it
	 */

	if (pref.printWithColor) {
		pref.tabSize = 0;
	}
	if (pref.directoriesFirst) {
		runtime.checkSymlinkMode = true;
	}
	else if (pref.printWithColor) {
		if (isColored('or')
		 || isColored('ex') && pref.colorSymlinkAsReferent
		 || isColored('mi') && pref.format == 'long') {
			runtime.checkSymlinkMode = true;
		}
	}
	if (pref.dereference == 'undefined') {
		if (pref.immediateDirs
		 || pref.indicatorStyle == 'classify'
		 || pref.format == 'long') {
			pref.dereference = 'never';
		}
		else {
			pref.dereference = 'command_line_symlink_to_dir';
		}
	}
	Object.freeze(pref);

	runtime.formatNeedsStat = pref.sortType == 'time'
		|| pref.sortType == 'size'
		|| pref.format == 'long'
		|| pref.printScontext
		|| pref.printBlockSize;

	runtime.formatNeedsType = !runtime.formatNeedsStat
		&& (pref.recursive
			|| pref.printWithColor
			|| pref.indicatorType != 'none'
			|| pref.directoriesFirst);

	if (pref.printHyperlink) {
		runtime.hostname = os.hostname() || '';
	}

	/*
	 * Import libraries dynamically
	 */

	await Promise.all(getDynamicImports());

	/*
	 * load extra pref from ~/.config/lss.json
	 */

	loadExtraPref();

	/*
	 * Main job
	 */

	const currentFiles = [];
	let needPrintDirectoryName = true;

	clearFiles();
	stdout.buffering(true);

	if (pref.recursive) {
		initSignals();
		runtime.activeDirSet = new InodeHash;
	}

	if (args.operands.length <= 0) {
		if (pref.immediateDirs) {
			const result = gobbleFileFromCommandlineArg(
				'', '.', 'directory', 0);
			if (result) {
				currentFiles.push(result.file);
			}
		}
		else {
			queueDirectory('.', null, true);
		}
	}
	else {
		for (const operand of args.operands) {
			const result = gobbleFileFromCommandlineArg(
				'', operand.buffer, 'unknown', 0);
			if (result) {
				currentFiles.push(result.file);
			}
		}
	}

	for (let i = 0; i < currentFiles.length; i++) {
		if (!currentFiles[i]) {
			currentFiles.splice(i, 1);
			i--;
		}
	}

	if (currentFiles.length) {
		sortFileInfos(currentFiles);
		if (!pref.immediateDirs) {
			extractDirsFromFiles(currentFiles, null, true);
		}
	}

	if (!stdout.buffered
	 && !pref.recursive
	 && (currentFiles.length == 0 && runtime.pendingDirectories.length == 1
	  || currentFiles.length      && runtime.pendingDirectories.length == 0)) {
		stdout.buffering(false);
	}

	if (currentFiles.length) {
		await printCurrentFiles(
			pref.recursive ? null : '.',
			currentFiles);
	}

	if (runtime.pendingDirectories.length) {
		if (args.operands.length <= 1) {
			needPrintDirectoryName = false;
		}

		while (runtime.pendingDirectories.length) {
			const {
				name, realName, isCommandlineArg
			} = runtime.pendingDirectories.shift();

			if (runtime.activeDirSet) {
				if (stdout.bufferingDepth
				 && (name && name.toString() != '' || realName && realName.toString() != '')) {
					process.stdout.write(printf(
						`\rprocessing %3d directories, current: "%s"\x1b[K`,
						runtime.pendingDirectories.length,
						(name ?? realName).toString()
					));
					await delay0();
				}

				if (name === null) {
					const {dev, ino} = runtime.activeDirSet.popDevAndInode();
					const found = runtime.activeDirSet.remove(dev, ino);
					//runtime.activeDirSet.assertMatch(realName, dev, ino);
					console.assert(found);
					continue;
				}
			}

			await printDirectory(
				name, realName, isCommandlineArg,
				needPrintDirectoryName);

			needPrintDirectoryName = true;
		}
	}

	if (stdout.bufferingDepth) {
		if (runtime.activeDirSet) {
			if (runtime.activeDirSet.set.size) {
				throw new Error('there are bugs in recursion: activeDirSet.set.size is not 0');
			}

			runtime.activeDirSet = null;
		}

		stdout.eraseLine();
		const content = stdout.buffering(false);
		if (content == undefined) {
			throw new Error('there are bugs in buffering: final content is undefined');
		}

		const lines = countLines(content, runtime.termInfo.lines);
		if (pagerNeeded(lines, true)) {
			if (pref.printThumbnail) {
				await callInternalPager(content, getPagerPrompt(0, runtime.totalFileNum));
			}
			else {
				await callPager(content, getPagerPrompt(0, runtime.totalFileNum));
			}
		}
		else {
			await printSequenceChunks(content);
		}
	}
}
catch (err) {
	setExitStatus(true);
	error(0, err);
}
finally {
	stdout.showCursor(true);
	process.emit('terminate');
	process.exit(runtime.exitStatus);
}

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
