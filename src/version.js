/**
 * versionUtils - partial port of gnulib/lib/filevercmp.c
 *
 * @author akahuku@gmail.com
 */

export const versionUtils = (() => {
	function file_prefixlen (s) {
		const re = /((?<!^)\.[A-Za-z~][A-Za-z0-9~]*)+$/.exec(s);
		return re ? re.index : s.length;
	}

	function file_prefixlen2 (s) {
		const n = s.length;
		let prefixlen = 0;
		for (let i = 0; ; ) {
			if (i == n) {
				return prefixlen;
			}
			i++;
			prefixlen = i;
			while (i + 1 < n
				&& s.charAt(i) == '.'
				&& (c_isalpha(s.charAt(i + 1)) || s.charAt(i + 1) == '~')) {
				for (i += 2; i < n && (c_isalnum(s.charAt(i)) || s.charAt(i) == '~'); i++) {
					continue;
				}
			}

		}
	}

	function c_isdigit (c) {
		return /^[0-9]$/.test(c);
	}

	function c_isalpha (c) {
		return /^[a-zA-Z]$/.test(c);
	}

	function c_isalnum (c) {
		return /^[0-9a-zA-Z]$/.test(c);
	}

	function order (s, pos, len) {
		if (pos == len) {
			return -1;
		}

		const c = s.charAt(pos);
		if (c_isdigit(c)) {
			return 0;
		}
		else if (c_isalpha(c)) {
			return c.charCodeAt(0);
		}
		else if (c == '~') {
			return -2;
		}
		else {
			return c.charCodeAt(0) + 0x10000;
		}
	}

	function verrevcmp (s1, s1_len, s2, s2_len) {
		let s1_pos = 0;
		let s2_pos = 0;
		while (s1_pos < s1_len || s2_pos < s2_len) {
			let first_diff = 0;
			while ((s1_pos < s1_len && !c_isdigit(s1.charAt(s1_pos)))
				|| (s2_pos < s2_len && !c_isdigit(s2.charAt(s2_pos)))) {
				const s1_c = order(s1, s1_pos, s1_len);
				const s2_c = order(s2, s2_pos, s2_len);
				if (s1_c != s2_c) {
					return s1_c - s2_c;
				}
				s1_pos++;
				s2_pos++;
			}
			while (s1_pos < s1_len && s1.charAt(s1_pos) == '0') {
				s1_pos++;
			}
			while (s2_pos < s2_len && s2.charAt(s2_pos) == '0') {
				s2_pos++;
			}
			while (s1_pos < s1_len
			  && s2_pos < s2_len
			  && c_isdigit(s1.charAt(s1_pos))
			  && c_isdigit(s2.charAt(s2_pos))) {
				if (!first_diff) {
					first_diff = s1.charCodeAt(s1_pos) - s2.charCodeAt(s2_pos);
				}
				s1_pos++;
				s2_pos++;
			}
			if (s1_pos < s1_len && c_isdigit(s1.charAt(s1_pos))) {
				return 1;
			}
			if (s2_pos < s2_len && c_isdigit(s2.charAt(s2_pos))) {
				return -1;
			}
			if (first_diff) {
				return first_diff;
			}
		}
		return 0;
	}

	function filevercmp (a, b) {
		if (a == '') return b == '' ? 0 : -1;
		if (b == '') return 1;
		if (a.startsWith('.')) {
			if (!b.startsWith('.')) return -1;
			if (a == '.') return b == '.' ? 0 : -1;
			if (b == '.') return 1;
			if (a == '..') return b == '..' ? 0 : -1;
			if (b == '..') return 1;
		}
		else if (b.startsWith('.')) {
			return 1;
		}

		const aPrefixLen = file_prefixlen(a);
		const bPrefixLen = file_prefixlen(b);
		const onePassOnly =
			aPrefixLen == a.length && bPrefixLen == b.length;
		const result = verrevcmp(a, aPrefixLen, b, bPrefixLen);
		return result || onePassOnly ? result : verrevcmp(a, a.length, b, b.length);
	}

	return {file_prefixlen, file_prefixlen2, filevercmp};
})();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
