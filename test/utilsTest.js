import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import Unistring from '@akahuku/unistring';

import {
	splitDCSSequences,
	iterateLines,
	countLines
} from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * asserts:
 *   equal(actual, expected[, message])
 */

describe('Collation', () => {
	const sortee = ['Z', 'a', 'z', 'ä'/*U+00e4*/, 'X', 'Ò'/*U+00d2*/];
	const sortee2 = [
		// sort result of ja_JP.UTF-8
		'( Sorted by',
		'0 Codepoint',
		'A within',
		'z latin-1 category.',
		'あ ひらがなが',
		'か カタカナよりも',
		'ア 先にソート',
		'カ されるようです',
		'ヴ 特殊なカタカナは最後です',
		'阿 漢字は JIS X 2028の順序、',
		'鏡 つまり',
		'砂 読みのゆるいあいうえお順に',
		'他 なるようです'
	];

	function dumpString (s) {
		for (const ch of s) {
			process.stdout.write(`${ch}[U+`);
			process.stdout.write(`0000${ch.codePointAt(0).toString(16)}`.substr(-4));
			process.stdout.write(':');
			dumpBuffer(Buffer.from(ch));
			process.stdout.write('] ');
		}
		process.stdout.write('\n');
	}

	function dumpBuffer (b) {
		for (let i = 0; i < b.length; i++) {
			process.stdout.write(`00${b[i].toString(16)}`.substr(-2));
			if (i < b.length - 1) {
				process.stdout.write(' ');
			}
		}
	}

	it('Intl default sort', () => {
		const collator = new Intl.Collator('en', {
			usage: 'sort',
			sensitivity: 'variant',
			caseFirst: 'upper'
		});
		const result = sortee.slice().sort(collator.compare);
		assert.deepEqual(result, ['a', 'ä', 'Ò', 'X', 'Z', 'z']);
	});

	/*
	 * note: Intl or Array#sort is completely unrelated to strcoll() and
	 *       LC_COLLATE data, so the results will not be the same in many cases.
	 *
	 * note2: source of system locale data: e.g. for ja_JP, /usr/share/i18n/locales/ja_JP
	 */

	it('ls original sort vs Intl default sort', () => {
		const collator = new Intl.Collator('ja-jp', {
			usage: 'sort',
			sensitivity: 'variant',
			caseFirst: 'upper'
		});
		const result = sortee2.slice().sort(collator.compare);
		assert.equal(result.length, sortee2.length);
		console.log(result.join('\n'));
		for (let i = 0; i < sortee2.length; i++) {
			if (result[i] !== sortee2[i]) {
				console.log('-'.repeat(30), i);
				console.log(`ls original result: "${sortee2[i]}"`);
				dumpString(sortee2[i].substring(0, 10));
				console.log('');
				console.log(`   emulated result: "${result[i]}"`);
				dumpString(result[i].substring(0, 10));
				assert.equal(result[i], sortee2[i]);
				break;
			}
		}
		//assert.deepEqual(result, sortee2);
	});

	it('ls original sort vs ordinary sort', () => {
		const result = sortee2.slice().sort();
		assert.equal(result.length, sortee2.length);
		console.log(result.join('\n'));
		for (let i = 0; i < sortee2.length; i++) {
			if (result[i] !== sortee2[i]) {
				console.log('-'.repeat(30), i);
				console.log(`ls original result: "${sortee2[i]}"`);
				dumpString(sortee2[i].substring(0, 10));
				console.log('');
				console.log(`   emulated result: "${result[i]}"`);
				dumpString(result[i].substring(0, 10));
				assert.equal(result[i], sortee2[i]);
				break;
			}
		}
		//assert.deepEqual(result, sortee2);
	});
});

describe('splitDCSSequences', () => {
	function iterate (source) {
		const result = [];
		for (const chunk of splitDCSSequences(source)) {
			result.push(chunk);
		}
		return result;
	}

	it('empty string', () => {
		const result = iterate('');
		assert.deepEqual(result, []);
	});

	it('non DCS sequence', () => {
		const result = iterate('foo');
		assert.deepEqual(result, [['foo', 0]]);
	});
	
	it('only DCS sequence', () => {
		const result = iterate('\x1bP<<<some\nsequence>>>\x1b\\');
		assert.deepEqual(result, [
			['\x1bP<<<some\nsequence>>>\x1b\\', 2],
		]);
	});

	it('leftmost DCS sequence', () => {
		const result = iterate('\x1bP<<<some sequence>>>\x1b\\right-text');
		assert.deepEqual(result, [
			['\x1bP<<<some sequence>>>\x1b\\', 2],
			['right-text', 0]
		]);
	});

	it('rightmost DCS sequence', () => {
		const result = iterate('left-text\x1bP<<<some sequence>>>\x1b\\');
		assert.deepEqual(result, [
			['left-text', 0],
			['\x1bP<<<some sequence>>>\x1b\\', 2],
		]);
	});
});

describe('iterateLines (strict)', () => {
	function iterate (source) {
		const result = [];
		for (const chunk of iterateLines(source, true)) {
			result.push(chunk[0]);
		}
		return result;
	}

	it('#1', () => {
		const result = iterate('foo\nbar\nbaz\nbax');
		assert.deepEqual(result, [
			'foo',
			'\n',
			'bar',
			'\n',
			'baz',
			'\n',
			'bax'
		]);
	});

	it('#2', () => {
		const result = iterate('foo\r\nbar\r\nbaz\nbax');
		assert.deepEqual(result, [
			'foo\r\nbar\r\nbaz',
			'\n',
			'bax'
		]);
	});
});

describe('countLines', () => {
	it('#1', () => {
		const result = countLines('abc\ndef\nghi');
		assert.equal(result, 3);
	});
	it('#2', () => {
		const result = countLines('abc\ndef\nghi\n');
		assert.equal(result, 3);
	});
	it('#3', () => {
		const result = countLines('abc\ndef\nghi\n', 2);
		assert.equal(result, 2);
	});
});
