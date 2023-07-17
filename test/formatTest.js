import child_process from 'node:child_process';
import assert from 'node:assert/strict';

import {printf} from '../src/format.js';

/*
 * asserts:
 *   equal(actual, expected[, message])
 */

printf.awidth = 1;

function stest (format, args, expected) {
	test(format, args, expected, false);
}

function dtest (format, args, expected) {
	test(format, args, expected, true);
}

function test (format, args, expected, compareNativePrintf) {
	const actual = printf(format, ...args);
	try {
		assert.equal(
			actual,
			expected,
			'js-printf');
	}
	catch (err) {
		console.dir(err);
	}

	if (compareNativePrintf) {
		assert.equal(
			actual,
			child_process.execFileSync('/usr/bin/printf', [format, ...args]).toString(),
			'native-printf');
	}
}

describe('special specifier', () => {
	it('percent', () => {
		test('%%', [], '%');
	});
});

describe('string', () => {
	it('simple', () => {
		test('%s', ['a'], 'a');
	});

	it('positioned argument', () => {
		test('%2$s %1$s', ['a', 'b'], 'b a');
	});

	it('min width', () => {
		test('%10s', ['abc'], '       abc');
		test('%-10s', ['abc'], 'abc       ');
	});

	it('min width - indirect 1', () => {
		test('%*s', [5, 'abc'], '  abc');
		test('%-*s', [5, 'abc'], 'abc  ');
		assert.throws(() => {
			printf('%*s', 'abc', 'def');
		});
	});

	it('min width - indirect 2', () => {
		test('%2$*1$s', [5, 'abc'], '  abc');
		test('%2$-*1$s', [5, 'abc'], 'abc  ');
		assert.throws(() => {
			printf('%2$*1$s', 'abc', 'def');
		});
	});

	it('min-width - multi width characters', () => {
		test('%20s', ['aぴゃっ'], '             aぴゃっ');
		test('%-20s', ['aぴゃっ'], 'aぴゃっ             ');
	});

	it('max width', () => {
		test('%.3s', ['1234567890'], '123');
		test('%.s', ['1234567890'], '1234567890');
	});

	it('max width - indirect 1', () => {
		test('%.*s', [4, '1234567890'], '1234');
		assert.throws(() => {
			printf('%.*s', 'abc', '1234567890');
		});
	});

	it('max width - indirect 2', () => {
		test('%2$.*1$s', [5, '1234567890'], '12345');
	});

	it('max-width - multi width characters', () => {
		test('%.4s', ['aぴゃっ'], 'aぴ');
		test('%4.4s', ['aぴゃっ'], ' aぴ');
		test('%-4.4s', ['aぴゃっ'], 'aぴ ');
		test('%2$-*1$.*1$s', [4, 'aぴゃっ'], 'aぴ ');
	});

	it('min and max-width mixed 1', () => {
		test('%10.15s', ['12345'], '     12345');
		test('%-10.15s', ['12345'], '12345     ');
	});

	it('min and max-width mixed 2', () => {
		test('%10.15s', ['1234567890ABCDEF'], '1234567890ABCDE');
	});

	it('throws mixing positioned index and implicit index', () => {
		assert.throws(() => {
			printf('%.*1$s', 'abc');
		});
	});
});

describe('integer', () => {
	it('simple', () => {
		test('%d', [100], '100');
	});

	it('string', () => {
		assert.throws(() => {
			printf('%d', 'abc');
		});
	});

	it('NaN', () => {
		test('%d', [NaN], '(NaN)');
	});

	it('Infinity', () => {
		test('%d', [1 / 0], '(Infinity)');
		test('%d', [-1 / 0], '(-Infinity)');
	});

	it('positioned argument', () => {
		test('%2$d %1$d', [100, 200], '200 100');
	});

	it('field min width', () => {
		test('%10d', [100], '       100', true);
		test('%-10d', [100], '100       ', true);
	});

	it('field min width - indirect 1', () => {
		test('%*d', [5, 100], '  100', true);
		test('%*d', [-5, 200], '200  ', true);
		test('%-*d', [5, 300], '300  ', true);
	});

	it('field min width - indirect 2', () => {
		test('%2$*1$d', [5, 100], '  100');
		test('%2$*1$d', [-5, 200], '200  ');
		test('%2$-*1$d', [5, 300], '300  ');
	});

	it('field min width with 0 flag', () => {
		test('%010d', [100], '0000000100', true);
		test('%-010d', [200], '200       ', true);
		test('%010.5d', [300], '     00300', true);
		test('%-010.5d', [400], '00400     ', true);
	});

	it('plus flag', () => {
		test('%+d', [100], '+100', true);
		test('%+10d', [200], '      +200', true);
		test('%+-10d', [300], '+300      ', true);

		test('%+d', [-100], '-100', true);
		test('%+10d', [-200], '      -200', true);
		test('%+-10d', [-300], '-300      ', true);
	});

	it('space flag', () => {
		test('% d', [100], ' 100', true);
		test('% 10d', [200], '       200', true);
		test('% -10d', [300], ' 300      ', true);

		test('% d', [-100], '-100', true);
		test('% 10d', [-200], '      -200', true);
		test('% -10d', [-300], '-300      ', true);
	});

	it('precision (omitted)', () => {
		test('%.d', [100], '100', true);
		test('%.d', [0], '', true);
	});

	it('precision - indirect 1', () => {
		test('%.*d', [10, 100], '0000000100', true);
		test('%.*d', [-10, 200], '200', true);
	});

	it('precision - indirect 2', () => {
		test('%2$.*1$d', [10, 100], '0000000100');
		test('%2$.*1$d', [-10, 200], '200');
	});

	it('field min width and precision mixed', () => {
		test('%15.10d', [12345], '     0000012345', true);
		test('%-15.10d', [12345], '0000012345     ', true);
		test('%15.3d', [12345], '          12345', true);
		test('%4.3d', [12345], '12345', true);
	});
});
