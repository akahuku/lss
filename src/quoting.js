/**
 * quoting.js -- partial port of gnulib/lib/quotearg.c
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';
import {Buffer} from 'node:buffer';

/*
 * range of valid UTF-8
 *
 * [00-7e]                    # 1byte sequence
 *   0000_0000
 *   0111_1110
 * [c2-df][80-bf]             # 2bytes sequence #1
 *   1100_0010 1000_0000
 *   1101_1111 1011_1111
 * e0[a0-bf][80-bf]           # 3bytes sequence #1
 *   1110_0000 1010_0000 1000_0000
 *   1110_0000 1011_1111 1011_1111
 * [e1-eceeef][80-bf]{2}      # 3bytes sequence #2
 *   1110_0001 1000_0000 1000_0000
 * x 1110_1101
 *   1110_1111 1011_1111 1011_1111
 * ed[80-9f][80-bf]           # 3bytes sequence #3
 *   1110_1101 1000_0000 1000_0000
 *   1110_1101 1001_1111 1011_1111
 * f0[90-bf][80-bf]{2}        # 4bytes sequence #1
 *   1111_0000 1001_0000 1000_0000
 *   1111_0000 1011_1111 1011_1111
 * [f1-f3][80-bf]{3}          # 4bytes sequence #2
 *   1111_0001 1000_0000 1000_0000 1000_0000
 *   1111_0011 1011_1111 1011_1111 1011_1111
 * f4[80-8f][80-bf]{2}        # 4bytes sequence #3
 *   1111_0100 1000_0000 1000_0000 1000_0000
 *   1111_0100 1000_1111 1011_1111 1011_1111
 */

function utf8ToWideChar (buffer, startIndex) {
	const goal = buffer.length;
	let index = startIndex;
	let next;

	while (index < goal) {
		next = null;

		do {
			const b = buffer[index];

			// 1 byte
			if (0x00 <= b && b <= 0x7e) {
				next = index + 1;
				break;
			}

			// 2 bytes
			else if (0xc2 <= b && b <= 0xdf) {
				if (index + 1 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0x80 <= b1 && b1 <= 0xbf)) break;

				next = index + 2;
				break;
			}

			// 3 bytes
			else if (b == 0xe0) {
				if (index + 2 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0xa0 <= b1 && b1 <= 0xbf)) break;

				const b2 = buffer[index + 2];
				if (!(0x80 <= b2 && b2 <= 0xbf)) break;

				next = index + 3;
				break;
			}
			else if (0xe1 <= b && b <= 0xef) {
				if (b == 0xed) break;
				if (index + 2 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0x80 <= b1 && b1 <= 0xbf)) break;

				const b2 = buffer[index + 2];
				if (!(0x80 <= b2 && b2 <= 0xbf)) break;

				next = index + 3;
				break;
			}
			else if (b == 0xed) {
				if (index + 2 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0x80 <= b1 && b1 <= 0x9f)) break;

				const b2 = buffer[index + 2];
				if (!(0x80 <= b2 && b2 <= 0xbf)) break;

				next = index + 3;
				break;
			}

			// 4 bytes
			else if (b == 0xf0) {
				if (index + 3 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0x90 <= b1 && b1 <= 0xbf)) break;

				const b2 = buffer[index + 2];
				if (!(0x80 <= b2 && b2 <= 0xbf)) break;

				const b3 = buffer[index + 3];
				if (!(0x80 <= b3 && b3 <= 0xbf)) break;

				next = index + 4;
				break;
			}
			else if (0xf1 <= b && b <= 0xf3) {
				if (index + 3 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0x80 <= b1 && b1 <= 0xbf)) break;

				const b2 = buffer[index + 2];
				if (!(0x80 <= b2 && b2 <= 0xbf)) break;

				const b3 = buffer[index + 3];
				if (!(0x80 <= b3 && b3 <= 0xbf)) break;

				next = index + 4;
				break;
			}
			else if (b == 0xf4) {
				if (index + 3 >= goal) break;

				const b1 = buffer[index + 1];
				if (!(0x80 <= b1 && b1 <= 0x8f)) break;

				const b2 = buffer[index + 2];
				if (!(0x80 <= b2 && b2 <= 0xbf)) break;

				const b3 = buffer[index + 3];
				if (!(0x80 <= b3 && b3 <= 0xbf)) break;

				next = index + 4;
				break;
			}

			// incomplete sequence
			else {
				break;
			}
		} while (false);

		if (next !== null) {
			if (index == startIndex) {
				return {
					currentBytes: next - startIndex,
					currentString: buffer.toString('utf8', startIndex, next)
				}
			}
			else {
				return {
					currentBytes: index - startIndex
				}
			}
		}
		else {
			index++;
		}
	}

	return null;
}

const iswprint = (() => {
	const cache = new Map;
	return function iswprint (ch) {
		if (cache.has(ch)) {
			return cache.get(ch);
		}

		/*
		 * according to the profiler, this is a fairly heavy regular
		 * expression. so it is worth incorporating a cache mechanism.
		 */
		const result = /^[^\p{Cc}\p{Cs}\p{Zl}\p{Zp}]$/u.test(ch);
		cache.set(ch, result);
		return result;
	}
})();

function getSafeString (s) {
	return '<<<' + s.replace(
		/[\u0000-\u001f]/g,
		$0 => {
			return '\x1b[4m^' +
				String.fromCodePoint(64 + $0.codePointAt(0)) +
				'\x1b[24m';
		}) +
		'>>>(' + s.length + ')';
}

// <<< quoteUtils
export const quoteUtils = (function () {
	const QA_ELIDE_NULL_BYTES = 0x01;
	const QA_ELIDE_OUTER_QUOTES = 0x02;
	const QA_SPLIT_TRIGRAPHS = 0x04;
	const FLAGS = {
		QA_ELIDE_NULL_BYTES,
		QA_ELIDE_OUTER_QUOTES,
		QA_SPLIT_TRIGRAPHS
	};

	const quotingStyles = [
		'literal',
		'shell',
		'shell_always',
		'shell_escape',
		'shell_escape_always',
		'c',
		'c_maybe',
		'escape',
		'locale',
		'clocale'
	];

	function gettextQuote (msgid, s) {
		// TODO: implement gettext._, and use _(msgid)
		const translation = msgid;
		if (translation != msgid) {
			return translation;
		}

		if (!localeCharmapCache) {
			localeCharmapCache = child_process
				.execSync('locale charmap 2>/dev/null')
				.toString()
				.replace(/\s+$/, '')
				.toLowerCase();
		}

		if (localeCharmapCache == 'utf-8') {
			return msgid == '`' ? '‘' : '’';
		}
		/*
		// TBD: in GB18030,
		//     '‘': 0xa1 0xae
		//     '’': 0xa1 0xaf
		else if (localeCharmapCache == 'gb18030') {
			//
		}
		*/
		else if (s == 'clocale') {
			return '"';
		}
		else {
			return "'";
		}
	}

	function quotearg_buffer_restyled (arg, q, maxResultLength = -1, depth = 0) {
		if (depth >= 3) {
			throw new Error('reached to recursion max limit.');
		}

		const flags = q.flags;
		const quoteTheseToo = q.quoteTheseToo;
		let quoting_style = q.style;
		let leftQuote = q.leftQuote;
		let rightQuote = q.rightQuote;

		let quote_string;
		let backslash_escapes = false;
		let elide_outer_quotes = !!(flags & QA_ELIDE_OUTER_QUOTES);
		let pending_shell_escape_end = false;
		let encountered_single_quote = false;
		let all_c_and_shell_quote_compat = true;

		const buffer = [];
		let retry, c, esc;
		let is_right_quote = false;
		let escaping = false;
		let c_and_shell_quote_compat = false;

		function charAt (index) {
			return String.fromCharCode(arg[index]);
		}

		function store (c) {
			if (maxResultLength < 0 || buffer.length < maxResultLength) {
				buffer.push(c);
			}
		}

		function start_esc () {
			if (elide_outer_quotes) {
				debugThrow && console.log('throwing from start_esc...');
				throw 'force_outer_quoting_style';
			}
			escaping = true;
			if (quoting_style == 'shell_always'
			 && !pending_shell_escape_end) {
				store("'$'");
				pending_shell_escape_end = true;
			}
			store('\\');
		}

		function end_esc () {
			if (pending_shell_escape_end && !escaping) {
				store('\'\'');
				pending_shell_escape_end = false;
			}
		}

		function store_escape () {
			start_esc();
			store_c();
		}

		function store_c () {
			end_esc();
			store(c);

			if (!c_and_shell_quote_compat) {
				all_c_and_shell_quote_compat = false;
			}
		}

		// <<< preSwitch
		function preSwitch () {
			switch (q.style) {
			case 'c_maybe':
				quoting_style = 'c';
				elide_outer_quotes = true;
				/*FALLTHRU*/

			case 'c':
				if (!elide_outer_quotes) {
					store('"');
				}
				backslash_escapes = true;
				quote_string = '"';
				break;

			case 'escape':
				backslash_escapes = true;
				elide_outer_quotes = false;
				break;

			case 'locale':
			case 'clocale':
			case 'custom':
				if (quoting_style != 'custom') {
					leftQuote = gettextQuote('`', quoting_style);
					rightQuote = gettextQuote("'", quoting_style);
				}
				if (!elide_outer_quotes) {
					store(leftQuote);
				}
				backslash_escapes = true;
				quote_string = rightQuote;
				break;

			case 'shell_escape':
				backslash_escapes = true;
				/*FALLTHRU*/
			case 'shell':
				elide_outer_quotes = true;
				/*FALLTHRU*/
			case 'shell_escape_always':
				if (!elide_outer_quotes) {
					backslash_escapes = true;
				}
				/*FALLTHRU*/
			case 'shell_always':
				quoting_style = 'shell_always';
				if (!elide_outer_quotes) {
					store('\'');
				}
				quote_string = '\'';
				break;

			case 'literal':
				elide_outer_quotes = false;
				break;

			default:
				throw new Error(`invalid quote style: "${q.style}"`);
			}
		}
		// >>>

		function debugout () {
			if (!debugLoopBottom) return;
			console.log(` current buffer at loop end: ${getSafeString(buffer.join(''))}`);
		}

		if (typeof arg == 'string') {
			arg = Buffer.from(arg, 'utf8');
		}

		try {
			do {
				retry = false;
				preSwitch();

				if (debugLoopStart) {
					process.stdout.write(`${'='.repeat(10)}\nstart with style "${quoting_style}"\narg: `);
					console.dir(arg);
					console.log(`flags: ${flags}`);
					console.log(`backslash_escapes: ${backslash_escapes}`);
					console.log(`elide_outer_quotes: ${elide_outer_quotes}`);
					console.log(`quote_string: ${quote_string}`);
					console.log(`quotes: ${leftQuote} ${rightQuote}`);
				}

				for (let i = 0; i < arg.length; debugout(), i++) {
					debugLoopHead && console.log(`\
---------------------
  current char: ${getSafeString(charAt(i))}
 quoting_style: "${quoting_style}"
current buffer at loop head: ${getSafeString(buffer.join(''))}`);

					esc = null;
					is_right_quote = false;
					escaping = false;
					c_and_shell_quote_compat = false;

					if (backslash_escapes
					 && quoting_style != 'shell_always'
					 && typeof quote_string == 'string'
					 && quote_string != ''
					 && i + quote_string.length <= arg.length
					 && arg.toString('utf8', i, i + quote_string.length) == quote_string) {
						if (elide_outer_quotes) {
							debugThrow && console.log('throwing from backslash check');
							throw 'force_outer_quoting_style';
						}
						is_right_quote = true;
					}

					switch (c = charAt(i)) {
					// <<< NUL character
					case '\x00':
						if (backslash_escapes) {
							start_esc();
							/*
							 * If quote_string were to begin with digits, we'd
							 * need to test for the end of the arg as well.
							 * However, it's hard to imagine any locale that
							 * would use digits in quotes, and set_custom_quoting
							 * is documented not to accept them.  Use only a
							 * single \0 with shell-escape as currently digits
							 * are not printed within $'...'
							 */
							if (quoting_style != 'shell_always'
							 && i + 1 < arg.length
							 && /[0-9]/.test(charAt(i + 1))) {
								store('00');
							}
							c = '0';
							/*
                             * We don't have to worry that this last '0' will
							 * be backslash-escaped because, again, quote_string
							 * should not start with it and because quote_these_too
							 * is documented as not accepting it.
							 */
						}
						else if (flags & QA_ELIDE_NULL_BYTES) {
							continue;
						}
						break;
					// >>>

					// <<< trigraph
					case '?':
						switch (quoting_style) {
						case 'shell_always':
							if (elide_outer_quotes) {
								debugThrow && console.log('throwing from trigraph check #1');
								throw 'force_outer_quoting_style';
							}
							break;
						case 'c':
							if ((flags & QA_SPLIT_TRIGRAPHS)
							 && i + 2 < arg.length
							 && charAt(i + 1) == '?') {
								switch (charAt(i + 2)) {
								case '!': case '\'':
								case '(': case ')': case '-': case '/':
								case '<': case '=': case '>':
									/*
									 * Escape the second '?' in what would otherwise
									 * be a trigraph.
									 */
									if (elide_outer_quotes) {
										debugThrow && console.log('throwing from trigraph check #2');
										throw 'force_outer_quoting_style';
									}
									c = charAt(i + 2);
									i += 2;
									store('?""?');
									break;
								}
							}
							break;
						}
						break;
					// >>>

					// <<< escape character
					case '\\':
						esc = c;
						/*
						 * Never need to escape '\' in shell case.
						 */
						if (quoting_style == 'shell_always') {
							if (elide_outer_quotes) {
								debugThrow && console.log('throwing from escape character check');
								throw 'force_outer_quoting_style';
							}
							store_c();
							continue;
						}
						/*
						 * No need to escape the escape if we are trying to elide outer
						 * quotes and nothing else is problematic.
						 */
						if (backslash_escapes
						 && elide_outer_quotes
						 && quote_string != '') {
							store_c();
							continue;
						}
						/*FALLTHRU*/
					case '\n': case '\r': case '\t':
						if (esc === null) {
							esc = {'\n': 'n', '\r': 'r', '\t': 't'}[c];
						}
						if (quoting_style == 'shell_always'
						 && elide_outer_quotes) {
							debugThrow && console.log('throwing from control-n/r/t check');
							throw 'force_outer_quoting_style';
						}
						/*FALLTHRU*/
					case '\x07': case '\b': case '\f': case '\v':
						if (esc === null) {
							esc = {'\x07': 'a', '\b': 'b', '\f': 'f', '\v': 'v'}[c];
						}
						if (backslash_escapes) {
							c = esc;
							esc = null;
							store_escape();
							continue;
						}
						break;
					// >>>

					case '{': case '}': /* sometimes special if isolated */
						if (arg.length == 1) {
							break;
						}
						/*FALLTHRU*/
					case '#': case '~':
						if (i != 0) {
							break;
						}
						/*FALLTHRU*/
					case ' ':
						c_and_shell_quote_compat = true;
						/*FALLTHRU*/

					// <<< shell special characters
					case '!':
					case '"': case '$': case '&':
					case '(': case ')': case '*': case ';':
					case '<':
					case '=': /* sometimes special in 0th or (with "set -k") later args */
					case '>': case '[':
					case '^': /* special in old /bin/sh, e.g. SunOS 4.1.4 */
					case '`': case '|':
						/*
						 * A shell special character.  In theory, '$' and '`'
						 * could be the first bytes of multibyte characters,
						 * which means we should check them with mbrtowc, but
						 * in practice this doesn't happen so it's not worth
						 * worrying about.
						 */
						if (quoting_style == 'shell_always'
						 && elide_outer_quotes) {
							debugThrow && console.log('throwing from shell special character check');
							throw 'force_outer_quoting_style';
						}
						break;
					// >>>

					// <<< single quote
					case '\'':
						encountered_single_quote = true;
						c_and_shell_quote_compat = true;
						if (quoting_style == 'shell_always') {
							if (elide_outer_quotes) {
								debugThrow && console.log('throwing from single quote check');
								throw 'force_outer_quoting_style';
							}

							store('\'\\\'');
							pending_shell_escape_end = false;
						}
						break;
					// >>>

					// <<< normal characters
					case '%': case '+': case ',': case '-': case '.': case '/':
					case '0': case '1': case '2': case '3': case '4': case '5':
					case '6': case '7': case '8': case '9': case ':':
					case 'A': case 'B': case 'C': case 'D': case 'E': case 'F':
					case 'G': case 'H': case 'I': case 'J': case 'K': case 'L':
					case 'M': case 'N': case 'O': case 'P': case 'Q': case 'R':
					case 'S': case 'T': case 'U': case 'V': case 'W': case 'X':
					case 'Y': case 'Z': case ']': case '_': case 'a': case 'b':
					case 'c': case 'd': case 'e': case 'f': case 'g': case 'h':
					case 'i': case 'j': case 'k': case 'l': case 'm': case 'n':
					case 'o': case 'p': case 'q': case 'r': case 's': case 't':
					case 'u': case 'v': case 'w': case 'x': case 'y': case 'z':
						/*
						 * These characters don't cause problems, no matter what the
						 * quoting style is.  They cannot start multibyte sequences.
						 * A digit or a special letter would cause trouble if it
						 * appeared at the beginning of quote_string because we'd
						 * then escape by prepending a backslash.  However, it's hard
						 * to imagine any locale that would use digits or letters as
						 * quotes, and set_custom_quoting is documented not to accept
						 * them.  Also, a digit or a special letter would cause trouble
						 * if it appeared in quote_these_too, but that's also documented
						 * as not accepting them.
						 */
						c_and_shell_quote_compat = true;
						break;
					// >>>

					// <<< other characters
					default:
						/*
						 * If we have a multibyte sequence, copy it until we
						 * reach its end, find an error, or come back to the
						 * initial shift state.  For C-like styles, if the
						 * sequence has unprintable characters, escape the
						 * whole sequence, since we can't easily escape single
						 * characters within it.
						 */
						{
							let printable = true;

							const result = utf8ToWideChar(arg, i);
							if (result) {
								if ('currentString' in result) {
									if (!iswprint(result.currentString)) {
										printable = false;
									}
								}
								else {
									printable = false;
								}
							}

							c_and_shell_quote_compat = printable;

							if (result.currentBytes >= 1 && printable) {
								c = result.currentString;
								i += result.currentBytes - 1;

								if (is_right_quote) {
									store('\\');
									is_right_quote = false;
								}

								end_esc();
								store(c);
								continue;
							}
							else if (backslash_escapes && !printable) {
								start_esc();
								c = `000${arg[i].toString(8)}`.substr(-3);
								store_c();
								continue;
							}
							else if (!printable) {
								if (q.replacement != null) {
									c = q.replacement;
								}
								store_c();
								continue;
							}
						}
					// >>>
					}

					const prereq1 = backslash_escapes
						&& quoting_style != 'shell_always';
					const prereq2 = prereq1 || elide_outer_quotes;
					if (!(prereq2 && quoteTheseToo && quoteTheseToo.has(c))
					 && !is_right_quote) {
						store_c();
						continue;
					}

//store_escape:
					store_escape();
//store_c:
				}

				/*
				 * after loop for arg...
				 */

				if (buffer.length == 0
				 && quoting_style == 'shell_always'
				 && elide_outer_quotes) {
					debugThrow && console.log(`throwing after loop, quoting_style: "${quoting_style}"`);
					throw 'force_outer_quoting_style';
				}

				/*
				 * Single shell quotes (') are commonly enough used as an
				 * apostrophe, that we attempt to minimize the quoting in this
				 * case.  Note itʼs better to use the apostrophe modifier
				 * "\u02BC" if possible, as that renders better and works with
				 * the word match regex \W+ etc.
				 */
				if (quoting_style == 'shell_always'
				 && !elide_outer_quotes
				 && encountered_single_quote) {
					if (all_c_and_shell_quote_compat) {
						const q2 = q.clone({style: 'c'});
						debugThrow && console.log('calling quotearg_buffer_restyled by all_c_and_shell_quote_compat...');
						return quotearg_buffer_restyled(arg, q2, maxResultLength, depth + 1);
					}
				}

				if (quote_string != '' && !elide_outer_quotes) {
					store(quote_string);
				}
			} while (retry);
		}
		catch (err) {
			if (err === 'force_outer_quoting_style') {
				if (quoting_style == 'shell_always'
					&& backslash_escapes) {
					quoting_style = 'shell_escape_always';
				}

				/*
				 * Don't reuse quote_these_too, since the addition of outer
				 * quotes sufficiently quotes the specified characters.
				 */
				const q2 = q.clone({
					style: quoting_style,
					flags: q.flags & ~QA_ELIDE_OUTER_QUOTES,
					quoteTheseToo: null
				});

				debugThrow && console.log('calling quotearg_buffer_restyled after force_outer_quoting_style exception...');
				return quotearg_buffer_restyled(arg, q2, maxResultLength, depth + 1);
			}
			else {
				throw err;
			}
		}

		return buffer.join('');
	}

	function quotearg_n_options (arg, q, maxResultLength = -1) {
		const q2 = q.clone({
			flags: q.flags | QA_ELIDE_NULL_BYTES
		});
		return quotearg_buffer_restyled(arg, q2, maxResultLength);
	}

	function quote_n_mem (arg) {
		return quotearg_n_options(arg, quoteQuotingOptions);
	}

	function q (init) {
		if (typeof init == 'string') {
			this.initialize({style: init, full: true});
		}
		else if (typeof init == 'object') {
			this.initialize({...init, full: true});
		}
		else {
			this.initialize({full: true});
		}
	}

	q.prototype.initialize = function (init = {}) {
		if ('style' in init) {
			this.style = init.style ?? 'literal';
		}
		else if (init.full) {
			this.style = 'literal';
		}
		if ('flags' in init) {
			this.flags = init.flags ?? 0;
		}
		else if (init.full) {
			this.flags = 0;
		}
		if ('quoteTheseToo' in init) {
			this.quoteTheseToo = init.quoteTheseToo instanceof Set ?
				new Set(init.quoteTheseToo) :
				new Set;
		}
		else if (init.full) {
			this.quoteTheseToo = new Set;
		}
		if ('leftQuote' in init) {
			this.leftQuote = init.leftQuote ?? '';
		}
		else if (init.full) {
			this.leftQuote = '';
		}
		if ('rightQuote' in init) {
			this.rightQuote = init.rightQuote ?? '';
		}
		else if (init.full) {
			this.rightQuote = '';
		}
		if ('replacement' in init) {
			this.replacement = init.replacement ?? null;
		}
		else if (init.full) {
			this.replacement = null;
		}
		return this;
	};
	q.prototype.clone = function (init) {
		return new q(this).initialize(init);
	};
	q.prototype.setCharQuoting = function (chs, value = true) {
		for (const ch of chs.split('')) {
			if (ch.codePointAt(0) > 255) continue;

			if (value) {
				this.quoteTheseToo.add(ch);
			}
			else {
				this.quoteTheseToo.delete(ch);
			}
		}
	};

	const defaultQuotingOptions = new q();
	const quoteQuotingOptions = new q('locale');
	let localeCharmapCache;

	let debugThrow = false;
	let debugLoopStart = false;
	let debugLoopHead = false;
	let debugLoopBottom = false;

	return {
		debug: (key, value) => {
			value = !!value;
			switch (key) {
			case 'throw':
				debugThrow = value;
				break;
			case 'start':
				debugLoopStart = value;
				break;
			case 'head':
				debugLoopHead = value;
				break;
			case 'bottom':
				debugLoopBottom = value;
				break;
			case 'all':
				debugThrow = value;
				debugLoopStart = value;
				debugLoopHead = value;
				debugLoopBottom = value;
				break;
			}
		},
		quotearg_buffer: (arg, options, maxResultLength = -1) => {
			return quotearg_buffer_restyled(
				arg, options ?? defaultQuotingOptions, maxResultLength);
		},
		quotearg: (arg) => {
			return quotearg_n_options(
				arg, defaultQuotingOptions);
		},
		quotearg_char: (ch, arg) => {
			const q2 = defaultQuotingOptions.clone();
			q2.setCharQuoting(ch);
			return quotearg_n_options(arg, q2);
		},
		quotearg_colon: arg => {
			const q2 = defaultQuotingOptions.clone();
			q2.setCharQuoting(':');
			return quotearg_n_options(arg, q2);
		},
		quotearg_custom: (leftQuote, rightQuote, arg) => {
			const q2 = defaultQuotingOptions.clone();
			q2.leftQuote = leftQuote;
			q2.rightQuote = rightQuote;
			return quotearg_n_options(arg, q2);
		},

		quotearg_style: (style, arg) => {
			const q2 = new q(style);
			return quotearg_n_options(arg, q2);
		},
		quotearg_style_colon: (style, arg) => {
			const q2 = new q(style);
			q2.setCharQuoting(':');
			return quotearg_n_options(arg, q2);
		},

		quote: arg => {
			return quotearg_n_options(arg, quoteQuotingOptions);
		},
		// quotef: 'QUOTE for File'
		quotef: arg => {
			const q2 = new q('shell');
			q2.setCharQuoting(':');
			return quotearg_n_options(arg, q2);
		},
		// quoteaf: 'QUOTE Always for File'
		quoteaf: arg => {
			const q2 = new q('shell_always');
			return quotearg_n_options(arg, q2);
		},

		get defaultQuotingOptions () {
			return defaultQuotingOptions;
		},
		get quoteQuotingOptions () {
			return quoteQuotingOptions;
		},
		get flags () {
			return FLAGS;
		},
		utf8ToWideChar, iswprint, getSafeString,
		q, quotingStyles
	};
})();
// >>>

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
