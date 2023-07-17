/**
 * human.js -- partial port of gnulib/lib/human.c
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';

export const humanUtils = (() => {
	// asume sizeof (uintmax_t) = 8
	//       CHAR_BIT = 8
	//       MB_LEN_MAX = 4
	const LONGEST_HUMAN_READABLE = (Math.trunc((2 * 8) * 8 * 146 / 485) + 1) * (4 + 1) - 4 + 1 + 3;
	const HUMAN_READABLE_SUFFIX_LENGTH_MAX = 3;

	const LONGINT_OK = 0;
	const LONGINT_OVERFLOW = 1;
	const LONGINT_INVALID_SUFFIX_CHAR = 2;
	const LONGINT_INVALID_SUFFIX_CHAR_WITH_OVERFLOW = 3;
	const LONGINT_INVALID = 4;

	const DEFAULT_BLOCK_SIZE = 1024;

	const human_ceiling = 0;
	const human_round_to_nearest = 1;
	const human_floor = 2;
	const human_group_digits = 4;
	const human_suppress_point_zero = 8;
	const human_autoscale = 16;
	const human_base_1024 = 32;
	const human_space_before_unit = 64;
	const human_SI = 128;
	const human_B = 256;

	const block_size_params = [
		['human-readable', human_autoscale | human_SI | human_base_1024],
		['si', human_autoscale | human_SI]
	];

	const power_letter = [
		0,    /* not used */
		'K',  /* kibi ('k' for kilo is a special case) */
		'M',  /* mega or mebi */
		'G',  /* giga or gibi */
		'T',  /* tera or tebi */
		'P',  /* peta or pebi */
		'E',  /* exa or exbi */
		'Z',  /* zetta or 2**70 */
		'Y',  /* yotta or 2**80 */
		'R',  /* ronna or 2**90 */
		'Q'   /* quetta or 2**100 */
	];

	let localeVars;

	function getLocaleVar (...keys) {
		if (!localeVars) {
			localeVars = new Map;
			const infoset = child_process
				.execSync('locale -k LC_NUMERIC 2>/dev/null')
				.toString()
				.replace(/\s+$/, '');
			infoset.split('\n').forEach(info => {
				if (/^([^=]+)=(.+)/.test(info)) {
					let itemKey = RegExp.$1;
					let itemValue = RegExp.$2.replace(/^["']|["']$/g, '');
					localeVars.set(itemKey, itemValue);
				}
			});
		}

		if (keys.length == 1) {
			return localeVars.get(key);
		}
		else {
			return keys.map(key => localeVars.get(key));
		}
	}

	function adjustValue (inexact_style, value) {
		if (inexact_style != human_round_to_nearest
		 && value < 18446744073709551615) {
			const u = Math.trunc(value);
			value = u + (inexact_style == human_ceiling && u != value ? 1 : 0);
		}
		return value;
	}

	function group_number () {
	}

	function humanReadable (n, opts, fromBlockSize, toBlockSize) {
		function use_integer_arithmetic (mode) {
			/*
			 * The computation can be done exactly, with integer arithmetic.
			 *
			 * Use power of BASE notation if requested and if adjusted AMT is
			 * large enough.
			 */
			if (opts & human_autoscale) {
				exponent = 0;

				if (base <= amt) {
					do {
						const r10 = (amt % base) * 10 + tenths;
						const r2 = (r10 % base) * 2 + (rounding >> 1);
						amt = Math.trunc(amt / base);
						tenths = Math.trunc(r10 / base);
						rounding = r2 < base ?
							((r2 + rounding) != 0 ? 1 : 0) :
							2 + ((base < r2 + rounding) ? 1 : 0);
						exponent++;
					} while (base <= amt && exponent < exponent_max);

					if (amt < 10) {
						let found = false;
						if (inexact_style == human_round_to_nearest) {
							if (2 < rounding + (tenths & 1)) {
								found = true;
							}
						}
						else {
							if (inexact_style == human_ceiling
							 && 0 < rounding) {
								found = true;
							}
						}
						if (found) {
							tenths++;
							rounding = 0;
							if (tenths == 10) {
								amt++;
								tenths = 0;
							}
						}
						if (amt < 10
						 && (tenths || !(opts & human_suppress_point_zero))) {
							buf += decimal_point;
							buf += digits.charAt(tenths);
							tenths = rounding = 0;
						}
					}
				}
			}

			let found = false;
			if (inexact_style == human_round_to_nearest) {
				const adjust = (0 < rounding + (amt & 1)) ? 1 : 0;
				if (5 < tenths + adjust) {
					found = true;
				}
			}
			else {
				if (inexact_style == human_ceiling
				 && 0 < tenths + rounding) {
					found = true;
				}
			}
			if (found) {
				amt++;
				if ((opts && human_autoscale)
				 && amt == base
				 && exponent < exponent_max) {
					exponent++;
					if (!(opts & human_suppress_point_zero)) {
						buf = '0' + buf;
						buf = decimal_point + buf;
					}
					amt = 1;
				}
			}

			do {
				const digit = amt % 10;
				buf = digits.charAt(digit) + buf;
			} while ((amt = Math.trunc(amt / 10)) != 0);
		}

		function do_grouping (mode) {
			if (opts & human_group_digits) {
				buf = (buf - 0).toLocaleString(undefined, {grouping: true});
			}
			if (opts & human_SI) {
				if (exponent < 0) {
					exponent = 0;
					for (let power = 1; power < toBlockSize; power *= base) {
						if (++exponent == exponent_max) {
							break;
						}
					}
				}
				if ((exponent || (opts & human_B))
				 && (opts & human_space_before_unit)) {
					buf += ' ';
				}
				if (exponent) {
					if (!(opts & human_base_1024)
					 && exponent == 1) {
						buf += 'k';
					}
					else {
						buf += power_letter[exponent] || '';
					}
				}
				if (opts & human_B) {
					if ((opts & human_base_1024)
					 && exponent) {
						buf += 'i';
					}
					buf += 'B';
				}
			}
		}

		if (typeof n != 'number') {
			throw new Error(`humanReadable: 1st argument is not a number.`);
		}
		if (Number.isNaN(n)) {
			throw new Error(`humanReadable: 1st argument is NaN.`);
		}
		if (!Number.isFinite(n)) {
			throw new Error(`humanReadable: 1st argument is infinity.`);
		}

		const inexact_style =
			opts & (human_round_to_nearest | human_floor | human_ceiling);
		const base = opts & human_base_1024 ? 1024 : 1000;
		const exponent_max = power_letter.length - 1;
		const digits = '0123456789';

		let buf = '';
		let exponent = -1;
		let amt, tenths;
		/*
		 * 0 means adjusted N == AMT.TENTHS;
		 * 1 means AMT.TENTHS < adjusted N < AMT.TENTHS + 0.05;
		 * 2 means adjusted N == AMT.TENTHS + 0.05;
		 * 3 means AMT.TENTHS + 0.05 < adjusted N < AMT.TENTHS + 0.1.
		 */
		let rounding;

		const [decimal_point, grouping, thousands_sep] =
			getLocaleVar('decimal_point', 'grouping', 'thousands_sep');

		if (toBlockSize <= fromBlockSize) {
			if (fromBlockSize % toBlockSize == 0) {
				const multiplier = Math.trunc(fromBlockSize / toBlockSize);
				amt = n * multiplier;
				if (Math.trunc(amt / multiplier) == n) {
					// mode #1
					tenths = rounding = 0;
					use_integer_arithmetic(1);
					do_grouping(1);
					return buf;
				}
				else {
					//console.log('not a mode #1 (a)');
				}
			}
			else {
				//console.log('not a mode #1 (b)');
			}
		}

		else if (fromBlockSize != 0 && toBlockSize % fromBlockSize == 0) {
			// mode #2
			const divisor = Math.trunc(toBlockSize / fromBlockSize);
			const r10 = (n % divisor) * 10;
			const r2 = (r10 % divisor) * 2;
			amt = Math.trunc(n / divisor);
			tenths = Math.trunc(r10 / divisor);
			rounding = r2 < divisor ?
				(0 < r2 ? 1 : 0) :
				2 + (divisor < r2 ? 1 : 0);
			use_integer_arithmetic(2);
			do_grouping(2);
			return buf;
		}

		// mode #3
		let damt = n * (fromBlockSize / toBlockSize);

		if (!(opts & human_autoscale)) {
			buf = adjustValue(inexact_style, damt).toFixed(0);
		}
		else {
			let e = 1;
			exponent = 0;

			do {
				e *= base;
				exponent++;
			} while (e * base <= damt && exponent < exponent_max);

			damt /= e;
			buf = adjustValue(inexact_style, damt).toFixed(1);

			if (opts & human_suppress_point_zero) {
				buf = buf.replace(/\.0$/, '');
			}
		}

		do_grouping(3);
		return buf;
	}

	function default_block_size () {
		return 'POSIXLY_CORRECT' in process.env ?
			512 :
			DEFAULT_BLOCK_SIZE;
	}

	function strtoul (s, p, base = 0) {
		function noconv () {
			if (save >= 2
			 && /^0[XB]$/i.test(s.substr(save - 2, 2))) {
				p.p = save - 1;
			}
			else {
				p.p = 0;
			}
			return 0;
		}

		let result = 0;
		let overflow = false;
		let save;

		if (base < 0 || base == 1 || base > 36) {
			p.errno = 'EINVAL';
			return 0;
		}

		save = p.p = 0;

		// Skip white space
		if (/^\s+/.test(s)) {
			p.p = RegExp.lastMatch.length;
		}
		if (p.p >= s.length) {
			return noconv();
		}

		// Check a sign
		if (s.charAt(p.p) == '-') {
			p.errno = 'EINVAL';
			return 0;
		}
		else if (s.charAt(p.p) == '+') {
			p.p++;
		}

		/*
		 * Recognize number prefix and if BASE is zero,
		 * figure it out ourselves.
		 */
		if (s.charAt(p.p) == '0') {
			if ((base == 0 || base == 16)
			 && s.charAt(p.p + 1).toUpperCase() == 'X') {
				p.p += 2;
				base = 16;
			}
			else if ((base == 0 || base == 2)
				&& s.charAt(p.p + 1).toUpperCase() == 'B') {
				p.p += 2;
				base = 2;
			}
			else if (base == 0) {
				base = 8;
			}
		}
		else if (base == 0) {
			base = 10;
		}

		/*
		 * Save the position so we can check later if anything happened.
		 */
		save = p.p;

		{
			const cutoff = Math.trunc(Number.MAX_SAFE_INTEGER / base);
			const cutlim = Number.MAX_SAFE_INTEGER % base;
			const zero = '0'.charCodeAt(0);
			const a = 'A'.charCodeAt(0);

			for (; p.p < s.length; p.p++) {
				let c = s.charAt(p.p);
				if (/^[0-9]/.test(c)) {
					c = c.charCodeAt(0) - zero;
				}
				else if (/^[a-z]/i.test(c)) {
					c = c.toUpperCase().charCodeAt(0) - a + 10;
				}
				else {
					break;
				}
				if (c >= base) {
					break;
				}
				if (result > cutoff || (result == cutoff && c > cutlim)) {
					overflow = true;
				}
				else {
					result *= base;
					result += c;
				}
				
			}
		}

		if (p.p == save) {
			return noconv();
		}

		if (overflow) {
			p.errno = 'ERANGE';
			return Number.MAX_SAFE_INTEGER;
		}

		return result;
	}

	function bkm_scale (val, factor) {
		val *= factor;
		return [
			val,
			val > Number.MAX_SAFE_INTEGER ? LONGINT_OVERFLOW : LONGINT_OK
		];
	}

	function bkm_scale_by_power (val, base, power) {
		val *= Math.pow(base, power);
		return [
			val,
			val > Number.MAX_SAFE_INTEGER ? LONGINT_OVERFLOW : LONGINT_OK
		];
	}

	function xstrtoumax (spec, strtoulBase = 0, validSuffixes = null) {
		if (!(0 <= strtoulBase && strtoulBase <= 36)) {
			throw new Error(`Invalid base value: ${strtoulBase}`);
		}

		if (/^\s*-/.test(spec)) {
			return {error: LONGINT_INVALID};
		}

		let p = {};
		let tmp = strtoul(spec, p, strtoulBase);
		let err = LONGINT_OK;
		let suffix = '';

		if (p.p == 0) {
			if (validSuffixes
			 && validSuffixes.length
			 && validSuffixes.includes(spec.charAt(0))) {
				tmp = 1;
			}
			else {
				return {error: LONGINT_INVALID};
			}
		}
		else if ('errno' in p) {
			if (p.errno != 'ERANGE') {
				return {error: LONGINT_INVALID};
			}
			err = LONGINT_OVERFLOW;
		}

		if (validSuffixes === null) {
			return {value: tmp};
		}

		p = p.p;

		if (p < spec.length) {
			let base = 1024;
			let suffixLength = 1;
			let overflow;

			if (!validSuffixes.includes(spec.charAt(p))) {
				return {error: err | LONGINT_INVALID_SUFFIX_CHAR};
			}

			switch (spec.charAt(p)) {
			case 'E':
			case 'G': case 'g':
			case 'k': case 'K':
			case 'M': case 'm':
			case 'P': case 'Q': case 'R':
			case 'T': case 't':
			case 'Y': case 'Z':
				/*
				 * The "valid suffix" '0' is a special flag meaning that an
				 * optional second suffix is allowed, which can change the base.
				 * A suffix "B" (e.g. "100MB") stands for a power of 1000,
				 * whereas a suffix "iB" (e.g. "100MiB") stands for a power of
				 * 1024.  If no suffix (e.g. "100M"), assume power-of-1024.
				 */
				if (validSuffixes.includes('0')) {
					if (/^iB/.test(spec.substring(p + 1))) {
						suffixLength += 2;
					}
					else if (/^[BD]/.test(spec.substring(p + 1))) {
						base = 1000;
						suffixLength += 1;
					}
				}
			}

			switch (spec.charAt(p)) {
			case 'b':
				[tmp, overflow] = bkm_scale(tmp, 512);
				break;

			case 'B':
				/* This obsolescent first suffix is distinct from the 'B'
				 * second suffix above.  E.g., 'tar -L 1000B' means change
				 * the tape after writing 1000 KiB of data.
				 */
				[tmp, overflow] = bkm_scale(tmp, 1024);
				break;

			case 'c':
				overflow = LONGINT_OK;
				break;

			case 'E': /* exa or exbi */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 6);
				break;

			case 'G': /* giga or gibi */
			case 'g': /* 'g' is undocumented; for compatibility only */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 3);
				break;

			case 'k': /* kilo */
			case 'K': /* kibi */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 1);
				break;

			case 'M': /* mega or mebi */
			case 'm': /* 'm' is undocumented; for compatibility only */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 2);
				break;

			case 'P': /* peta or pebi */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 5);
				break;

			case 'Q': /* quetta or 2**100 */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 10);
				break;

			case 'R': /* ronna or 2**90 */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 9);
				break;

			case 'T': /* tera or tebi */
			case 't': /* 't' is undocumented; for compatibility only */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 4);
				break;

			case 'w':
				[tmp, overflow] = bkm_scale(tmp, 2);
				break;

			case 'Y': /* yotta or 2**80 */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 8);
				break;

			case 'Z': /* zetta or 2**70 */
				[tmp, overflow] = bkm_scale_by_power(tmp, base, 7);
				break;

			default:
				return {error: err | LONGINT_INVALID_SUFFIX_CHAR};
			}

			suffix = spec.substr(p, suffixLength);
			err |= overflow;
			p += suffixLength;
			if (p < spec.length) {
				err |= LONGINT_INVALID_SUFFIX_CHAR;
			}
		}

		return err != LONGINT_OK ?
			{error: err} :
			{value: tmp, suffix};
	}

	function humblock (spec) {
		const result = {
			opts: 0,
			block_size: 0
		};

		if (!spec) {
			spec = process.env['BLOCK_SIZE'];
		}
		if (!spec) {
			spec = process.env['BLOCKSIZE'];
		}
		if (!spec) {
			result.block_size = default_block_size();
		}
		else {
			if (spec.startsWith('\'')) {
				result.opts |= human_group_digits;
				spec = spec.substring(1);
			}

			const index = block_size_params.findIndex(item => spec == item[0]);
			if (index >= 0) {
				result.opts |= block_size_params[index][1];
				result.block_size = 1;
			}
			else {
				const e = xstrtoumax(spec, 0, 'eEgGkKmMpPtTyYzZ0');
				if ('error' in e) {
					delete result.opts;
					delete result.block_size;
					result.error = e.error;
				}
				else {
					result.block_size = e.value;

					if (e.suffix != '') {
						if (/B$/.test(e.suffix)) {
							result.opts |= human_B;
						}
						if (/[^B]$|i.$/.test(e.suffix)) {
							result.opts |= human_base_1024;
						}
					}
				}
			}
		}

		return result;
	}

	function humanOptions (spec) {
		const result = humblock(spec);
		if (result.block_size == 0) {
			result.block_size = default_block_size();
			result.error = LONGINT_INVALID;
		}
		return result;
	}

	return {
		LONGINT_OK, LONGINT_OVERFLOW, LONGINT_INVALID_SUFFIX_CHAR,
		LONGINT_INVALID_SUFFIX_CHAR_WITH_OVERFLOW, LONGINT_INVALID,

		human_ceiling, human_round_to_nearest, human_floor,
		human_group_digits, human_suppress_point_zero,
		human_autoscale, human_base_1024, human_space_before_unit,
		human_SI, human_B,

		strtoul, xstrtoumax, humblock, humanOptions, humanReadable
	}
})();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
