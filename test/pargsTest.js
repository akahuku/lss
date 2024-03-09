import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';

import {splitFromString, splitFromBuffer, pargs} from '../src/pargs.js';

describe('splitFromBuffer', () => {
	it('initializing', () => {
		const result = splitFromBuffer(Buffer.from(
			`'--color' '--classify=always' '--quote=bar baz \\'bax' '--' 'foo' 'foo bar \\'baz'`
		));
		const expected = [
			'--color',
			'--classify=always',
			"--quote=bar baz 'bax",
			'--',
			'foo',
			"foo bar 'baz"
		];

		assert.equal(result.length, expected.length);

		for (let i = 0; i < expected.length; i++) {
			assert.equal(
				result[i].toString(),
				expected[i],
				`#${i}: ${result[i].toString()}`);
		}
	});
});

describe('splitFromString', () => {
	it('initializing', () => {
		const result = splitFromString(
			'--color --classify="always" \'--quote=bar baz\' -- foo "foo bar"'
		);
		const expected = [
			'--color',
			'--classify=always',
			'--quote=bar baz',
			'--',
			'foo',
			'foo bar'
		];

		assert.equal(result.length, expected.length);

		for (let i = 0; i < expected.length; i++) {
			assert.equal(
				result[i].toString(),
				expected[i],
				`#${i}: ${result[i].toString()}`);
		}
	});
});

describe('unknown switches', () => {
	it('error returned', () => {
		let eventEmitted = false;
		const result = pargs('-a -b -c', [], {
			onUnknownSwitch: name => {
				eventEmitted = true;
			}
		});
		assert.ok(eventEmitted);
		assert.ok(result.error instanceof pargs.ParseArgError);
		assert.equal(result.error.parseArgErrorCode, 0);
		assert.equal(result.error.switchString, '-a');
	});
});

describe('boolean switches', () => {
	it('long', () => {
		const result = pargs('--help', [
			'help'
		]);
		assert.deepEqual(result, {
			switches: {
				help: {
					name: '--help',
					value: true
				}
			},
			operands: [
			]
		});
	});

	it('inverted long', () => {
		const result = pargs('--no-help', [
			'help'
		]);
		assert.deepEqual(result, {
			switches: {
				help: {
					name: '--no-help',
					value: false
				}
			},
			operands: [
			]
		});
	});

	it('short', () => {
		const result = pargs('-h', [
			'h'
		]);
		assert.deepEqual(result, {
			switches: {
				h: {
					name: '-h',
					value: true
				}
			},
			operands: [
			]
		});
	});

	it('long/short mix, long', () => {
		const result = pargs('--help', [
			'h:help'
		]);
		assert.deepEqual(result, {
			switches: {
				help: {
					name: '--help',
					value: true
				}
			},
			operands: [
			]
		});
	});

	it('long/short mix, short', () => {
		const result = pargs('-h', [
			'h:help'
		]);
		assert.deepEqual(result, {
			switches: {
				help: {
					name: '-h',
					value: true
				}
			},
			operands: [
			]
		});
	});

	it('extra option (error #1)', () => {
		const result = pargs('-h=foo', [
			'h:help'
		]);
		assert.ok(result.error instanceof pargs.ParseArgError);
		assert.equal(result.error.parseArgErrorCode, 2);
	});
});

describe('switches with mandatory paremter', () => {
	it('separated parameter', () => {
		const result = pargs('--sort time', [
			'sort=#'
		]);
		assert.deepEqual(result, {
			switches: {
				sort: {
					name: '--sort',
					string: 'time',
					buffer: Buffer.from('time')
				}
			},
			operands: [
			]
		});
	});

	it('separated parameter (error #1)', () => {
		const result = pargs('--sort', [
			'sort=#'
		]);
		assert.ok(result.error instanceof pargs.ParseArgError);
		assert.equal(result.error.parseArgErrorCode, 1);
	});

	it('separated parameter (error #2)', () => {
		const result = pargs('--sort --help', [
			'sort=#',
			'help'
		]);
		assert.ok(result.error instanceof pargs.ParseArgError);
		assert.equal(result.error.parseArgErrorCode, 1);
	});

	it('joined parameter', () => {
		const result = pargs('--sort=time', [
			'sort=#'
		]);
		assert.deepEqual(result, {
			switches: {
				sort: {
					name: '--sort',
					string: 'time',
					buffer: Buffer.from('time')
				}
			},
			operands: [
			]
		});
	});
});

describe('switches with optional paremter', () => {
	it('separated parameter', () => {
		const result = pargs('--sort time', [
			'sort=?'
		]);
		assert.deepEqual(result, {
			switches: {
				sort: {
					name: '--sort',
					string: 'time',
					buffer: Buffer.from('time')
				}
			},
			operands: [
			]
		});
	});

	it('separated and rejected parameter', () => {
		const result = pargs('--sort time', [
			'sort=?'
		], {
			onQueryAmbiguousParam: (sw, param, paramBuffer) => {
				if (sw.long == 'sort') {
					return false;
				}
			}
		});
		assert.deepEqual(result, {
			switches: {
				sort: {
					name: '--sort',
					string: '',
					buffer: Buffer.from('')
				}
			},
			operands: [
				{
					string: 'time',
					buffer: Buffer.from('time')
				}
			]
		});
	});

	it('omitted parameter (last)', () => {
		const result = pargs('--sort', [
			'sort=?'
		]);
		assert.deepEqual(result, {
			switches: {
				sort: {
					name: '--sort',
					string: '',
					buffer: Buffer.from('')
				}
			},
			operands: [
			]
		});
	});

	it('omitted parameter (before other switches)', () => {
		const result = pargs('--sort --help', [
			'sort=?',
			'help'
		]);
		assert.deepEqual(result, {
			switches: {
				sort: {
					name: '--sort',
					string: '',
					buffer: Buffer.from('')
				},
				help: {
					name: '--help',
					value: true
				}
			},
			operands: [
			]
		});
	});
});

describe('packed switches', () => {
	it('boolean only', () => {
		const result = pargs('-abc', [
			'a', 'b', 'c'
		]);
		assert.deepEqual(result, {
			switches: {
				a: {name: '-abc', value: true},
				b: {name: '-abc', value: true},
				c: {name: '-abc', value: true}
			},
			operands: [
			]
		});
	});

	it('mixed (error #1)', () => {
		const result = pargs('-abc', [
			'a', 'b=#', 'c'
		]);
		assert.ok(result.error instanceof pargs.ParseArgError);
		assert.equal(result.error.parseArgErrorCode, 3);
	});

	it('mixed (error #2)', () => {
		const result = pargs('-abc operand', [
			'a', 'b=#', 'c'
		]);
		assert.ok(result.error instanceof pargs.ParseArgError);
		assert.equal(result.error.parseArgErrorCode, 3);
	});

	it('mixed (last)', () => {
		const result = pargs('-abc param', [
			'a', 'b', 'c=#'
		]);
		assert.deepEqual(result, {
			switches: {
				a: {name: '-abc', value: true},
				b: {name: '-abc', value: true},
				c: {
					name: '-abc',
					string: 'param',
					buffer: Buffer.from('param')
				}
			},
			operands: [
			]
		});
	});
});

describe('repeated switches', () => {
	it('#1', () => {
		const result = pargs('--verbose --ignore=abc --verbose --ignore dec', [
			'verbose',
			'ignore[]=#'
		]);
		assert.deepEqual(result, {
			switches: {
				verbose: {
					name: '--verbose',
					value: true
				},
				ignore: [
					{
						name: '--ignore',
						string: 'abc',
						buffer: Buffer.from('abc')
					},
					{
						name: '--ignore',
						string: 'dec',
						buffer: Buffer.from('dec')
					}
				]
			},
			operands: [
			]
		});
	});

	it('#2', () => {
		const result = pargs('--verbose --ignore=abc --no-verbose --ignore dec', [
			'verbose',
			'ignore[]=#'
		]);
		assert.deepEqual(result, {
			switches: {
				verbose: {
					name: '--no-verbose',
					value: false
				},
				ignore: [
					{
						name: '--ignore',
						string: 'abc',
						buffer: Buffer.from('abc')
					},
					{
						name: '--ignore',
						string: 'dec',
						buffer: Buffer.from('dec')
					}
				]
			},
			operands: [
			]
		});
	});
});

describe('buffer handling', () => {
	// 'シフトジス' in Shift_JIS encoding.
	// If we force decode it as UTF-8, we get the following.
	//   U+FFFD
	//   U+0056 (V)
	//   U+FFFD
	//   U+0074 (t)
	//   U+FFFD
	//   U+0067 (g)
	//   U+FFFD
	//   U+0057 (W)
	//   U+FFFD
	//   U+0058 (X)
	const shift_jis = Buffer.from([
		0x83, 0x56,
		0x83, 0x74,
		0x83, 0x67,
		0x83, 0x57,
		0x83, 0x58
	]);
	const buffer = Buffer.concat([
		Buffer.from(`'-a' '-b' '`),
		Buffer.from(shift_jis),
		Buffer.from(`'`)
	]);

	it('#1', () => {
		const result = pargs(buffer, [
			'a', 'b'
		]);
		assert.deepEqual(result, {
			switches: {
				a: {name: '-a', value: true},
				b: {name: '-b', value: true}
			},
			operands: [
				{
					string: '�V�t�g�W�X',
					buffer: shift_jis
				}
			]
		});
	});
});
