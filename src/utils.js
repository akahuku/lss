/**
 * utils.js -- miscellaneous utility functions
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';
import fs from 'node:fs';
import Unistring from '@akahuku/unistring';

export async function stdioFilter (data, executable, args, options) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let child;

		try {
			child = child_process.spawn(executable, args, options);
		}
		catch (err) {
			reject(err);
			return;
		}

		if (child.stdout) {
			child.stdout.on('data', data => {
				chunks.push(data);
			});
		}
		if (child.stderr) {
			child.stderr.on('data', data => {
				console.error(data.toString());
			});
		}
		if (child.stdin) {
			child.stdin.on('error', err => {
				/*
				 * note:
				 * writing to stdin may cause EPIPE error,
				 * this seems to be no problem to ignore.
				 */
			});
		}

		child.on('error', err => {
			child = null;
			reject(err);
		});
		child.on('close', code => {
			child = null;
			resolve(Buffer.concat(chunks));
		});

		if (data && child.stdin) {
			try {
				child.stdin.end(data);
			}
			catch (err) {
				reject(err);
			}
		}
	});
}

export function getTerminalCapabilitiesFromSpec (spec) {
	let re, da1 = {}, width, height, columns, lines, bg, x, y, awidth;

	//console.log(`spec: "${spec.replace(/[\x00-\x1f]/g, $0 => '^' + String.fromCharCode(64 + $0.charCodeAt(0)))}"`);

	lines = process.stdout.rows;
	columns = process.stdout.columns;
	awidth = 2;

	/*
	 * DEVICE ATTRIBUTE 1: ESC [ c
	 *
	 * some samples:
	 *
	 * gnome terminal 3.44.0 using VTE 0.68.0
	 *   esc [ 5 ; 2 R
	 *   esc [ ? 6 5 ; 1 ; 9 c
	 *   esc [ 4 ; 3 8 4 ; 6 4 0 t
	 *   esc ] 1 1 ; r g b : 0 0 0 0 / 0 0 0 0 / 0 0 0 0 esc
	 *
	 * gnome terminal + vim 8.2 terminal
	 *   esc [ 3 ; 2 R
	 *   esc [ ? 1 ; 2 c
	 *   esc ] 1 1 ; r g b : 0 0 0 0 / 0 0 0 0 / 0 0 0 0 bel
	 *
	 * gnome terminal + tmux 3.2a
	 *   esc [ 3 ; 2 R
	 *   esc [ ? 1 ; 2 c
	 *
	 * xfce4-terminal 0.8.10 (Xfce 4.16)
	 *   esc [ 3 ; 3 R
	 *   esc [ ? 6 5 ; 1 ; 9 c
	 *   esc [ 4 ; 5 7 6 ; 8 0 0 t
	 *   esc ] 1 1 ; r g b : 0 0 0 0 / 0 0 0 0 / 0 0 0 0 esc
	 *
	 * foot version: 1.11.0
	 *   esc [ 1 5 ; 2 R
	 *   esc [ ? 6 2 ; 4 ; 2 2 c
	 *   esc [ 4 ; 4 6 4 ; 6 9 6 t
	 *   esc ] 1 1 ; r g b : 1 1 / 1 1 / 1 1 esc
	 *
	 * wezterm 20230712-072601-f4abf8fd
	 *   esc [ 6 ; 2 R
	 *   esc [ ? 6 5 ; 4 ; 6 ; 1 8 ; 2 2 c
	 *   esc [ 4 ; 3 8 4 ; 6 4 0 t
	 *   esc ] 1 1 ; r g b : 0 0 0 0 / 0 0 0 0 / 0 0 0 0 esc
	 *
	 * black box 0.14.0
	 *    esc [ 5 1 ; 2 R
	 *    esc [ ? 6 5 ; 1 ; 4 ; 9 c
	 *    esc [ 4 ; 8 1 6 ; 1 5 2 0 t
	 *    esc ] 1 1 ; r g b : 1 e 1 e / 1 e 1 e / 1 e 1 e esc
	 *
	 * mlterm 3.9.0
     *   esc [ 5 2 ; 2 R
	 *   esc [ ? 6 3 ; 1 ; 2 ; 3 ; 4 ; 6 ; 7 ; 1 5 ; 1 8 ; 2 2 ; 2 9 c
	 *   esc [ 4 ; 8 3 2 ; 1 2 4 8 t
	 *   esc ] 1 1 ; r g b : 2 c 2 c / 4 a 4 a / 8 0 8 0 esc
	 */
	if ((re = /\x1b\[\?([^c]+)/.exec(spec))) {
		/*
		 * @see https://vt100.net/docs/vt510-rm/DA1.html
		 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Device-Control-functions
		 *
		 *  1  132 columns
		 *  2  Printer port
		 *  3  ReGIS graphics
		 *  4  Sixel
		 *  6  Selective erase
		 *  7  Soft character set (DRCS)
		 *  8  User-defined keys (UDKs)
		 *  9  National replacement character sets (NRCS) (International terminal only)
		 * 12  Yugoslavian (SCS)
		 * 15  Technical character set
		 * 16  Locator port
		 * 17  Terminal state interrogation
		 * 18  Windowing capability
		 * 21  Horizontal scrolling
		 * 22  ANSI color, e.g., VT525
		 * 23  Greek
		 * 24  Turkish
		 * 28  Rectangular editing
		 * 29  ANSI text locator (i.e., DEC Locator mode)
		 * 42  ISO Latin-2 character set
		 * 44  PCTerm
		 * 45  Soft key map
		 * 46  ASCII emulation
		 */
		const caps = {
			'1': '132 columns',
			'2': 'printer port',
			'3': 'regis',
			'4': 'sixel',
			'6': 'selective erase',
			'7': 'soft character set',
			'8': 'user-defined keys',
			'9': 'national replacement character sets',
			'12': 'yugoslavian',
			'15': 'technical character set',
			'16': 'locator port',
			'17': 'terminal state interrogation',
			'18': 'windowing capability',
			'21': 'horizontal scrolling',
			'22': 'ansi color',
			'23': 'greek',
			'24': 'turkish',
			'28': 'rectangular editing',
			'29': 'ansi text locator',
			'42': 'iso latin-2 character set',
			'44': 'pcterm',
			'45': 'soft key map',
			'46': 'ascii emulation'
		};
		for (const cap in caps) {
			da1[caps[cap]] = false;
		}
		for (const cap of re[1].split(/;/)) {
			if (cap in caps) {
				da1[caps[cap]] = true;
			}
		}
	}

	/*
	 * REPORT XTERM TEXT AREA SIZE IN PIXELS: ESC [ 1 4 t
	 */
	if ((re = /\x1b\[4;(\d+);(\d+)t/.exec(spec))) {
		height = parseInt(re[1], 10);
		width = parseInt(re[2], 10);
	}

	/*
	 * REPORT VT100 TEXT BACKGROUND COLOR: ESC ] 1 1 ; ? ESC \
	 */
	if ((re = /\x1b\]11;rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/.exec(spec))) {
		bg = '#';
		for (let i = 1; i <= 3; i++) {
			if (/^([0-9a-fA-F]{2})\1$/.test(re[i])) {
				bg += RegExp.$1;
			}
			else {
				bg += re[i];
			}
		}
	}

	/*
	 * REPORT CURSOR POSITION: ESC [ 6 n
	 */
	if ((re = /\x1b\[(\d+);(\d+)R\x1b\[(\d+);(\d+)R/.exec(spec))) {
		y = parseInt(re[1], 10);
		x = parseInt(re[2], 10);
		awidth = parseInt(re[4], 10) - x;
	}
	else if ((re = /\x1b\[(\d+);(\d+)R/.exec(spec))) {
		y = parseInt(re[1], 10);
		x = parseInt(re[2], 10);
	}

	return {da1, width, height, columns, lines, bg, x, y, awidth};
}

export async function less (data, prompt, pager = 'less') {
	if (Array.isArray(data)) {
		data = data.join('');
	}

	const switches = [];
	if (pager == 'less' && prompt && prompt != '') {
		// -r: enable ansi escape sequence and hyperlink
		// -M: use verbosely prompt
		// -PM: promot definition
		switches.push('-r', '-M', `-PM${prompt}`);
	}

	const sigintHandler = () => {};
	process.on('SIGINT', sigintHandler);
	try {
		return await stdioFilter(
			data, pager, switches, {
				stdio: ['pipe', 'inherit', 'inherit']
			});
	}
	finally {
		process.off('SIGINT', sigintHandler);
	}
}

export async function printSwitches (switchStrings, options) {
	function pushLine (line) {
		if (Array.isArray(line)) {
			for (const l of line) {
				lines.push(l.replace(/[\s\r\n]+$/, '') + '\n');
			}
		}
		else {
			lines.push((line ?? '').replace(/[\s\r\n]+$/, '') + '\n');
		}
	}

	function pushItem (columns, leader, body, param) {
		const subLeader = ' '.repeat(leader.length);
		const foldedBody = Unistring.getFoldedLines(body, {
			columns: Math.min(columns, DESCRIPTION_MAX_COLS),
			...unistringOptionsA
		});

		if (param != '') {
			leader = leader.replace(param, `\u001b[34;1m${param}\u001b[m`);
		}

		pushLine(`${leader}${foldedBody[0]}`);
		for (let i = 1; i < foldedBody.length; i++) {
			pushLine(`${subLeader}${foldedBody[i]}`);
		}
	}

	function hyperlink (s) {
		return s.replace(/<a\s+href="([^"]+)"\s*>([^<]+)<\/a>/g, ($0, $1, $2) => {
			return `\x1b]8;;${fileEscape($1)}\x07${$2}\x1b]8;;\x07`;
		});
	}

	const MARGIN_COLS = 2;
	const DEVIATION_THRESHOLD = 80;
	const NON_TTY_DEFAULT_COLS = 80;
	const DESCRIPTION_MIN_COLS = options.descriptionMinColumns || 30;
	const DESCRIPTION_MAX_COLS = options.descriptionMaxColumns || 80;

	const switches = [];
	const lines = [];
	const unistringOptions = {awidth: options.awidth};
	const unistringOptionsA = {ansi: true, ...unistringOptions};

	let maxLength = 0, maxLengthAdjusted = 0, averageLength = 0;

	// calculate max length
	{
		const paramPrefix = options.paramPrefix || '=';
		let header;
		for (const item of switchStrings) {
			if (typeof item == 'string') {
				header = item;
				continue;
			}

			const [short, long, param, description] = item;

			let param2;
			if (param) {
				if (param.includes('<prefix>')) {
					param2 = param.replaceAll('<prefix>', paramPrefix);
				}
				else {
					param2 = `${paramPrefix}${param}`;
				}
			}
			else {
				param2 = '';
			}

			let option;
			if (short !== null && long === null) {
				option = `-${short}${param2}`;
			}
			else if (short === null && long !== null) {
				//        -a, --.......
				option = `    --${long}${param2}`;
			}
			else if (short !== null && long !== null) {
				option = `-${short}, --${long}${param2}`;
			}
			else {
				continue;
			}
			averageLength = (switches.length * averageLength + option.length) / (switches.length + 1);
			switches.push([option, description, 0, false, header, param2]);
			header = undefined;
			if (option.length > maxLength) {
				maxLength = option.length;
			}
		}
	}

	// calculate deviation value for each switches
	// calculate adjusted max length
	{
		// calculate stndard deviation value
		const sd = Math.sqrt(switches.reduce((a, o) => a + Math.pow(o[0].length - averageLength, 2), 0) / switches.length);

		for (let i = 0; i < switches.length; i++) {
			const option = switches[i][0];
			const d = ((option.length - averageLength) / sd) * 10 + 50;
			switches[i][2] = d;
			if (d < DEVIATION_THRESHOLD) {
				switches[i][3] = true;
				if (option.length > maxLengthAdjusted) {
					maxLengthAdjusted = option.length;
				}
			}
		}
	}

	// generate whole lines to be output
	{
		const termCols = process.stdout.columns || NON_TTY_DEFAULT_COLS;
		const descriptionCols = Math.min(termCols - (maxLengthAdjusted + 2), DESCRIPTION_MAX_COLS);
		const wholeCols = maxLengthAdjusted + MARGIN_COLS + descriptionCols;

		// header
		if (options.header) {
			pushLine(Unistring.getFoldedLines(hyperlink(options.header), {
				columns: wholeCols,
				...unistringOptionsA
			}));
		}

		// switches
		for (let i = 0; i < switches.length; i++) {
			const [option, description, d, isNormal, header, param2] = switches[i];
			if (header) {
				if (i > 0) {
					pushLine();
				}

				let headerForPrint = header.toLocaleUpperCase();
				let headerCols = Unistring.getColumnsFor(headerForPrint, unistringOptions);
				if (headerCols > wholeCols) {
					headerForPrint = Unistring.divideByColumns(headerForPrint, wholeCols, unistringOptions)[0];
					headerCols = Unistring.getColumnsFor(headerForPrint, unistringOptions);
				}

				pushLine(`\u001b[4m${header}${' '.repeat(wholeCols - headerCols)}\u001b[m`);
			}

			if (isNormal && descriptionCols >= DESCRIPTION_MIN_COLS) {
				pushItem(
					descriptionCols,
					`${option}${' '.repeat(maxLengthAdjusted - option.length)}  `,
					description, param2);
			}
			else {
				pushLine(option);

				if (descriptionCols >= DESCRIPTION_MIN_COLS) {
					pushItem(
						descriptionCols,
						' '.repeat(maxLengthAdjusted + MARGIN_COLS),
						description, param2);
				}
				else {
					pushItem(
						DESCRIPTION_MIN_COLS,
						' '.repeat(8 + MARGIN_COLS),
						description, param2);
				}
			}
		}

		// footer
		if (options.footer) {
			pushLine(Unistring.getFoldedLines(hyperlink(options.footer), {
				columns: wholeCols,
				...unistringOptionsA
			}));
		}
	}

	// output all lines
	if (process.stdout.isTTY) {
		const termLines = options.lines || 0x10000;

		if (lines.length < termLines) {
			process.stdout.write(lines.join(''));
		}
		else {
			await less(lines, 'Usage of lss?e (END):?pB (%pB\\%).. - press q to quit');
		}
	}
	else {
		process.stdout.write(lines.join('').replace(
			/\u001b\[.*?[\u0040-\u007e]|\u001b[\u0040-\u005f]/g, ''));
	}
}

export function fileEscape (str, convertPath) {
	if (typeof str == 'string') {
		// RFC 3986
		str = encodeURIComponent(str).replace(/[!'()*]/g, ch => {
			return '%' + ch.charCodeAt(0).toString(16);
		});
		if (convertPath) {
			str = str.replaceAll('%2F', '/');
		}
		return str;
	}
	else if (Buffer.isBuffer(str)) {
		throw new Error('fileEscape: not implemented');
	}
	else {
		throw new Error('fileEscape: invalid type');
	}
}

export function fileExists (filepath, mode) {
	let result = true;
	try {
		fs.accessSync(filepath, mode || fs.constants.R_OK);
	}
	catch {
		result = false;
	}
	return result;
}

export function fileTouch (filepath, time) {
	try {
		time || (time = new Date);
		fs.utimesSync(filepath, time, time);
	}
	catch {
		fs.closeSync(fs.openSync(filepath, 'a'));
	}
}

export function fileWhich (name) {
	try {
		return child_process
			.execFileSync('which', [name], {stdio: 'pipe', encoding: 'utf8'})
			.split('\n')[0];
	}
	catch {
		return null;
	}
}

export function delay (wait) {
	return new Promise(resolve => {setTimeout(resolve, wait)});
}

export function delay0 () {
	return new Promise(resolve => {setImmediate(resolve)});
}

// @see https://stackoverflow.com/a/73477155
export function waitKeyPressed () {
	return new Promise(resolve => {
		const wasRaw = process.stdin.isRaw;
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.once('data', data => {
			process.stdin.pause();
			process.stdin.setRawMode(wasRaw);
			resolve(data.toString());
		});
	});
}

export function* splitDCSSequences (s) {
	const pattern = /\x1bP.+?(?:\x07|\x1b\\)/gs;
	let re, index = 0;

	while ((re = pattern.exec(s)) !== null) {
		// chunks other than DCS sequences
		if (re.index > index) {
			yield [s.substring(index, re.index), 0];
		}

		// DCS sequences ( Device Control String: ESC P ... BEL|ESC \ )
		// note: this includes SIXEL sequences
		yield [re[0], 2];
		index = re.index + re[0].length;
	}

	// output rest string
	if (index < s.length) {
		yield [s.substring(index), 0];
	}
}

export function* iterateLines (s, strict) {
	const pattern = strict ? /(?<!\r)\n/g : /\n/g;
	let re, index = 0;

	while ((re = pattern.exec(s)) !== null) {
		if (re.index > index) {
			yield [s.substring(index, re.index), 0];
		}

		yield [re[0], 2];

		index = re.index + re[0].length;
	}

	if (index < s.length) {
		yield [s.substring(index), 0];
	}
}

export function countLines (s, limit = 0x7fffffff) {
	let result = 0;
	for (const chunk of iterateLines(s)) {
		if (chunk[1] == 0) result++;
		if (result >= limit) break;
	}
	return Math.min(result, limit);
}

export const stdout = (() => {
	const buffer = [];
	const none = () => {};

	function stdout (s) {
		if (s != '') {
			if (buffer.length) {
				buffer[0].push(s);
			}
			else {
				process.stdout.write(s);
			}
		}
		return s;
	}

	let p = {
		buffering: {
			value: (value) => {
				let result;

				if (buffer.length && value === false) {
					result = buffer.shift().join('');
				}
				else if (value === true) {
					buffer.unshift([]);
				}

				return result;
			}
		},
		bufferingDepth: {
			get: () => {
				return buffer.length;
			}
		},
		buffered: {
			get: () => {
				return buffer.length && buffer[0].length;
			}
		}
	};
	let ps = process.stdout.isTTY ? {
		cursorUp: value => {
			process.stdout.write(`\x1b[${value || ''}A`);
		},
		cursorDown: value => {
			process.stdout.write(`\x1b[${value || ''}B`);
		},
		cursorForward: value => {
			process.stdout.write(`\x1b[${value || ''}C`);
		},
		cursorBack: value => {
			process.stdout.write(`\x1b[${value || ''}D`);
		},
		cursorHorizontalAbsolute: value => {
			process.stdout.write(`\x1b[${value || ''}G`);
		},
		cursorPosition: (row, col) => {
			process.stdout.write(`\x1b[${row || ''};${col || ''}H`);
		},
		eraseLine: () => {
			process.stdout.write('\r\x1b[K');
		},
		showCursor: value => {
			process.stdout.write(value ? '\x1b[?25h' : '\x1b[?25l');
		},
		sixelDisplayMode: value => {
			process.stdout.write(value ? '\x1b[?80h' : '\x1b[?80l');
		},
		sixelInlineMode: value => {
			process.stdout.write(value ? '\x1b[?8452h' : '\x1b[?8452l');
		}
	} : {
		cursorUp: none,
		cursorDown: none,
		cursorForward: none,
		cursorBack: none,
		cursorHorizontalAbsolute: none,
		cursorPosition: none,
		eraseLine: none,
		showCursor: none,
		sixelDisplayMode: none,
		sixelInlineMode: none
	};

	for (const name in ps) {
		const handler = ps[name];
		p[name] = {value: handler};
	}

	Object.defineProperties(stdout, p);
	p = ps = null;

	return stdout;
})();
