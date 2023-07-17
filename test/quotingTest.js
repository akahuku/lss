/*
 * incomplete port of gnulib/tests/test-quotearg-simple.c
 */

import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';

import {quoteUtils} from '../src/quoting.js';

function resultStrings (str1, str2, len2, str3, str4,
						str5, str6, str7, str8a, str8b,
						only = false) {
	this.strings = [
		/*0*/str1,
		/*1*/str2,
		/*2*/str3,
		/*3*/str4,
		/*4*/str5,
		/*5*/str6,
		/*6*/str7,

		/*7*/str8a,
		/*8*/str8b
	];
	this.len2 = len2;
	this.only = only;
}

resultStrings.prototype.compareString = function (func, input, expected, only) {
	const inputStr = quoteUtils.getSafeString(input);
	const expectedStr = quoteUtils.getSafeString(expected);
	const title = `${inputStr} → ${expectedStr}`;
	const tester = only ? it.only : it;

	tester(title, () => {
		quoteUtils.debug('all', only);
		assert.equal(func(input), expected);
	});
}

resultStrings.prototype.compareStrings = function (func, options = {}) {
	for (let i = 0; i < 7; i++) {
		this.compareString(
			func,
			inputs.strings[i],
			this.strings[i],
			this.only === true || this.only === i);
	}

	this.compareString(
		func,
		inputs.strings[7],
		this.strings[options.asciiOnly ? 7 : 8],
		this.only === true || this.only === 7);
};

function resultGroups (group1, group2, group3) {
	this.group1 = group1;
	this.group2 = group2;
	this.group3 = group3;
}

function callQuotearg (style, flags, quotes, fn) {
	const currentStyle = quoteUtils.defaultQuotingOptions.style;
	const currentFlags = quoteUtils.defaultQuotingOptions.flags;
	const currentQuotes = [
		quoteUtils.defaultQuotingOptions.leftQuote,
		quoteUtils.defaultQuotingOptions.rightQuote
	];

	try {
		quoteUtils.defaultQuotingOptions.style = style;
		quoteUtils.defaultQuotingOptions.flags = flags;

		if (quotes != null) {
			quoteUtils.defaultQuotingOptions.leftQuote = quotes[0];
			quoteUtils.defaultQuotingOptions.rightQuote = quotes[1];
		}

		return fn();
	}
	finally {
		quoteUtils.defaultQuotingOptions.style = currentStyle;
		quoteUtils.defaultQuotingOptions.flags = currentFlags;
		quoteUtils.defaultQuotingOptions.leftQuote = currentQuotes[0];
		quoteUtils.defaultQuotingOptions.rightQuote = currentQuotes[1];
	}
}

function use_quotearg_buffer (style, flags = 0, quotes = null) {
	return str => {
		return callQuotearg(style, flags, quotes, () => {
			return quoteUtils.quotearg_buffer(str);
		});
	};
}

function use_quotearg (style, flags = 0, quotes = null) {
	return str => {
		return callQuotearg(style, flags, quotes, () => {
			return quoteUtils.quotearg(str);
		});
	};
}

function use_quote_double_quotes (style, flags = 0, quotes = null) {
	return str => {
		return callQuotearg(style, flags, quotes, () => {
			return quoteUtils.quotearg_char('"', str);
		});
	};
}

function use_quotearg_colon (style, flags = 0, quotes = null) {
	return str => {
		return callQuotearg(style, flags, quotes, () => {
			return quoteUtils.quotearg_colon(str);
		});
	};
}

const LQ = '«'; // U+00AB, UTF-8: 0xc2(0302), 0xab(0253)
const RQ = '»'; // U+00BB, UTF-8: 0xc2(0302), 0xbb(0273)
const LQ_ENC = '\\302\\253';
const RQ_ENC = '\\302\\273';
const RQ_ESC = '\\' + RQ;

const inputs = new resultStrings(
	'',
	'\x001\x00', 3,
	'simple',
	' \t\n\'\"\x1b??/\\',
	'a:b',
	'a\\b',
	'a\' b',
	LQ + RQ,
	null
);

const results_g = {
	'literal': new resultGroups(
		// for quotearg_buffer()
		new resultStrings(
			"", "\x001\x00", 3, "simple", " \t\n'\"\x1b??/\\", "a:b", "a\\b",
			"a' b", LQ + RQ, LQ + RQ),
		// for quotearg() / quotearg_mem()
		new resultStrings(
			"", "1", 1, "simple", " \t\n'\"\x1b??/\\", "a:b", "a\\b",
			"a' b", LQ + RQ, LQ + RQ),
		// for quotearg_colon()
		new resultStrings(
			"", "1", 1, "simple", " \t\n'\"\x1b??/\\", "a:b", "a\\b",
			"a' b", LQ + RQ, LQ + RQ)
	),

	'shell': new resultGroups(
		new resultStrings(
			"''", "\x001\x00", 3, "simple", "' \t\n'\\''\"\x1b??/\\'", "a:b",
			"'a\\b'", "\"a' b\"", LQ + RQ, LQ + RQ),
		new resultStrings(
			"''", "1", 1, "simple", "' \t\n'\\''\"\x1b??/\\'", "a:b",
			"'a\\b'", "\"a' b\"", LQ + RQ, LQ + RQ),
		new resultStrings(
			"''", "1", 1, "simple", "' \t\n'\\''\"\x1b??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", LQ + RQ, LQ + RQ)
	),

	'shell_always': new resultGroups(
		new resultStrings(
			"''", "'\x001\x00'", 5, "'simple'", "' \t\n'\\''\"\x1b??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `'${LQ}${RQ}'`, `'${LQ}${RQ}'`),
	    new resultStrings("''", "'1'", 3, "'simple'", "' \t\n'\\''\"\x1b??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `'${LQ}${RQ}'`, `'${LQ}${RQ}'`),
		new resultStrings( "''", "'1'", 3, "'simple'", "' \t\n'\\''\"\x1b??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `'${LQ}${RQ}'`, `'${LQ}${RQ}'`)
	),

	'shell_escape': new resultGroups(
		new resultStrings(
			"''",
			// 012345678901234
			// ''$'\0''1'$'\0'
			"''$'\\0''1'$'\\0'", 15,
			"simple",
			// ' '$'\t\n'\''"'$'\033''??/\'
			"' '$'\\t\\n'\\''\"'$'\\033''??/\\'",
			"a:b",
			"'a\\b'",
			"\"a' b\"",
			`''$'${LQ_ENC}${RQ_ENC}'`,
			LQ + RQ),
		new resultStrings(
			"''", "''$'\\0''1'$'\\0'", 15, "simple",
			"' '$'\\t\\n'\\''\"'$'\\033''??/\\'", "a:b",
			"'a\\b'", "\"a' b\"", `''$'${LQ_ENC}${RQ_ENC}'`, LQ + RQ),
		new resultStrings(
			"''", "''$'\\0''1'$'\\0'", 15, "simple",
			"' '$'\\t\\n'\\''\"'$'\\033''??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `''$'${LQ_ENC}${RQ_ENC}'`, LQ + RQ)
	),

	'shell_escape_always': new resultGroups(
		new resultStrings(
			"''", "''$'\\0''1'$'\\0'", 15, "'simple'",
			"' '$'\\t\\n'\\''\"'$'\\033''??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `''$'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`),
		new resultStrings(
			"''", "''$'\\0''1'$'\\0'", 15, "'simple'",
			"' '$'\\t\\n'\\''\"'$'\\033''??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `''$'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`),
		new resultStrings(
			"''", "''$'\\0''1'$'\\0'", 15, "'simple'",
			"' '$'\\t\\n'\\''\"'$'\\033''??/\\'", "'a:b'",
			"'a\\b'", "\"a' b\"", `''$'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`)
	),

	'c': new resultGroups(
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033??/\\\\\"", "\"a:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`),
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033??/\\\\\"", "\"a:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`),
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033??/\\\\\"", "\"a\\:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`)
	),

	'c_maybe': new resultGroups(
		new resultStrings(
			"", "\"\\0001\\0\"", 9, "simple", "\" \\t\\n'\\\"\\033??/\\\\\"",
			"a:b", "a\\b", "a' b", `"${LQ_ENC}${RQ_ENC}"`, LQ + RQ),
		new resultStrings(
			"", "\"\\0001\\0\"", 9, "simple", "\" \\t\\n'\\\"\\033??/\\\\\"",
			"a:b", "a\\b", "a' b", `"${LQ_ENC}${RQ_ENC}"`, LQ + RQ),
		new resultStrings(
			"", "\"\\0001\\0\"", 9, "simple", "\" \\t\\n'\\\"\\033??/\\\\\"",
			"\"a:b\"", "a\\b", "a' b", `"${LQ_ENC}${RQ_ENC}"`, LQ + RQ)
	),

	'escape': new resultGroups(
		new resultStrings(
			"", "\\0001\\0", 7, "simple", " \\t\\n'\"\\033??/\\\\", "a:b",
			"a\\\\b", "a' b", LQ_ENC + RQ_ENC, LQ + RQ),
		new resultStrings(
			"", "\\0001\\0", 7, "simple", " \\t\\n'\"\\033??/\\\\", "a:b",
			"a\\\\b", "a' b", LQ_ENC + RQ_ENC, LQ + RQ),
		new resultStrings(
			"", "\\0001\\0", 7, "simple", " \\t\\n'\"\\033??/\\\\", "a\\:b",
			"a\\\\b", "a' b", LQ_ENC + RQ_ENC, LQ + RQ)
	),

	'locale': new resultGroups(
		new resultStrings(
			"''", "'\\0001\\0'", 9, "'simple'", "' \\t\\n\\'\"\\033??/\\\\'",
			"'a:b'", "'a\\\\b'", "'a\\' b'", `'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`),
		new resultStrings(
			"''", "'\\0001\\0'", 9, "'simple'", "' \\t\\n\\'\"\\033??/\\\\'",
			"'a:b'", "'a\\\\b'", "'a\\' b'", `'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`),
		new resultStrings(
			"''", "'\\0001\\0'", 9, "'simple'", "' \\t\\n\\'\"\\033??/\\\\'",
			"'a\\:b'", "'a\\\\b'", "'a\\' b'",
			`'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`)
	),

	'clocale': new resultGroups(
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033??/\\\\\"", "\"a:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`),
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033??/\\\\\"", "\"a:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`),
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033??/\\\\\"", "\"a\\:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`)
	)
};

const flag_results = {
	'literal': new resultGroups(
		new resultStrings(
			"", "1", 1, "simple", " \t\n'\"\x1b??/\\", "a:b", "a\\b", "a' b",
			LQ + RQ, LQ + RQ
		),
		new resultStrings(
			"", "1", 1, "simple", " \t\n'\"\x1b??/\\", "a:b", "a\\b", "a' b",
			LQ + RQ, LQ + RQ
		),
		new resultStrings(
			"", "1", 1, "simple", " \t\n'\"\x1b??/\\", "a:b", "a\\b", "a' b",
			LQ + RQ, LQ + RQ
		)
	),
	'c1': new resultGroups(
		new resultStrings(
			"", "\"\\0001\\0\"", 9, "simple", "\" \\t\\n'\\\"\\033??/\\\\\"",
			"a:b", "a\\b", "a' b", `"${LQ_ENC}${RQ_ENC}"`, LQ + RQ
		),
		new resultStrings(
			"", "\"\\0001\\0\"", 9, "simple", "\" \\t\\n'\\\"\\033??/\\\\\"",
			"a:b", "a\\b", "a' b", `"${LQ_ENC}${RQ_ENC}"`, LQ + RQ
		),
		new resultStrings(
			"", "\"\\0001\\0\"", 9, "simple", "\" \\t\\n'\\\"\\033??/\\\\\"",
			"\"a:b\"", "a\\b", "a' b", `"${LQ_ENC}${RQ_ENC}"`, LQ + RQ
		)
	),
	'c2': new resultGroups(
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033?\"\"?/\\\\\"", "\"a:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`
		),
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033?\"\"?/\\\\\"", "\"a:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`
		),
		new resultStrings(
			"\"\"", "\"\\0001\\0\"", 9, "\"simple\"",
			"\" \\t\\n'\\\"\\033?\"\"?/\\\\\"", "\"a\\:b\"", "\"a\\\\b\"",
			"\"a' b\"", `"${LQ_ENC}${RQ_ENC}"`, `"${LQ}${RQ}"`
		)
	)
};

const custom_results = {
	';': new resultGroups(
		new resultStrings(
			"", "\\0001\\0", 7, "simple",
			" \\t\\n'\"\\033??/\\\\", "a:b", "a\\\\b",
			"a' b", LQ_ENC + RQ_ENC, LQ + RQ
		),
		new resultStrings(
			"", "\\0001\\0", 7, "simple",
			" \\t\\n'\"\\033??/\\\\", "a:b", "a\\\\b",
			"a' b", LQ_ENC + RQ_ENC, LQ + RQ
		),
		new resultStrings(
			"", "\\0001\\0", 7, "simple",
			" \\t\\n'\"\\033??/\\\\", "a\\:b", "a\\\\b",
			"a' b", LQ_ENC + RQ_ENC, LQ + RQ
		)
	),
	"';'": new resultGroups(
		new resultStrings(
			"''", "'\\0001\\0'", 9, "'simple'",
			"' \\t\\n\\'\"\\033??/\\\\'", "'a:b'", "'a\\\\b'",
			"'a\\' b'", `'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`
		),
		new resultStrings(
			"''", "'\\0001\\0'", 9, "'simple'",
			"' \\t\\n\\'\"\\033??/\\\\'", "'a:b'", "'a\\\\b'",
			"'a\\' b'", `'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`
		),
		new resultStrings(
			"''", "'\\0001\\0'", 9, "'simple'",
			"' \\t\\n\\'\"\\033??/\\\\'", "'a\\:b'", "'a\\\\b'",
			"'a\\' b'", `'${LQ_ENC}${RQ_ENC}'`, `'${LQ}${RQ}'`
		)
	),
	'(;)': new resultGroups(
		new resultStrings(
			"()", "(\\0001\\0)", 9, "(simple)",
			"( \\t\\n'\"\\033??/\\\\)", "(a:b)", "(a\\\\b)",
			"(a' b)", `(${LQ_ENC}${RQ_ENC})`, `(${LQ}${RQ})`
		),
		new resultStrings(
			"()", "(\\0001\\0)", 9, "(simple)",
			"( \\t\\n'\"\\033??/\\\\)", "(a:b)", "(a\\\\b)",
			"(a' b)", `(${LQ_ENC}${RQ_ENC})`, `(${LQ}${RQ})`
		),
		new resultStrings(
			"()", "(\\0001\\0)", 9, "(simple)",
			"( \\t\\n'\"\\033??/\\\\)", "(a\\:b)", "(a\\\\b)",
			"(a' b)", `(${LQ_ENC}${RQ_ENC})`, `(${LQ}${RQ})`
		)
	),
	':; ': new resultGroups(
		new resultStrings(
			": ", ":\\0001\\0 ", 9, ":simple ",
			":\\ \\t\\n'\"\\033??/\\\\ ", ":a:b ", ":a\\\\b ",
			":a'\\ b ", `:${LQ_ENC}${RQ_ENC} `, `:${LQ}${RQ} `
		),
		new resultStrings(
			": ", ":\\0001\\0 ", 9, ":simple ",
			":\\ \\t\\n'\"\\033??/\\\\ ", ":a:b ", ":a\\\\b ",
			":a'\\ b ", `:${LQ_ENC}${RQ_ENC} `, `:${LQ}${RQ} `
		),
		new resultStrings(
			": ", ":\\0001\\0 ", 9, ":simple ",
			":\\ \\t\\n'\"\\033??/\\\\ ", ":a\\:b ", ":a\\\\b ",
			":a'\\ b ", `:${LQ_ENC}${RQ_ENC} `, `:${LQ}${RQ} `
		)
	),
	' ;:': new resultGroups(
		new resultStrings(
			" :", " \\0001\\0:", 9, " simple:",
			"  \\t\\n'\"\\033??/\\\\:", " a\\:b:", " a\\\\b:",
			" a' b:", ` ${LQ_ENC}${RQ_ENC}:`, ` ${LQ}${RQ}:`
		),
		new resultStrings(
			" :", " \\0001\\0:", 9, " simple:",
			"  \\t\\n'\"\\033??/\\\\:", " a\\:b:", " a\\\\b:",
			" a' b:", ` ${LQ_ENC}${RQ_ENC}:`, ` ${LQ}${RQ}:`
		),
		new resultStrings(
			" :", " \\0001\\0:", 9, " simple:",
			"  \\t\\n'\"\\033??/\\\\:", " a\\:b:", " a\\\\b:",
			" a' b:", ` ${LQ_ENC}${RQ_ENC}:`, ` ${LQ}${RQ}:`
		)
	),
	'# ;\n': new resultGroups(
		new resultStrings(
			"# \n", "# \\0001\\0\n", 10, "# simple\n",
			"#  \\t\\n'\"\\033??/\\\\\n", "# a:b\n", "# a\\\\b\n",
			"# a' b\n", `# ${LQ_ENC}${RQ_ENC}\n`, `# ${LQ}${RQ}\n`
		),
		new resultStrings(
			"# \n", "# \\0001\\0\n", 10, "# simple\n",
			"#  \\t\\n'\"\\033??/\\\\\n", "# a:b\n", "# a\\\\b\n",
			"# a' b\n", `# ${LQ_ENC}${RQ_ENC}\n`, `# ${LQ}${RQ}\n`
		),
		new resultStrings(
			"# \n", "# \\0001\\0\n", 10, "# simple\n",
			"#  \\t\\n'\"\\033??/\\\\\n", "# a\\:b\n", "# a\\\\b\n",
			"# a' b\n", `# ${LQ_ENC}${RQ_ENC}\n`, `# ${LQ}${RQ}\n`
		)
	),
	'"\';\'"': new resultGroups(
		new resultStrings(
			"\"''\"", "\"'\\0001\\0'\"", 11, "\"'simple'\"",
			"\"' \\t\\n\\'\"\\033??/\\\\'\"", "\"'a:b'\"", "\"'a\\\\b'\"",
			"\"'a' b'\"", `"'${LQ_ENC}${RQ_ENC}'"`, `"'${LQ}${RQ}'"`
		),
		new resultStrings(
			"\"''\"", "\"'\\0001\\0'\"", 11, "\"'simple'\"",
			"\"' \\t\\n\\'\"\\033??/\\\\'\"", "\"'a:b'\"", "\"'a\\\\b'\"",
			"\"'a' b'\"", `"'${LQ_ENC}${RQ_ENC}'"`, `"'${LQ}${RQ}'"`
		),
		new resultStrings(
			"\"''\"", "\"'\\0001\\0'\"", 11, "\"'simple'\"",
			"\"' \\t\\n\\'\"\\033??/\\\\'\"", "\"'a\\:b'\"", "\"'a\\\\b'\"",
			"\"'a' b'\"", `"'${LQ_ENC}${RQ_ENC}'"`, `"'${LQ}${RQ}'"`
		)
	)
};

describe('utf8ToWideChar', () => {
	// (f0, 9f, a5, 9e), 79, 61, 6d, 21
	const buffer = Buffer.from('🥞yam!');
	const utf8ToWideChar = quoteUtils.utf8ToWideChar;

	it('should get emoji from valid position', () => {
		const result = utf8ToWideChar(buffer, 0);
		assert.deepEqual(result, {
			currentBytes: 4,
			currentString: '🥞'
		});
	});

	it('should get emoji from invalid position', () => {
		const result = utf8ToWideChar(buffer, 1);
		assert.deepEqual(result, {
			currentBytes: 3
		});
	});

	it('should return null if target is empty string', () => {
		const result = utf8ToWideChar(buffer, buffer.length);
		assert.equal(result, null);
	});

	it('should return only curentBytes if target is middle invalid sequence', () => {
		const result = utf8ToWideChar(Buffer.from([0xf0, 0x9f, 0xa5, /*0x9e,*/ 0x79, 0x61, 0x6d, 0x21]), 0);
		assert.deepEqual(result, {
			currentBytes: 3
		});
	});

	it('should return null if target is last invalid sequence', () => {
		const result = utf8ToWideChar(Buffer.from([0xf0, 0x9f, 0xa5]), 0);
		assert.equal(result, null);
	});
});

describe('iswprint', () => {
	const iswprint = quoteUtils.iswprint;

	it('should return true for printable character', () => {
		assert.equal(iswprint('a'), true);
	});

	it('should return false for unprintable character', () => {
		assert.equal(iswprint('\v'), false);
	});
});

describe('simple quote test', () => {
	for (const i in results_g) {
		const r = results_g[i];

		describe(`quote style: ${i}, group 1`, () => {
			r.group1.compareStrings(
				use_quotearg_buffer(i));
		});

		describe(`quote style: ${i}, group 2`, () => {
			r.group2.compareStrings(
				use_quotearg(i));
		});

		i == 'c' && describe(`quote style: ${i}, group 2.5`, () => {
			r.group2.compareStrings(
				use_quote_double_quotes(i));
		});

		describe(`quote style: ${i}, group 3`, () => {
			r.group3.compareStrings(
				use_quotearg_colon(i));
		});
	}
});

describe('flag test for literal style', () => {
	const flags = quoteUtils.flags.QA_ELIDE_NULL_BYTES;

	flag_results['literal'].group1.compareStrings(
		use_quotearg_buffer('literal', flags));
	flag_results['literal'].group2.compareStrings(
		use_quotearg('literal', flags));
	flag_results['literal'].group3.compareStrings(
		use_quotearg_colon('literal', flags));
});

describe('flag test for c style #1', () => {
	const flags = quoteUtils.flags.QA_ELIDE_OUTER_QUOTES;

	flag_results['c1'].group1.compareStrings(
		use_quotearg_buffer('c', flags));
	flag_results['c1'].group2.compareStrings(
		use_quotearg('c', flags));
	flag_results['c1'].group2.compareStrings(
		use_quote_double_quotes('c', flags));
	flag_results['c1'].group3.compareStrings(
		use_quotearg_colon('c', flags));
});

describe('flag test for c style #2', () => {
	const flags = quoteUtils.flags.QA_SPLIT_TRIGRAPHS;

	flag_results['c2'].group1.compareStrings(
		use_quotearg_buffer('c', flags));
	flag_results['c2'].group2.compareStrings(
		use_quotearg('c', flags));
	flag_results['c2'].group2.compareStrings(
		use_quote_double_quotes('c', flags));
	flag_results['c2'].group3.compareStrings(
		use_quotearg_colon('c', flags));
});

describe('custom quote test', () => {
	const style = 'custom';

	for (const i in custom_results) {
		const r = custom_results[i];
		const quotes = i.split(';');

		describe(`custom quotes: ${i}, group 1`, () => {
			r.group1.compareStrings(
				use_quotearg_buffer(style, 0, quotes));
		});

		describe(`custom quotes: ${i}, group 2`, () => {
			r.group2.compareStrings(
				use_quotearg(style, 0, quotes));
		});

		describe(`custom quotes: ${i}, group 3`, () => {
			r.group3.compareStrings(
				use_quotearg_colon(style, 0, quotes));
		});
	}
});

describe('non-alphabetical string test', () => {
	// invalid UTF-8, but valid Shift_JIS sequence
	const sjisSequence = Buffer.from([
		0x83, 0x56, // シ
		0x83, 0x74, // フ
		0x83, 0x67, // ト
		0x83, 0x57, // ジ
		0x83, 0x58  // ス
	]);

	it('valid UTF-8 sequence', () => {
		const result = quoteUtils.quotearg_buffer('あくらつなライフハック');
		assert.equal(result, 'あくらつなライフハック');
	});

	it('invalid UTF-8 sequence (literal)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({
			style: 'literal',
			replacement: '?'
		});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, "?V?t?g?W?X");
	});

	it('invalid UTF-8 sequence (literal-asis)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({
			style: 'literal',
			replacement: null
		});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, "\x83V\x83t\x83g\x83W\x83X");
	});

	it('invalid UTF-8 sequence (shell)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({
			style: 'shell',
			replacement: '?'
		});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, "?V?t?g?W?X");
	});

	it('invalid UTF-8 sequence (shell_always)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({
			style: 'shell_always',
			replacement: '?'
		});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, "'?V?t?g?W?X'");
	});

	it('invalid UTF-8 sequence (shell_escape)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'shell_escape'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, "''$'\\203''V'$'\\203''t'$'\\203''g'$'\\203''W'$'\\203''X'");
	});

	it('invalid UTF-8 sequence (shell_escape_always)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'shell_escape_always'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, "''$'\\203''V'$'\\203''t'$'\\203''g'$'\\203''W'$'\\203''X'");
	});

	it('invalid UTF-8 sequence (c)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'c'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, '"\\203V\\203t\\203g\\203W\\203X"');
	});

	it('invalid UTF-8 sequence (c_maybe)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'c_maybe'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, '"\\203V\\203t\\203g\\203W\\203X"');
	});

	it('invalid UTF-8 sequence (escape)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'escape'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, '\\203V\\203t\\203g\\203W\\203X');
	});

	it('invalid UTF-8 sequence (locale)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'locale'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, '‘\\203V\\203t\\203g\\203W\\203X’');
	});

	it('invalid UTF-8 sequence (clocale)', () => {
		const options = quoteUtils.defaultQuotingOptions.clone({style: 'clocale'});
		const result = quoteUtils.quotearg_buffer(sjisSequence, options);
		assert.equal(result, '‘\\203V\\203t\\203g\\203W\\203X’');
	});
});
