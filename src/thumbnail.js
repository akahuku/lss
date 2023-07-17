/**
 * thumbnail.js -- thumbnail manager
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {default as nodePath} from 'node:path';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

import {__dirname, runtime} from './base.js';
import {fileEscape, fileExists, fileTouch} from './utils.js';
import {log} from './logger.js';



const CACHE_ROOT_NAME = 'sixel';

const DESKTOP_CACHE_HOME = 'XDG_CACHE_HOME';
const DESKTOP_RUNTIME_DIR = 'XDG_RUNTIME_DIR';

const GSETTINGS_EXECUTABLE = 'gsettings';
const GIO_EXECUTABLE = 'gio';
const GDK_THUMBNAILER_EXECUTABLE = 'gdk-pixbuf-thumbnailer';
const IMAGEMAGICK_EXECUTABLE = 'convert';

const SYSTEM_THUMBNAILER_PATH = '/usr/share/thumbnailers';
const USER_THUMBNAILER_PATH = '.local/share/thumbnailers';
const SYSTEM_ICON_PATH = '/usr/share/icons';

const CUTOFF_THRESHOLD = 2.0;



/*
 * temporary directory handling functions
 *
 * typical content:
 *   '/run/user/1000/lss-xxxxxxxx'
 *   '/tmp/lss-xxxxxxxx'
 */

let tempDir;

function getTempDirectory () {
	if (!tempDir) {
		function cleanup () {
			if (tempDir) {
				fs.rmSync(tempDir, {recursive: true, force: true});
				tempDir = undefined;
				if (runtime.isVerbose) {
					console.log('temp directory removed');
				}
			}
		}

		let tempRoot;

		if (DESKTOP_RUNTIME_DIR in process.env
		 && fileExists(process.env[DESKTOP_RUNTIME_DIR])) {
			tempRoot = process.env[DESKTOP_RUNTIME_DIR];
		}
		else {
			tempRoot = os.tmpdir();
		}

		tempDir = fs.mkdtempSync(nodePath.join(tempRoot, 'lss-'), 'utf8');
		process.on('exit', cleanup);
		process.on('SIGINT', cleanup);
		process.on('SIGTERM', cleanup);
	}

	return tempDir;
}

function getTempFilePath () {
	return nodePath.join(getTempDirectory(), randomBytes(16).toString('hex'));
}

/*
 * error handling functions
 */

function errorMessage (...args) {
	let message = '', error;

	for (const arg of args) {
		if (typeof arg == 'string' && message === '') {
			message = arg;
		}
		else if (arg instanceof Error && error === undefined) {
			error = arg;
		}
	}

	if (error) {
		if (message == '') {
			message = 'error';
		}
		message += `: "${runtime.isVerbose ? error.stack : error.message}"`;
	}

	return message;
}

function printError (...args) {
	if (runtime.isVerbose) {
		console.error(errorMessage(...args));
	}
}

function debuglog (s) {
	if (runtime.isVerbose) {
		console.log(s);
	}
}

/*
 * functions to make sixel transparent
 */

function cutoffBackgroundColors (sixel, indexes) {
	function packSeq (s) {
		return s.replace(/!\d+[?-~]|[?-~]+/g, $0 => {
			let width = 0;
			$0.replace(/!(\d+)[?-~]|[?-~]+/g, ($0, $1) => {
				width += $0.startsWith('!') ? parseInt($1, 10) : $0.length;
			});
			return `!${width}?`;
		});
	}

	for (const index of indexes) {
		sixel = sixel.replace(
			new RegExp(`#${index}(?:!\\d+[?-~]|[?-~]+|\$|-)+`, 'g'),
			packSeq);
	}

	// overwrite P2 parameter of Device Control String to '1': bit 0 does not set any pixel
	sixel = sixel.replace(/\x1bP[^q]*q/, '\x1bP0;1;0q');

	return sixel;
}

function findBgcolorIndexes (sixel, bgcolor, threshold = 2.0) {
	const r = Math.trunc(bgcolor[0] / 255. * 100.),
		g = Math.trunc(bgcolor[1] / 255. * 100.),
		b = Math.trunc(bgcolor[2] / 255. * 100.);
	const colors = [];
	let re;

	// skip a header
	re = /^\x1bP(?:([^;]*);([^;]*);([^;a-z]*);?)?q/.exec(sixel);
	if (re) {
		sixel = sixel.substring(re[0].length);
	}
	else {
		throw new Error(`not a sixel.`);
	}

	// skip a raster attributes if exist
	re = /^"(\d+);(\d+);(\d+);(\d+)/.exec(sixel);
	if (re) {
		sixel = sixel.substring(re[0].length);
	}

	// trace all commands
	while (sixel != '') {
		// find color introducer command
		re = /^#(\d*);(\d*);(\d*);(\d*);(\d*)/.exec(sixel);
		if (re) {
			colors.push([
				re[1] - 0,
				Math.sqrt(
					Math.pow(r - re[3], 2) +
					Math.pow(g - re[4], 2) +
					Math.pow(b - re[5], 2))
			]);
			sixel = sixel.substring(re[0].length);
			continue;
		}

		// skip other commands
		re = /^(?:#\d+|!\d+[?-~]|\$|-|[?-~]+)+/.exec(sixel);
		if (re) {
			sixel = sixel.substring(re[0].length);
			continue;
		}

		// ST (string terminator), break this loop
		re = /^\x1b\\/.exec(sixel);
		if (re) {
			break;
		}

		throw new Error(`found unknown sequence: "${log.escape(sixel.substring(0, 32))}..."`);
	}

	colors.sort((a, b) => a[1] - b[1]);

	/*
	colors.slice(0, 10).forEach(c => {
		console.log(`#${c[0]}\t(${c[1]})`);
	});
	*/

	return colors.filter(c => c[1] < threshold).map(c => c[0]);
}

/*
 * public functions
 */

export function getMD5 (text) {
	return createHash('md5').update(text, 'binary').digest('hex');
}

export function getMTime (arg, precision = 'ns') {
	let mtime;
	try {
		mtime =
			typeof arg == 'object' && 'mtimeNs' in arg ? arg.mtimeNs :
			typeof arg == 'string' ? fs.statSync(arg, {bigint: true}).mtimeNs :
			NaN;
	}
	catch (err) {
		mtime = NaN;
	}

	if (Number.isNaN(mtime)) {
		return NaN;
	}

	switch (precision) {
	default:
		return mtime;
	case 'ms':
		return Number(mtime / 1000000n);
	case 's':
		return Number(mtime / 1000000000n);
	}
}

export function getExtendAttribute (path) {
	return getExtendAttribute.viaAddon(path)
		?? getExtendAttribute.viaChildProcess(path)
		?? null;
}

getExtendAttribute.viaAddon = path => {
	let attribs;

	try {
		attribs = runtime.addon.getExtendAttribute(path);
	}
	catch {
		return null;
	}

	const result = new Map;

	for (const [key, value] of Object.entries(attribs)) {
		if (/^user\.(.+)$/.test(key)) {
			result.set(RegExp.$1, value);
		}
	}

	return result;
};

getExtendAttribute.viaChildProcess = path => {
	let lines;

	try {
		const args = ['--dump', '--absolute-names', path];
		const opts = {
			stdio: ['pipe', 'pipe', 'ignore'],
			timeout: 3000,
			encoding: 'utf8'
		};
		lines = child_process
				.execFileSync('getfattr', args, opts)
				.replace(/^\s+|\s+$/g, '');
	}
	catch {
		return null;
	}

	const result = new Map;

	for (const line of lines.split('\n')) {
		if (/^user\.([^=]+)=(.*)$/.test(line)) {
			result.set(
				RegExp.$1
					.replace(
						/\\([0-7]{3})/g,
						($0, $1) => String.fromCharCode(parseInt($1, 8))
					),
				RegExp.$2
					.replace(/^"|"$/g, '')
					.replace(/\\"/g, '"')
					.replace(
						/\\([0-7]{3})/g,
						($0, $1) => String.fromCharCode(parseInt($1, 8))
					)
			);
		}
	}

	return result;
};

export function setExtendAttribute (path, attribs) {
	return setExtendAttribute.viaAddon(path, attribs)
		?? setExtendAttribute.viaChildProcess(path, attribs)
		?? null;
}

setExtendAttribute.viaAddon = (path, attribs) => {
	const argAttribs = {};
	for (let [key, value] of Object.entries(attribs)) {
		argAttribs[`user.${key}`] = '' + value;
	}

	try {
		return runtime.addon.setExtendAttribute(path, argAttribs);
	}
	catch {
		return null;
	}
};

setExtendAttribute.viaChildProcess = (path, attribs) => {
	const lines = [`# file: ${path}`];
	for (let [key, value] of Object.entries(attribs)) {
		key = key
			.replace(
				/[\x00-\x1f\x7f]/g, $0 => {
					return `\\${('000' + $0.charCodeAt(0).toString(8)).substr(-3)}`;
				});

		value = value
			.replace(
				/[\x00-\x1f\x7f]/g, $0 => {
					return `\\${('000' + $0.charCodeAt(0).toString(8)).substr(-3)}`;
				})
			.replace(/"/g, '\\"');

		lines.push(`user.${key}="${value}"`);
	}

	const args = ['--restore=-'];
	const opts = {
		stdio: ['pipe', 'pipe', 'ignore'],
		input: lines.join('\n'),
		encoding: 'utf8',
		timeout: 3000
	};

	try {
		child_process.execFileSync('setfattr', args, opts);
		return true;
	}
	catch {
		return null;
	}
};

export function getMimeType (path) {
	try {
		return getMimeType.viaAddon(path)
			?? getMimeType.viaChildProcess(path)
			?? null;
	}
	catch (err) {
		printError(err);
		return null;
	}
}

getMimeType.viaGio = path => {
	const args = ['info', '-a', 'standard::icon', path];
	const opts = {
		stdio: ['pipe', 'pipe', 'ignore'],
		timeout: 3000,
		encoding: 'utf8'
	};
	const result = child_process.execFileSync(GIO_EXECUTABLE, args, opts);

	if (/standard::icon:\s*([^\n]+)/.test(result)) {
		return RegExp.$1.split(/,\s*/);
	}
	else {
		throw new Error('mime type not found');
	}
};

let magicAddonCalled = false;
getMimeType.viaAddon = path => {
	if (!magicAddonCalled) {
		function cleanup () {
			try {
				runtime.addon.closeMagic();
			}
			catch {
				;
			}
		}

		process.on('exit', cleanup);
		process.on('SIGINT', cleanup);
		process.on('SIGTERM', cleanup);

		magicAddonCalled = true;
	}
	return runtime.addon.getMagic(path);
};

getMimeType.viaChildProcess = path => {
	const args = ['--mime-type', '--brief', '-E', path];
	const opts = {
		stdio: ['pipe', 'pipe', 'ignore'],
		timeout: 3000,
		encoding: 'utf8'
	};
	return child_process
		.execFileSync('file', args, opts)
		.replace(/^\s+|\s+$/g, '');
};

export function getPropertiesFromPNG (path) {
	const result = new Map;

	let fd;
	try {
		fd = fs.openSync(path);
		const buf = Buffer.alloc(8);
		const {size} = fs.fstatSync(fd);
		let pos = 0;
		let nchunks = 0;

		// signature
		fs.readSync(fd, buf, 0, 8, pos);
		if (Buffer.compare(
			buf,
			Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
			throw new Error('Not a PNG file (invalid signature)');
		}
		pos += 8;
		
		while (pos < size) {
			/*
			 * chunk layout
			 *
			 * +------+------+----------+------+
			 * |length| type |...data...|  CRC |
			 * +------+------+----------+------+
			 *  length: 4 bytes, unsigned int, big-endian,
			 *          means length of data
			 *          (except length itself, type, and CRC)
			 *  type:   4 bytes, means chunk name
			 *  CRC:    4 bytes, means checksum
			 */

			const readBytes = fs.readSync(fd, buf, 0, 8, pos);
			if (readBytes != 8) {
				break;
			}

			const chunkSize = buf.readInt32BE(0);
			const chunkName = buf.toString('latin1', 4, 8);
			if (chunkName === 'IHDR') {
				if (nchunks === 0) {
					if (Buffer.compare(
						buf,
						Buffer.from([0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]))) {
						throw new Error('Not a PNG file (invalid IHDR)');
					}
				}
				else {
					throw new Error('There is IHDR chunk at invalid position');
				}
			}
			else if (chunkName === 'tEXt') {
				if (chunkSize > 8192) {
					throw new Error('tEXt chunk size too large');
				}

				let chunkData = Buffer.alloc(chunkSize);
				const readBytes = fs.readSync(fd, chunkData, 0, chunkSize, pos + 8);
				if (readBytes != chunkSize) {
					throw new Error('Invalid tEXt layout');
				}
				chunkData = chunkData.toString('latin1');

				const sepindex = chunkData.indexOf('\x00');
				if (sepindex < 0) {
					throw new Error('NUL byte not found in tEXt');
				}

				const key = chunkData.substring(0, sepindex);
				const value = chunkData.substring(sepindex + 1);
				result.set(key, value);
			}
			else if (chunkName === 'IEND') {
				break;
			}
			/*
			else {
				console.log(`found chunk: "${chunkName}"`);
			}
			*/

			pos += chunkSize + 4 + 4 + 4;
			nchunks++;
		}
	}
	finally {
		fd && fs.closeSync(fd);
	}

	return result;
}

export function parseIniFile (path) {
	const result = new Map;
	let content;
	let currentMap = new Map;
	let currentKey;

	try {
		content = fs.readFileSync(path, {encoding: 'utf8'});
	}
	catch (err) {
		//printError('cannot load ini file', err);
		return null;
	}

	for (let line of content.split('\n')) {
		if (/^\s*[#;]/.test(line)) continue;
		if (/^\[(.+)\]\s*$/.test(line)) {
			const nextKey = RegExp.$1;
			currentMap.size && result.set(currentKey ?? '*default*', currentMap);
			currentMap = new Map;
			currentKey = nextKey;
		}
		else if (/^([^=\s]+)\s*=\s*(.*)/.test(line)) {
			const key = RegExp.$1;
			const value = RegExp.$2;
			currentMap.set(key, value);
		}
	}

	currentMap.size && result.set(currentKey ?? '*default*', currentMap);

	return result;
}

export function getThumbnailerInfo () {
	const mimeMap = new Map;
	const pathes = [
		SYSTEM_THUMBNAILER_PATH,
		nodePath.join(os.homedir(), USER_THUMBNAILER_PATH)
	];

	pathes.forEach(path => {
		let dirp, file;
		try {
			dirp = fs.opendirSync(path);
			while ((file = dirp.readSync())) {
				if (!file.isFile() && !file.isSymbolicLink()) continue;

				const ini = parseIniFile(nodePath.join(path, file.name));
				if (!ini.has('Thumbnailer Entry')) continue;
				const entry = ini.get('Thumbnailer Entry');

				if (!entry.has('Exec')) continue;
				if (!entry.has('MimeType')) continue;

				const exec = entry.get('Exec');
				const mimeType = entry.get('MimeType');
				for (let mime of mimeType.split(';')) {
					mime = mime
						.replace(/^\s+|\s+/g, '')
						.replace('/', '-');
					if (mime != '') {
						mimeMap.set(mime, exec);
					}
				}
			}
		}
		catch (err) {
			dirp = null;
			if (err.code != 'ENOENT') {
				throw err;
			}
		}
		finally {
			dirp && dirp.closeSync();
		}
	});

	return {
		get: (...mimeTypes) => {
			for (const mimeType of mimeTypes) {
				const value = mimeMap.get(mimeType);
				if (value) {
					return value;
				}
			}
			return undefined;
		},
		has: (...mimeTypes) => {
			return mimeTypes.some(mimeType => mimeMap.has(mimeType));
		},
		get size () {
			return mimeMap.size;
		}
	};
}

export const getUniqueHue = (() => {
	const map = new Map(
		`!:a"b;#c$<d%e=&f'>g(h?)i*@j+k[,l-\\m.n]/o0^p1q_2r3\`s4t{5u6|v7w}8x9~y0z`
			.split('')
			.map((ch, index) => [ch, [index, Math.trunc(index * 5.373134)]]));

	return type => {
		return Math.round((type.split('').reduce((result, current, index) => {
			current = current.replace(/[^!-~]/g, '').toLowerCase();
			result += map.get(current)[1] / Math.pow(2, index);
			return result >= 360 ? result - 360 : result;
		}, 0)));
	};
})();

export function execFilesSync (...items) {
	let tempFilePath;

	function replacer () {
		if (!tempFilePath) {
			tempFilePath = getTempFilePath();
		}
		return tempFilePath;
	}

	try {
		let data;

		for (let i = 0; i < items.length; i++) {
			const item = items[i].slice();
			let command, options;

			// command
			command = item.shift();

			// options
			if (item.length && !Array.isArray(item[item.length - 1])) {
				options = item.pop();
			}

			// override input
			options || (options = {});
			if (i > 0) {
				options.input = data;
			}

			if (/\s/.test(command)) {
				command = command.replace(/\$TEMPFILE\$/g, replacer);
				data = child_process.execSync(command, options);
			}
			else {
				let args = (item.length ? item.pop() : []).map(arg => {
					return ('' + arg).replace(/\$TEMPFILE\$/g, replacer);
				});

				data = child_process.execFileSync(command, args, options);
			}
		}

		return data;
	}
	finally {
		if (tempFilePath) {
			fs.rmSync(tempFilePath, {force: true});
		}
	}
}

export const mimeTypeToIcon = (() => {
	let initialized;
	let currentTheme;
	const themes = [];

	function getCurrentTheme () {
		try {
			const theme = child_process.execFileSync(
				GSETTINGS_EXECUTABLE,
				[
					'get', 'org.gnome.desktop.interface', 'icon-theme'
				],
				{
					stdio: ['pipe', 'pipe', 'ignore'],
					timeout: 3000,
					encoding: 'utf8'
				}
			);
			return theme
				// TODO:
				// This string must be decoded according to the format of
				// GVariant string...
				.replace(/^\s*['"]?|['"]?\s*$/g, '');
		}
		catch (err) {
			return null;
		}
	}

	function parseThemeIndex (themeName, level = 0, childThemeName) {
		if (themes.some(theme => theme[0] == themeName)) return;

		debuglog(`parsing icon theme: themeName: "${themeName}", level: ${level}`);

		const baseDir = nodePath.join(SYSTEM_ICON_PATH, themeName);
		const theme = parseIniFile(nodePath.join(baseDir, 'index.theme'));

		if (!theme) return;

		if (!theme.has('Icon Theme')) return;
		const index = theme.get('Icon Theme');

		if (!index.has('Directories')) return;
		const directories = index.get('Directories').split(/,\s*/);

		const filteredDirectories = [];
		for (const dirName of directories) {
			if (!theme.has(dirName)) continue;
			const dirSection = theme.get(dirName);
			const context = dirSection.get('Context');
			if (context !== 'MimeTypes' && context !== 'Places') continue;
			if (!/^\d+$/.test(dirSection.get('Size'))) continue;

			let size = dirSection.get('Size') - 0, scale = 1, minSize, maxSize;
			let value, value2;

			if (/^\d+$/.test(value = dirSection.get('Scale'))) {
				size *= value - 0;
			}
			if (/^\d+$/.test(value = dirSection.get('MinSize'))
			 && /^\d+$/.test(value2 = dirSection.get('MaxSize'))) {
				minSize = value - 0;
				maxSize = value2 - 0;
			}
			else {
				minSize = maxSize = size;
			}

			filteredDirectories.push(new Map([
				['path', nodePath.join(baseDir, dirName)],
				['minSize', minSize],
				['maxSize', maxSize]
			]));
		}

		if (filteredDirectories.length) {
			filteredDirectories.sort((a, b) => {
				return b.get('maxSize') - a.get('maxSize');
			});
		}
		themes.push([themeName, filteredDirectories]);

		if (index.has('Inherits')) {
			const inherits = index.get('Inherits').split(/,\s*/);
			for (const parent of inherits) {
				parseThemeIndex(parent, level + 1, themeName);
			}
		}
	}

	function init () {
		debuglog(`mimeTypeToIcon#init()`);

		currentTheme = getCurrentTheme();
		if (!currentTheme) {
			debuglog('  failed to get current theme name');
			return initialized = false;
		}

		parseThemeIndex(currentTheme);
		return initialized = true;
	}

	return (mimeTypes, size) => {
		if (initialized === undefined) {
			init();
		}
		if (initialized === false) {
			return null;
		}

		debuglog(`mimeTypeToIcon(): size: ${size}, mimeTypes: ${mimeTypes.join(', ')}`);

		for (const mimeType of mimeTypes) {
			for (const [name, dirs] of themes) {
				if (dirs.length == 0) continue;

				for (const dir of dirs) {
					const path = dir.get('path');
					const minSize = dir.get('minSize');
					const maxSize = dir.get('maxSize');
					if (maxSize < size) continue;

					debuglog(`  ${minSize.toLocaleString('en', {minimumIntegerDigits: 3})} - ${maxSize.toLocaleString('en', {minimumIntegerDigits: 3})}: ${dir.get('path')}`);

					let fileName = nodePath.join(path, `${mimeType}.png`);
					if (fileExists(fileName)) {
						debuglog(`  found: ${fileName}`);
						return fileName;
					}

					fileName = nodePath.join(path, `${mimeType}.svg`);
					if (fileExists(fileName)) {
						debuglog(`  found: ${fileName}`);
						return fileName;
					}
				}
			}
		}

		debuglog(`  icon not found`);
		return null;
	};
})();

export const thumbnailUtils = (() => {
	/*
	 * initializing state
	 *   undefined - not initialized yet
	 *   true      - initializing succeeded
	 *   false     - initializing failed
	 */
	let initialized;

	/*
	 * base directory of thumbnail cache
	 *
	 * typical content:
	 *   '$XDG_CACHE_HOME/thumbnails'
	 *   '~/.cache/thumbnails'
	 */
	let baseDir;

	/*
	 * sixel cache directory
	 *
	 * typical content:
	 *   '~/.cache/thumbnails/sixel/64-16-#000000'
	 *
	 *  * 64      - thumbnail size
	 *  * 16      - cell height
	 *  * #000000 - background color
	 */
	let cacheDir;

	/*
	 * existing thumbnail directories in the desktop environment
	 *
	 * typical content:
	 *   [ '~/.cache/thumbnails/large', '~/.cache/thumbnails/normal' ]
	 *
	 * max size of each directory:
	 *   xx-large: 1024x1024
	 *    x-large: 512x512
	 *      large: 256x256
	 *     normal: 128x128
	 * see https://specifications.freedesktop.org/thumbnail-spec/thumbnail-spec-latest.html
	 */
	let refDirs;

	/*
	 * map object of thumbnailers
	 *
	 * typical content:
	 *   #Map {
	 *     'image-png': '/usr/bin/gdk-pixbuf-thumbnailer -s %s %u %o',
	 *     'video-mp4': 'ffmpegthumbnailer -i %i -o %o -s %s -f'
	 *       :
	 *   }
	 *
	 * place holders:
	 *   %s - thumbnail size
	 *   %u - target URI
	 *   %i - target file path
	 *   %o - output file path
	 */
	let thumbnailerInfo;

	/*
	 * width and height of thumbnail in pixels
	 */
	let thumbSize = 64;

	/*
	 * cell height of terminal, in pixels
	 */
	let cellHeight;

	/*
	 * whether to use pngs that the desktop environment has as icons
	 * corresponding to the mime type
	 */
	let useSystemIcons = false;

	/*
	 * whether to decompose the image into strips of cellHeight units
	 */
	let useStripDecomposition = true;

	/*
	 * whether to make the background color of the sixel transparent
	 */
	let useBackgroundCutoff = true;

	/*
	 * various dimensions obtained relative to the thumbSize value
	 */
	let contentSize;
	let textSize;
	let textOffset;
	let clippedHeight;

	/*
	 * various parameters obtained relative to the cacheDir value
	 */
	let basetimePath;
	let basetime;
	let needUpdateBasetime = false;

	/*
	 * other parameters for rendering image
	 */
	let backgroundColor = [0x22, 0x22, 0x22];
	let fontColor = '#444';
	let fontName = nodePath.join(__dirname, '../font/EBGaramond-Medium.ttf');
	let transparent = nodePath.join(__dirname, '../icon/transparent.png');

	/*
	 * map object of sixel data of mime type icons
	 */
	let mimeTypeIconCache;

	/*
	 * private functions
	 */

	function updateDimensions () {
		contentSize = Math.trunc(thumbSize * .875);
		textSize = Math.trunc(thumbSize * 0.59375);
		textOffset = `+${Math.trunc(thumbSize * 0)}+${Math.trunc(thumbSize * 0.03125)}`
			.replaceAll('+-', '-');
		clippedHeight = Math.trunc(thumbSize * 0.984375);
	}

	function getSixelThumbPath (md5) {
		return nodePath.join(cacheDir, `${md5}.six`);
	}

	function getSixelPathByMimeType (mimeType) {
		return nodePath.join(cacheDir, `${mimeType}.six`);
	}

	function getSystemIconPngPathByMimeType (mimeTypes) {
		return useSystemIcons ? mimeTypeToIcon(mimeTypes, thumbSize) : null;
	}

	function getFallbackPngPathByMimeType (mimeType) {
		return nodePath.join(__dirname, `../icon/${mimeType}.png`);
	}

	function getRefThumbPath (fileName, mtime) {
		return refDirs.reduce((result, dir) => {
			if (result) return result;

			const path = nodePath.join(dir, fileName);
			if (!fileExists(path)) return null;

			/*
			 * note1:
			 * this comparison should use the extended attribute.
			 * however, the current png thumbnail does not appear to have
			 * extended attributes, so we compare using the modification time.
			 *
			 * note2:
			 * assume the precision of 'mtime' variable is in seconds.
			 */
			const thisMtime = Math.trunc(fs.statSync(path).mtimeMs / 1000);
			if (thisMtime < mtime) return null;

			return path;
		}, null);
	}

	function getMimeTypeWrap (path, stat) {
		if (stat.isBlockDevice()) {
			return [
				[
					'inode-blockdevice', 'inode-blockdevice-symbolic',
					'inode-x-generic', 'inode-x-generic-symbolic'
				],
				true];
		}
		if (stat.isCharacterDevice()) {
			return [
				[
					'inode-chardevice', 'inode-chardevice-symbolic',
					'inode-x-generic', 'inode-x-generic-symbolic'
				],
				true];
		}
		if (stat.isDirectory()) {
			return [
				[
					'inode-directory', 'folder',
					'inode-directory-symbolic', 'folder-symbolic'
				],
				true];
		}
		if (stat.isFIFO()) {
			return [
				[
					'inode-fifo', 'inode-fifo-symbolic',
					'inode-x-generic', 'inode-x-generic-symbolic'
				],
				true];
		}
		if (stat.isSymbolicLink()) {
			return [
				[
					'inode-symlink', 'inode-symlink-symbolic',
					'inode-x-generic', 'inode-x-generic-symbolic'
				],
				true];
		}
		if (stat.isSocket()) {
			return [
				[
					'inode-socket', 'inode-socket-symbolic',
					'inode-x-generic', 'inode-x-generic-symbolic'
				],
				true];
		}
		if (useSystemIcons) {
			try {
				return [getMimeType.viaGio(path), false];
			}
			catch {
				;
			}
		}

		return [[getMimeType(path).replace('/', '-')], false];
	}

	function getExtendAttributeWrap (path) {
		const attrib = getExtendAttribute(path);
		if (attrib) {
			return {
				mtime: attrib.get('Thumb::MTime') - 0,
				uri: attrib.get('Thumb::URI')
			};
		}

		try {
			const path2 = path.replace(/\.[^.]+$/, '.json');
			const json = JSON.parse(fs.readFileSync(path2, {encoding: 'utf8'}));
			debuglog(`reading ea from json: "${path2}"`);
			return json;
		}
		catch {
			return null;
		}
	}

	function setExtendAttributeWrap (path, mtime, uri) {
		const result = setExtendAttribute(path, {
			'Thumb::MTime': `${mtime}`,
			'Thumb::URI': uri
		});
		if (result) return result;

		try {
			const path2 = path.replace(/\.[^.]+$/, '.json');
			const content = JSON.stringify({
				mtime: mtime - 0,
				uri: `${uri}`
			});
			fs.writeFileSync(path2, content, {mode:0o600});
			debuglog(`writing ea to json: "${path2}"`);
			return true;
		}
		catch {
			return null;
		}
	}

	function parseTarget (targetPath) {
		init();
		const ext = /^\.([^.]+)$/.test(nodePath.extname(targetPath)) ? RegExp.$1 : '?';
		const uri = pathToFileURL(targetPath).href;
		const md5 = getMD5(uri);
		const sixelThumbPath = getSixelThumbPath(md5);
		/*
		console.log([
			`url: "${uri}"`,
			`md5: ${uri}`,
			`path: "${sixelThumbPath}"`
		].join('\n'));
		*/
		return {ext, uri, md5, sixelThumbPath};
	}

	function getSixelOutputArgs () {
		const result = [
			'-gravity', 'center',
			'-background', getBackgroundColorText(),
			'-extent', `${thumbSize}x${clippedHeight}`
		];

		if (useStripDecomposition) {
			result.push('-crop', `${thumbSize}x${cellHeight}`);
		}

		result.push('sixel:-');

		return result;
	}

	function getBackgroundColorText () {
		return '#' + backgroundColor
			.map(n => `00${n.toString(16)}`.substr(-2))
			.join('')
			.toLowerCase();
	}

	/*
	 * convert thumbnail png of desktop environment to sixel
	 *
	 * thumbnail png example: ~/.cache/thumbnails/[SIZE]/[MD5].png
	 * sixel cache example: ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
	 */
	function createSixelFromPngCache (thumbnailPngPath) {
		let sixel;

		try {
			sixel = child_process.execFileSync(IMAGEMAGICK_EXECUTABLE, [
				thumbnailPngPath, '-thumbnail', `${thumbSize}x${clippedHeight}>`,

				'(', '+clone', '-draw', `image src 0,0 0,0 "${transparent}"`, ')',
				'+swap', '-composite',

				...getSixelOutputArgs()
			], {stdio: 'pipe', encoding: 'utf8'});

			sixel = fixupSixel(sixel);
		}
		catch (err) {
			printError('createSixelFromPngCache', err);
			sixel = null;
		}

		return sixel;
	}

	/*
	 * create thumbnail via thumbnailer, and convert it to sixel
	 *
	 * target path example: ~/picture/foo.mp4
	 * sixel cache example: ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
	 */
	function createSixelViaThumbnailer (commandTemplate, srcUri, srcPath) {
		let sixel;

		try {
			sixel = execFilesSync(
				[
					commandTemplate
						.replace(/%s/g, thumbSize * 2)
						.replace(/%u/g, `"${srcUri.replace(/"/g, '\\"')}"`)
						.replace(/%i/g, `"${srcPath.replace(/"/g, '\\"')}"`)
						.replace(/%o/g, '"$TEMPFILE$"')
						.replace(/%%/g, '%'),
					{stdio: 'pipe'}
				],
				[
					IMAGEMAGICK_EXECUTABLE,
					[
						'$TEMPFILE$', '-thumbnail', `${thumbSize}x${clippedHeight}>`,
						'(', '+clone', '-draw', `image src 0,0 0,0 "${transparent}"`, ')',
						'+swap', '-composite',

						...getSixelOutputArgs()
					],
					{stdio: 'pipe', encoding: 'utf8'}
				]
			);

			sixel = fixupSixel(sixel);
		}
		catch (err) {
			printError('createSixelViaThumbnailer', err);
			sixel = null;
		}

		return sixel;
	}

	/*
	 * convert mime type icon png of desktop environment to sixel
	 *
	 * mime type icon png example: /usr/share/icons/[ICON-THEME]/.../inode-directory.png
	 * sixel cache example: ~/.cache/thumbnails/sixel/[KEY]/inode-directory.six
	 */
	function createSixelFromIconPng (iconPngPath) {
		let sixel;

		try {
			if (/\.png$/i.test(iconPngPath)) {
				sixel = child_process.execFileSync(IMAGEMAGICK_EXECUTABLE, [
					iconPngPath, '-thumbnail', `${thumbSize}x${clippedHeight}>`,

					...getSixelOutputArgs()
				], {stdio: 'pipe', encoding: 'utf8'});
			}
			else if (/\.svg$/i.test(iconPngPath)) {
				sixel = execFilesSync(
					[
						GDK_THUMBNAILER_EXECUTABLE,
						['-s', contentSize, iconPngPath, '$TEMPFILE$'],
						{stdio: 'pipe'}
					],
					[
						IMAGEMAGICK_EXECUTABLE,
						['$TEMPFILE$', ...getSixelOutputArgs()],
						{stdio: 'pipe', encoding: 'utf8'}
					]
				);
			}

			sixel = fixupSixel(sixel);
		}
		catch (err) {
			printError('createSixelFromIconPng', err);
			sixel = null;
		}

		return sixel;
	}

	/*
	 * convert mime type icon png of lss to sixel
	 *
	 * mime type icon png example: [LSS_ROOT]/icon/inode-directory.png
	 * sixel cache example: ~/.cache/thumbnails/sixel/[KEY]/inode-directory.six
	 */
	function createSixelWithLabelFromIconPng (iconPngPath, targetPath, ext) {
		let sixel;

		try {
			const hue = getUniqueHue(ext);
			sixel = child_process.execFileSync(IMAGEMAGICK_EXECUTABLE, [
				iconPngPath , '-thumbnail', `${contentSize}x${contentSize}>`,
				'-fill', `hsl(${hue},100%,50%)`, '-colorize', '15',

				'(',
				'-size', `${textSize}x${textSize}`,
				'-background', 'none',
				'-gravity', 'center',
				'-fill', fontColor,
				'-font', fontName,
				`label:${ext}`,
				')',
				'-gravity', 'south', '-geometry', textOffset, '-composite',

				...getSixelOutputArgs()
			], {stdio: 'pipe', encoding: 'utf8'});

			sixel = fixupSixel(sixel);
		}
		catch (err) {
			printError('createSixelWithLabelFromIconPng', err);
			sixel = null;
		}

		return sixel;
	}

	function loadSixel (path, mtime) {
		if (!fileExists(path)) return null;
		if (basetime && getMTime(path) < basetime) return null;

		const attribs = getExtendAttributeWrap(path);
		if (!attribs) return null;
		if (attribs.mtime !== mtime) return null;

		try {
			return fs.readFileSync(path, 'utf8');
		}
		catch (err) {
			printError('loadSixel', err);
			return null;
		}
	}

	function saveSixel (path, sixel, mtime, uri) {
		try {
			fs.writeFileSync(path, sixel, {mode: 0o600});
			setExtendAttributeWrap(path, mtime, uri);
		}
		catch (err) {
			printError('saveSixel', err);
		}
	}

	function fixupSixel (sixel) {
		if (useBackgroundCutoff) {
			sixel = sixel.replace(/[\x08-\x0d]/g, '');
			const indexes = findBgcolorIndexes(sixel, backgroundColor, CUTOFF_THRESHOLD);
			sixel = cutoffBackgroundColors(sixel, indexes);
		}
		return sixel;
	}

	function transformSixel (sixel) {
		return useStripDecomposition ?
			sixel.match(/\x1bP[^\x1b]+\x1b\\/g) :
			sixel;
	}

	/*
	 * public functions
	 */

	function init () {
		if (initialized !== undefined) {
			return initialized;
		}

		// baseDir
		const cacheHome = (() => {
			let result;

			if (DESKTOP_CACHE_HOME in process.env) {
				result = process.env[DESKTOP_CACHE_HOME];
				if (result != ''
				 && fileExists(result, fs.constants.R_OK | fs.contants.W_OK)) {
					return result;
				}
			}

			result = nodePath.join(os.homedir(), '.cache');
			if (fileExists(result, fs.constants.R_OK | fs.constants.W_OK)) {
				return result;
			}

			return null;
		})();

		if (!cacheHome) {
			console.error('cacheHome is unavailable');
			return initialized = false;
		}

		baseDir = nodePath.join(cacheHome, 'thumbnails');

		// refDirs
		refDirs = ['xx-large', 'x-large', 'large', 'normal']
			.map(name => {
				const path = nodePath.join(baseDir, name);
				return fileExists(path) ? path : null;
			})
			.filter(path => !!path);

		// thumbSize, cellHeight
		if (typeof thumbSize != 'number') {
			console.error('thumbSize is not a number');
			return initialized = false;
		}
		if (typeof cellHeight != 'number') {
			console.error('cellHeight is not a number');
			return initialized = false;
		}
		updateDimensions();

		// cacheDir
		cacheDir = nodePath.join(
			baseDir,
			CACHE_ROOT_NAME,
			`${thumbSize}-${cellHeight}-${getBackgroundColorText()}`);
		try {
			fs.mkdirSync(cacheDir, {
				recursive: true,
				mode: 0o700
			});
		}
		catch (err) {
			console.error(errorMessage(`failed to make directory "${cacheDir}"`, err));
			return initialized = false;
		}

		try {
			const child = child_process.spawnSync(
				IMAGEMAGICK_EXECUTABLE, ['-version'], {
					stdio: 'pipe',
					encoding: 'utf8'
				});
			if (child.status !== 0) {
				throw new Error(`imagemagick returned an invalid exit code`);
			}
		}
		catch (err) {
			console.error(errorMessage('failed to check imagemagick version', err));
			return initialized = false;
		}

		mimeTypeIconCache = new Map;

		basetimePath = nodePath.join(cacheDir, '.basetime');
		if (needUpdateBasetime) {
			fileTouch(basetimePath);
			needUpdateBasetime = false;
		}
		if (fileExists(basetimePath)) {
			basetime = getMTime(basetimePath);
		}

		return initialized = true;
	}

	function clearSixelCache (targetPath) {
		clearMemoryCache();

		const {ext, sixelThumbPath} = parseTarget(targetPath);

		// rm ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
		fs.rmSync(sixelThumbPath, {force: true});

		// rm ~/.cache/thumbnails/sixel/[KEY]/[EXTENSION].six
		const sixelExtIconPath = getSixelPathByMimeType(ext);
		fs.rmSync(sixelExtIconPath, {force: true});

		// rm ~/.cache/thumbnails/sixel/[KEY]/[MIME].six
		let stat;
		try {
			stat = fs.statSync(targetPath, {bigint: true});
		}
		catch {
			return;
		}

		const savedUSI = useSystemIcons;
		try {
			[false, true].forEach(value => {
				useSystemIcons = value;
				const [mimeTypes] = getMimeTypeWrap(targetPath, stat);
				for (const mimeType of mimeTypes) {
					const sixelIconPath = getSixelPathByMimeType(mimeType);
					fs.rmSync(sixelIconPath, {force: true});
				}
			});
		}
		finally {
			useSystemIcons = savedUSI;
		}
	}

	function clearPngCache (targetPath) {
		clearMemoryCache();

		const {md5} = parseTarget(targetPath);
		const fileName = `${md5}.png`;
		refDirs.forEach(dir => {
			fs.rmSync(nodePath.join(dir, fileName), {force: true});
		});
	}

	function clearMemoryCache () {
		mimeTypeIconCache.clear();
	}

	function invalidateCache () {
		needUpdateBasetime = true;
	}

	function get (targetPath, targetStat) {
		/*
		 * check if targetPath exists and retrieve real path
		 */
		try {
			targetPath = fs.realpathSync(targetPath);
		}
		catch (err) {
			return {error: errorMessage('cannot retrieve real path', err)};
		}

		/*
		 * if targetPath points in baseDir, don't generate thumbnail
		 */
		if (targetPath.startsWith(baseDir)) {
			return {error: errorMessage('inside cache directory')};
		}

		/*
		 * uri: ex. file://home/akahuku/picture/foo.jpg
		 * sixelThumbPath: ex. ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
		 */
		const {ext, uri, md5, sixelThumbPath} = parseTarget(targetPath);
		let stat, targetMtime;

		/*
		 * get mtime of targetPath
		 */
		try {
			stat = targetStat ?? fs.statSync(targetPath, {bigint: true});
			targetMtime = getMTime(stat, 's');
		}
		catch (err) {
			return {error: errorMessage('cannot stat', err)};
		}

		/*
		 * there are 10 types of thumbnails/icons:
		 *
		 * - content thumbnail
		 *     1. content thumbnail from sixel cache
		 *          ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
		 *
		 *     2. content thumbnail from thumbnail png for desktop environment
		 *          ~/.cache/thumbnails/large/[MD5].png
		 *          -> ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
		 *
		 *     3. content thumbnail generated by thumbnailer for desktop environment
		 *          targetPath
		 *          -> ~/.cache/thumbnails/sixel/[KEY]/[MD5].six
		 *
		 * - mime-type icon
		 *     4. mime-type icon from memory cache
		 *          mimeTypeIconCache
		 *
		 *
		 *     5. mime-type icon from sixel cache
		 *          ~/.cache/thumbnails/sixel/[KEY]/[MIME].six
		 *
		 *     6. mime-type icon from mime-type icon png for desktop environment
		 *          /usr/share/icons/[ICON-THEME]/.../[MIME].png
		 *          -> ~/.cache/thumbnails/sixel/[KEY]/[MIME].six
		 *
		 *
		 *     7. fallback mime-type icon for specific mime-types from sixel cache
		 *          ~/.cache/thumbnails/sixel/[KEY]/[MIME].six
		 *
		 *     8. fallback mime-type icon for specific mime-types from embeded icon
		 *          [LSS_ROOT]/icon/[MIME].png
		 *          -> ~/.cache/thumbnails/sixel/[KEY]/[MIME].six
		 *
		 *
		 *     9. fallback extension label icon from sixel cache
		 *          ~/.cache/thumbnails/sixel/[KEY]/[EXTENSION].six
		 *
		 *    10. fallback extension label icon from embeded icon
		 *          [LSS_ROOT]/icon/!regular.png
		 *          -> ~/.cache/thumbnails/sixel/[KEY]/[EXTENSION].six
		 */

		/*
		 * ====================================================================
		 * 1. content thumbnail from sixel cache
		 */
		{
			const sixel = loadSixel(sixelThumbPath, targetMtime);
			if (sixel) {
				return {
					content: transformSixel(sixel),
					path: sixelThumbPath,
					source: 'reason 1: content thumbnail from sixel cache'
				};
			}
		}

		/*
		 * ====================================================================
		 * 2. content thumbnail from thumbnail png for desktop environment
		 */
		{
			let refThumbPath, sixel;
			if ((refThumbPath = getRefThumbPath(`${md5}.png`, targetMtime))
			 && (sixel = createSixelFromPngCache(refThumbPath))) {
				saveSixel(sixelThumbPath, sixel, targetMtime, uri);
				return {
					content: transformSixel(sixel),
					path: sixelThumbPath,
					source: 'reason 2: content thumbnail from thumbnail png for desktop environment'
				};
			}
		}

		/*
		 * ====================================================================
		 * 3. content thumbnail generated by thumbnailer for desktop environment
		 */
		const [mimeTypes, isSpecificMimeType] = getMimeTypeWrap(targetPath, stat);
		if (!thumbnailerInfo) {
			thumbnailerInfo = getThumbnailerInfo();
		}
		if (thumbnailerInfo.has(...mimeTypes)) {
			const sixel = createSixelViaThumbnailer(
				thumbnailerInfo.get(...mimeTypes), uri, targetPath);
			if (sixel) {
				saveSixel(sixelThumbPath, sixel, targetMtime, uri);
				return {
					content: transformSixel(sixel),
					path: sixelThumbPath,
					source: 'reason 3: content thumbnail generated by thumbnailer for desktop environment'
				};
			}
		}

		// ex. ~/.cache/thumbnail/sixel/[KEY]/inode-directory.six
		//     ~/.cache/thumbnail/sixel/[KEY]/text-plain.six
		const sixelMimeIconPath = getSixelPathByMimeType(mimeTypes[0]);

		// ex. ~/.cache/thumbnail/sixel/[KEY]/txt.six
		//     ~/.cache/thumbnail/sixel/[KEY]/ti.six
		const sixelExtIconPath = getSixelPathByMimeType(ext);

		/*
		 * ====================================================================
		 * 4. mime-type icon from memory cache
		 */
		if (mimeTypeIconCache.has(mimeTypes[0])) {
			return {
				content: mimeTypeIconCache.get(mimeTypes[0]),
				path: sixelMimeIconPath,
				source: 'reason 4: mime-type icon from memory cache'
			};
		}
		else if (mimeTypeIconCache.has(ext)) {
			return {
				content: mimeTypeIconCache.get(ext),
				path: sixelExtIconPath,
				source: 'reason 4.1: extension label icon from memory cache'
			};
		}

		/*
		 * ====================================================================
		 * 5. mime-type icon from sixel cache
		 * 6. mime-type icon from mime-type icon png for desktop environment
		 */
		{
			// ex. /usr/share/icons/[ICON-THEME]/.../inode-directory.png
			const iconPngPath = getSystemIconPngPathByMimeType(mimeTypes);
			if (iconPngPath) {
				const pngMTime = getMTime(iconPngPath, 's');

				let sixel = loadSixel(sixelMimeIconPath, pngMTime);
				if (sixel) {
					sixel = transformSixel(sixel);
					mimeTypeIconCache.set(mimeTypes[0], sixel);
					return {
						content: sixel,
						path: sixelMimeIconPath,
						source: 'reason 5: mime-type icon from sixel cache'
					};
				}

				sixel = createSixelFromIconPng(iconPngPath);
				if (sixel) {
					saveSixel(sixelMimeIconPath, sixel, pngMTime, pathToFileURL(iconPngPath).href);
					sixel = transformSixel(sixel);
					mimeTypeIconCache.set(mimeTypes[0], sixel);
					return {
						content: sixel,
						path: sixelMimeIconPath,
						source: 'reason 6: mime-type icon from mime-type icon png for desktop environment'
					};
				}
			}
		}

		/*
		 * ====================================================================
		 * 7. fallback mime-type icon for specific mime-types from sixel cache
		 * 8. fallback mime-type icon for specific mime-types from embeded icon
		 */
		if (isSpecificMimeType) {
			const fallbackIconPngPath = getFallbackPngPathByMimeType(mimeTypes[0]);
			const pngMTime = getMTime(fallbackIconPngPath, 's');

			let sixel = loadSixel(sixelMimeIconPath, pngMTime);
			if (sixel) {
				sixel = transformSixel(sixel);
				mimeTypeIconCache.set(mimeTypes[0], sixel);
				return {
					content: sixel,
					path: sixelMimeIconPath,
					source: 'reason 7: fallback mime-type icon for specific mime-types from sixel cache'
				};
			}

			sixel = createSixelFromIconPng(fallbackIconPngPath);
			if (sixel) {
				saveSixel(sixelMimeIconPath, sixel, pngMTime, pathToFileURL(fallbackIconPngPath).href);
				sixel = transformSixel(sixel);
				mimeTypeIconCache.set(mimeTypes[0], sixel);
				return {
					content: sixel,
					path: sixelMimeIconPath,
					source: 'reason 8: fallback mime-type icon for specific mime-types from embeded icon'
				};
			}
		}

		/*
		 * ====================================================================
		 *  9. fallback extension label icon from sixel cache
		 * 10. fallback extension label icon from embeded icon
		 */
		else {
			const fallbackIconPngPath = getFallbackPngPathByMimeType('!regular');
			const pngMTime = getMTime(fallbackIconPngPath, 's');

			let sixel = loadSixel(sixelExtIconPath, pngMTime);
			if (sixel) {
				sixel = transformSixel(sixel);
				mimeTypeIconCache.set(ext, sixel);
				return {
					content: sixel,
					path: sixelExtIconPath,
					source: 'reason 9: fallback extension label icon from sixel cache'
				};
			}

			sixel = createSixelWithLabelFromIconPng(fallbackIconPngPath, targetPath, ext);
			if (sixel) {
				saveSixel(sixelExtIconPath, sixel, pngMTime, pathToFileURL(fallbackIconPngPath).href);
				sixel = transformSixel(sixel);
				mimeTypeIconCache.set(ext, sixel);
				return {
					content: sixel,
					path: sixelExtIconPath,
					source: 'reason 10: fallback extension label icon from embeded icon'
				};
			}
		}

		return {
			error: 'unknown error'
		};
	}

	function diagnose () {
		console.log('*** diagnostics on programs for thumbnail creation ***');

		let maxNameLength = 0;
		const names = [
			GSETTINGS_EXECUTABLE,
			GIO_EXECUTABLE,
			GDK_THUMBNAILER_EXECUTABLE,
			IMAGEMAGICK_EXECUTABLE
		];
		const opts = {
			stdio: ['pipe', 'pipe', 'ignore'],
			encoding: 'utf8',
			timeout: 3000
		};
		const lines = names.map(name => {
			let result;
			maxNameLength = Math.max(maxNameLength, name.length);

			try {
				const location = child_process
					.execFileSync('which', [name], opts)
					.split('\n')[0];

				result = `✅ ${location}`;
			}
			catch (err) {
				result = `❌`;
			}

			return [name, result];
		});

		lines.forEach(line => {
			const pad = ' '.repeat(maxNameLength - line[0].length);
			console.log(`${pad}${line[0]}: ${line[1]}`);
		});
	}

	return {
		init, get, clearSixelCache, clearPngCache, clearMemoryCache, invalidateCache,
		diagnose,

		get cacheDir () {
			init();
			return cacheDir;
		},
		get cacheRootDir () {
			init();
			return fs.realpathSync(nodePath.join(baseDir, CACHE_ROOT_NAME));
		},
		get baseDir () {
			init();
			return baseDir;
		},
		get refDirs () {
			init();
			return refDirs;
		},

		get background () {
			return getBackgroundColorText();
		},
		set background (value) {
			if (typeof value == 'string' && /[0-9a-f]{6}/i.test(value)) {
				backgroundColor = value
					.match(/[0-9a-f]{2}/gi)
					.map(n => parseInt(n, 16))
					.slice(0, 3);
				initialized = undefined;
			}
		},

		get cellHeight () {
			return cellHeight;
		},
		set cellHeight (value) {
			if (typeof value == 'number') {
				cellHeight = value;
				initialized = undefined;
			}
		},

		get thumbSize () {
			return thumbSize;
		},
		set thumbSize (value) {
			if (typeof value == 'number'
			 && 16 <= value && value <= 256) {
				thumbSize = value;
				initialized = undefined;
			}
		},

		get useSystemIcons () {
			return useSystemIcons;
		},
		set useSystemIcons (value) {
			useSystemIcons = !!value;
		},

		get useStripDecomposition () {
			return useStripDecomposition;
		},
		set useStripDecomposition (value) {
			useStripDecomposition = !!value;
		},

		get useBackgroundCutoff () {
			return useBackgroundCutoff;
		},
		set useBackgroundCutoff (value) {
			useBackgroundCutoff = !!value;
		}
	};
})();
