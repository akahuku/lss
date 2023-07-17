import assert from 'node:assert/strict';
import child_process from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	runtime
} from '../src/base.js';
import {
	stdioFilter,
	getTerminalCapabilitiesFromSpec
} from '../src/utils.js';
import {
	log
} from '../src/logger.js';

import {
	getMD5, getMimeType,
	getExtendAttribute, setExtendAttribute,
	getMTime, getPropertiesFromPNG,
	parseIniFile, getThumbnailerInfo,
	execFilesSync, getUniqueHue,
	mimeTypeToIcon, thumbnailUtils
} from '../src/thumbnail.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sixelHeaderPattern = /^\x1bP[^;]*;[^;]*;[^;]*q/;

let termInfo;

function testThumbnail (target, testResults) {
	for (let i = 0; i < testResults.length; i++) {
		if (i == 2) {
			thumbnailUtils.clearMemoryCache();
		}

		const result = thumbnailUtils.get(target);
		const expectArrayLength = thumbnailUtils.thumbSize / thumbnailUtils.cellHeight;

		assert.ok(
			Array.isArray(result.content),
			`ensure #${i + 1} content is an array`);

		assert.equal(
			result.content.length,
			expectArrayLength,
			`ensure #${i + 1} content has ${expectArrayLength} elements`);

		for (const line of result.content) {
			assert.match(line, sixelHeaderPattern, `#${i + 1} content`);
		}

		assert.equal(
			result.source,
			testResults[i],
			`#${i + 1} source`);

		printSixel(result.content, `${target} (#${i + 1} try)`);
	}
}

function printSixel (content, label) {
	if (termInfo.da1.sixel) {
		if (typeof content == 'string') {
			process.stdout.write(content);
		}
		else if (Array.isArray(content)) {
			process.stdout.write(`\x1b[?8452h`);
			try {
				for (let i = 0; i < content.length; i++) {
					process.stdout.write(
						i == 0 ? `${content[i]} ${label}` :
								 `${content[i]}`);
					process.stdout.write('\n');
				}
			}
			finally {
				process.stdout.write(`\x1b[?8452l`);
			}
		}
	}
}

async function getNativeMD5 (text) {
	return (await stdioFilter(text, 'md5sum'))
		.toString()
		.match(/^([0-9a-fA-F]+)/)[0];
}

async function getNativeMTime (path) {
	return (await stdioFilter(null, 'stat', ['--printf', '%Y', path]))
		.toString() - 0;
}

/*
 * asserts:
 *   equal(actual, expected[, message])
 */

before(() => {
	if (!('TERMSPEC' in process.env)) {
		throw new Error('TERMSPEC env var is required, but undefined');
	}

	termInfo = getTerminalCapabilitiesFromSpec(process.env.TERMSPEC);
	if (typeof termInfo.height != 'number') {
		throw new Error('Terminal height is required, but undefined');
	}

	runtime.isVerbose = true;

	thumbnailUtils.background = termInfo.bg;
	thumbnailUtils.cellHeight = termInfo.height / termInfo.lines;
	const result = thumbnailUtils.init();
	if (!result) {
		throw new Error('failed to initialize thumbnailUtils');
	}
});

describe('getMD5', () => {
	it('should generate correct md5 hash', async () => {
		const arg = 'file:///home/user/akahuku/picture/foo/bar/baz.png';
		const result = getMD5(arg);
		const expected = await getNativeMD5(arg);
		assert.equal(result, expected);
	});
});

describe('getMimeType.viaGio', () => {
	it('should return correct mime type', () => {
		const arg = path.join(__dirname, 'test.png');
		const result = getMimeType.viaGio(arg);
		assert.ok(Array.isArray(result));
		assert.ok(result.includes('image-png'));
	});

	it('should raise an error for non-exist file', () => {
		assert.throws(() => {
			getMimeType.viaGio('noexist.noexist');
		});
	});
});

describe('getMimeType.viaAddon', () => {
	it('should return correct mime type', () => {
		const arg = path.join(__dirname, 'test.png');
		const result = getMimeType.viaAddon(arg);
		assert.equal(result, 'image/png');
	});

	it('should raise an error for non-exist file', () => {
		assert.throws(() => {
			getMimeType.viaAddon('noexist.noexist');
		});
	});
});

describe('getMimeType.viaChildProcess', () => {
	it('should return correct mime type', () => {
		const arg = path.join(__dirname, 'test.png');
		const result = getMimeType.viaChildProcess(arg);
		assert.equal(result, 'image/png');
	});

	it('should raise an error for non-exist file', () => {
		assert.throws(() => {
			getMimeType.viaChildProcess('noexist.noexist');
		});
	});
});

describe('[gs]etExtendAttribute.viaAddon', () => {
	it('should set and get ea', () => {
		const value = randomBytes(16).toString('hex');
		setExtendAttribute.viaAddon(__filename, {
			'test key': value
		});

		const result = getExtendAttribute.viaAddon(__filename);
		assert.ok(result instanceof Map);
		assert.ok(result.has('test key'));
		assert.equal(result.get('test key'), value);
	});

	it('should return null for non-exist file', () => {
		const result = getExtendAttribute.viaAddon('noexist.noexist');
		assert.equal(result, null);
	});
});

describe('[gs]etExtendAttribute.viaChildProcess', () => {
	it('should set and get ea', () => {
		const value = randomBytes(16).toString('hex');
		setExtendAttribute.viaChildProcess(__filename, {
			'test key': value
		});

		const result = getExtendAttribute.viaChildProcess(__filename);
		assert.ok(result instanceof Map);
		assert.ok(result.has('test key'));
		assert.equal(result.get('test key'), value);
	});

	it('should return null for non-exist file', () => {
		const result = getExtendAttribute.viaChildProcess('noexist.noexist');
		assert.equal(result, null);
	});
});

describe('getMTime', () => {
	it('should return correct mtime', async () => {
		const result = getMTime(__filename, 's');
		const expected = await getNativeMTime(__filename);
		assert.equal(result, expected);
	});

	it('should return NaN for non-exist file', () => {
		const result = getMTime(path.join(__dirname, 'nonexist.nonexist'));
		assert.ok(Number.isNaN(result));
	});
});

describe('getPropertiesFromPNG', () => {
	it('should return text chunks', () => {
		const result = getPropertiesFromPNG(path.join(__dirname, 'test.png'));
		assert.deepEqual(Object.fromEntries(result), {
			'Thumb::URI': 'file:///home/akahuku/picture/~~(koito-point!!)~~.png',
			'Thumb::MTime': '1690503517',
			'Software': 'GNOME::ThumbnailFactory'
		});
	});
});

describe('parseIniFile', () => {
	it('should return null for invalid ini file path', () => {
		const result = parseIniFile(path.join(__dirname, 'thumbnailer-test-noexist.ini'));
		assert.equal(result, null);
	});

	it('should parse as map', () => {
		const result = parseIniFile(path.join(__dirname, 'thumbnailer-test.ini'));
		assert.ok(result.has('Thumbnailer Entry'));
		assert.deepEqual(Object.fromEntries(result.get('Thumbnailer Entry')), {
			'TryExec': 'ffmpegthumbnailer',
			'Exec': 'ffmpegthumbnailer -i %i -o %o -s %s -f',
			'MimeType': 'video/jpeg;video/mp4;video/mpeg;video/quicktime;video/x-ms-asf;video/x-ms-wm;video/x-ms-wmv;video/x-ms-asx;video/x-ms-wmx;video/x-ms-wvx;video/x-msvideo;video/x-flv;video/x-matroska;application/mxf;video/3gp;video/3gpp;video/dv;video/divx;video/fli;video/flv;video/mp2t;video/mp4v-es;video/msvideo;video/ogg;video/vivo;video/vnd.divx;video/vnd.mpegurl;video/vnd.rn-realvideo;application/vnd.rn-realmedia;video/vnd.vivo;video/webm;video/x-anim;video/x-avi;video/x-flc;video/x-fli;video/x-flic;video/x-m4v;video/x-mpeg;video/x-mpeg2;video/x-nsv;video/x-ogm+ogg;video/x-theora+ogg'
		});
	});
});

describe('getThumbnailerInfo', () => {
	it('should get all thumbnailers', () => {
		const result = getThumbnailerInfo();
		assert.ok(result instanceof Object);
		assert.ok(result.size > 0);
	});
});

describe('execFilesSync', () => {
	it('should return valid result from piped commands', () => {
		const result = execFilesSync(
			['ls -l'],
			['sed', ['-e', 's!  *! !g']],
			['cut', ['--delimiter= ', '--fields=3']],
			['sed', ['-e', '/^\\s*$/d']],
			['sort'],
			['uniq'],
			['wc -l', {encoding: 'utf8'}]
		);
		assert.match(result, /^\d*\d+\n?$/);
	});
});

describe('getUniqueHue', () => {
	const EXTS = 'js,json,c,cpp,h,hpp,html,txt,zip,gz';

	EXTS.split(',').forEach(ext => {
		it(`ext: ${ext}`, () => {
			const hue = getUniqueHue(ext);

			if (termInfo.da1.sixel) {
				const sixel = child_process.execFileSync('convert', [
					'-size', '64x16', 'canvas:',
					'-fill', `hsl(${hue},100%,50%)`,
					'-colorize', '20',
					'sixel:-'
				], {encoding: 'utf8'});

				process.stdout.write(
					`\x1b[?8452h${sixel} ${('   ' + hue).substr(-3)} (${ext})\x1b[?8452l\n`);
			}
			else {
				process.stdout.write(
					`${('   ' + hue).substr(-3)} (${ext})\n`);
			}

			assert.ok(typeof hue == 'number');
		});
	});
});

describe('mimeTypeToIcon', () => {
	it('initialize', () => {
		const result = mimeTypeToIcon(getMimeType.viaGio(__filename), 64);
		assert.match(result, /\.(?:png|svg)$/);
	});
});

describe('thumbnailUtils', () => {
	beforeEach(() => {
		thumbnailUtils.useSystemIcons = false;
	});

	it('should initialize', () => {
		const cacheDir = thumbnailUtils.cacheDir;
		assert.ok(typeof cacheDir == 'string');
	});

	it('should get an error for access denied file', () => {
		const target = '/etc/ssl/private/ssl-cert-snakeoil.key';
		
		thumbnailUtils.clearSixelCache(target);

		// 1st try (nocache)
		const result = thumbnailUtils.get(target);
		assert.equal(result.content, undefined);
		assert.ok(result.error);

		// 2nd try (cache)
		const result2 = thumbnailUtils.get(target);
		assert.equal(result2.content, undefined);
		assert.ok(result2.error);
	});

	it('should raise an exception for non-exist file', () => {
		const target = path.join(__dirname, 'lenna-non-exist.jpg');
		const result = thumbnailUtils.get(target);
		assert.ok(result.error);
	});

	it('type 2,1: content thumbnail from thumbnail png for desktop environment', () => {
		const target = path.join(__dirname, 'lenna.jpg');
		
		// clear all caches for target
		thumbnailUtils.clearSixelCache(target);
		thumbnailUtils.clearPngCache(target);

		// prepare png thumbnail
		const fileURL = pathToFileURL(target).href;
		const fileURLMD5 = getMD5(fileURL);
		const thumbnailPath = path.join(thumbnailUtils.baseDir, `large/${fileURLMD5}.png`);

		child_process.execFileSync('gdk-pixbuf-thumbnailer', [
			'-s', '256',
			target, thumbnailPath
		]);

		testThumbnail(target, [
			'reason 2: content thumbnail from thumbnail png for desktop environment',
			'reason 1: content thumbnail from sixel cache'
		]);
	});

	it('type 3,1: content thumbnail generated by thumbnailer for desktop environment', () => {
		const target = path.join(__dirname, 'lenna.jpg');
		
		thumbnailUtils.clearSixelCache(target);
		thumbnailUtils.clearPngCache(target);

		testThumbnail(target, [
			'reason 3: content thumbnail generated by thumbnailer for desktop environment',
			'reason 1: content thumbnail from sixel cache'
		]);
	});

	it('type 10,4,9: fallback extension label icon from embeded icon', () => {
		const target = __filename;
		
		thumbnailUtils.clearSixelCache(target);

		testThumbnail(target, [
			'reason 10: fallback extension label icon from embeded icon',
			'reason 4.1: extension label icon from memory cache',
			'reason 9: fallback extension label icon from sixel cache'
		]);
	});

	it('type 8,4,7: fallback mime-type icon for specific mime-types from embeded icon', () => {
		const target = __dirname;
		
		thumbnailUtils.clearSixelCache(target);

		testThumbnail(target, [
			'reason 8: fallback mime-type icon for specific mime-types from embeded icon',
			'reason 4: mime-type icon from memory cache',
			'reason 7: fallback mime-type icon for specific mime-types from sixel cache'
		]);
	});

	// type 6,4,5
	it('type 6,4,5: mime-type icon from mime-type icon png for desktop environment', () => {
		const target = __dirname;

		thumbnailUtils.clearSixelCache(target);
		thumbnailUtils.useSystemIcons = true;

		testThumbnail(target, [
			'reason 6: mime-type icon from mime-type icon png for desktop environment',
			'reason 4: mime-type icon from memory cache',
			'reason 5: mime-type icon from sixel cache'
		]);
	});
});
