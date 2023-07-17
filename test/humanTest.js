/*
 * incomplete port of gnulib/tests/test-quotearg-simple.c
 */

import assert from 'node:assert/strict';

import {humanUtils} from '../src/human.js';

describe('strtoul', () => {
	it('should return 0 for empty string', () => {
		const p = {};
		const result = humanUtils.strtoul('', p);
		assert.equal(result, 0);
		assert.deepEqual(p, {p: 0});
	});

	it('should return 0 for space only string', () => {
		const p = {};
		const result = humanUtils.strtoul('  \t   ', p);
		assert.equal(result, 0);
		assert.deepEqual(p, {p: 0});
	});

	it('should return errno for negative value', () => {
		const p = {};
		const result = humanUtils.strtoul('-200', p);
		assert.equal(result, 0);
		assert.deepEqual(p, {p: 0, errno: 'EINVAL'});
	});

	it('should return errno for wrong base', () => {
		const p = {};
		const result = humanUtils.strtoul('200', p, -1);
		assert.equal(result, 0);
		assert.deepEqual(p, {errno: 'EINVAL'});
	});

	it('hex value (correct)', () => {
		const p = {};
		const result = humanUtils.strtoul('0x100', p);
		assert.equal(result, 256);
		assert.deepEqual(p, {p: 5});
	});

	it('hex value (wrong)', () => {
		const p = {};
		const result = humanUtils.strtoul('0xz00', p);
		assert.equal(result, 0);
		assert.deepEqual(p, {p: 1});
	});

	it('bin value', () => {
		const p = {};
		const result = humanUtils.strtoul('0b1010', p);
		assert.equal(result, 10);
		assert.deepEqual(p, {p: 6});
	});

	it('oct value', () => {
		const p = {};
		const result = humanUtils.strtoul('0477', p);
		assert.equal(result, 0o477);
		assert.deepEqual(p, {p: 4});
	});

	it('dec value', () => {
		const p = {};
		const result = humanUtils.strtoul('2000B', p);
		assert.equal(result, 2000);
		assert.deepEqual(p, {p: 4});
	});
});

describe('xstrtoumax', () => {
	const too_big = '9'.repeat(68);
	const tests = [
		['1', {value: 1, suffix: ''}],
		['-1', {error: humanUtils.LONGINT_INVALID}],
		['1k', {value: 1024, suffix: 'k'}],
		['2000B', {value: 2048000, suffix: 'B'}],
		[
			`${too_big}h`,
			{error: humanUtils.LONGINT_INVALID_SUFFIX_CHAR_WITH_OVERFLOW}
		],
		[too_big, {error: humanUtils.LONGINT_OVERFLOW}],
		['x', {error: humanUtils.LONGINT_INVALID}],
		['9x', {error: humanUtils.LONGINT_INVALID_SUFFIX_CHAR}],
		['010', {value: 8, suffix: ''}],
		['MiB', {value: 1048576, suffix: 'MiB'}],
		['MB', {value: 1000000, suffix: 'MB'}],
		['M', {value: 1048576, suffix: 'M'}],

		// assumed '0x1eb' -> 491 (not '0x1:EB' and '0x1e:B')
		// This is strange, but gnulib behaves that way, so it follows
		['0x1EB', {value: 0x1eb, suffix: ''}],
		// assumed '0x1e:iB' (not '0x1:EiB') -> LONGINT_INVALID_SUFFIX_CHAR
		['0x1EiB', {error: humanUtils.LONGINT_INVALID_SUFFIX_CHAR}]
	];

	for (const test of tests) {
		it(`${test[0]}`, () => {
			const [testPattern, expected] = test;
			const result = humanUtils.xstrtoumax(testPattern, 0, 'BbckMw0');
			assert.deepEqual(result, expected);
		});
	}
});

describe('humanOptions', () => {
	it('should apply default block size', () => {
		assert.ok(!('BLOCK_SIZE' in process.env));
		assert.ok(!('BLOCKSIZE' in process.env));
		assert.ok(!('POSIXLY_CORRECT' in process.env));

		const result = humanUtils.humanOptions();
		assert.equal(result.block_size, 1024);
	});

	it('special spec: --human-readable', () => {
		const result = humanUtils.humanOptions('human-readable');
		assert.deepEqual(result, {
			opts: humanUtils.human_autoscale
				| humanUtils.human_SI
				| humanUtils.human_base_1024,
			block_size: 1
		});
	});

	it('special spec: --si', () => {
		const result = humanUtils.humanOptions('si');
		assert.deepEqual(result, {
			opts: humanUtils.human_autoscale
				| humanUtils.human_SI,
			block_size: 1
		});
	});

	it('2048', () => {
		const result = humanUtils.humanOptions('2048');
		assert.deepEqual(result, {
			opts: 0,
			block_size: 2048
		});
	});

	it('2MB', () => {
		const result = humanUtils.humanOptions('2MB');
		assert.deepEqual(result, {
			opts: humanUtils.human_B,
			block_size: 1000 * 1000 * 2
		});
	});

	it('2M', () => {
		const result = humanUtils.humanOptions('2M');
		assert.deepEqual(result, {
			opts: humanUtils.human_base_1024,
			block_size: 1024 * 1024 * 2
		});
	});

	it('2MiB', () => {
		const result = humanUtils.humanOptions('2MiB');
		assert.deepEqual(result, {
			opts: humanUtils.human_base_1024
				| humanUtils.human_B,
			block_size: 1024 * 1024 * 2
		});
	});
});

describe.only('humanReadable', () => {
	it('mode #1', () => {
		const result = humanUtils.humanReadable(
			12345, /* n */
			0,     /* opts */
			1000,  /* fromBlockSize */
			1      /* toBlockSize */
		);
		assert.equal(result, (12345 * (1000 / 1)).toFixed());
	});

	it('mode #1(b) -> mode #3(non-autoscale)', () => {
		const result = humanUtils.humanReadable(
			12345, /* n */
			0,     /* opts */
			1000,  /* fromBlockSize */
			3      /* toBlockSize */
		);
		assert.equal(result, (12345 * (1000 / 3)).toFixed(0));
	});

	it('mode #1(b) -> mode #3(autoscale)', () => {
		const result = humanUtils.humanReadable(
			12345, /* n */
			humanUtils.human_autoscale,     /* opts */
			1000,  /* fromBlockSize */
			3      /* toBlockSize */
		);
		assert.equal(result, '5.0');
	});

	it('mode #1 (autoscale, SI, B)', () => {
		const result = humanUtils.humanReadable(
			12345,
			humanUtils.human_autoscale
				| humanUtils.human_SI
				| humanUtils.human_B,
			1,
			1
		);
		assert.equal(result, '13kB');
	});

	it('mode #1 (autoscale, SI, base_1024)', () => {
		const result = humanUtils.humanReadable(
			34492,
			humanUtils.human_autoscale
				| humanUtils.human_SI
				| humanUtils.human_base_1024,
			1,
			1
		);
		assert.equal(result, '34K');
	});
});
