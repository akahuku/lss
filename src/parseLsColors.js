/**
 * parseLsColors.js -- parse LS_COLORS environment variable
 *
 * @author akahuku@gmail.com
 */

import {error, pref, runtime} from './base.js';

function knownTermType () {
	const term = process.env['TERM'];
	return term === 'Eterm'
		|| term === 'ansi'
		|| /color/.test(term)
		|| /^con[0-9].*x[0-9]/.test(term)
		|| term === 'cons25'
		|| term === 'console'
		|| term === 'cygwin'
		|| /direct/.test(term)
		|| term === 'dtterm'
		|| term === 'foot'
		|| term === 'gnome'
		|| term === 'hurd'
		|| term === 'jfbterm'
		|| term === 'konsole'
		|| term === 'kterm'
		|| term === 'linux'
		|| term === 'linux-c'
		|| term === 'mlterm'
		|| term === 'putty'
		|| /^rxvt/.test(term)
		|| /^screen/.test(term)
		|| term === 'st'
		|| term === 'terminator'
		|| /^tmux/.test(term)
		|| term === 'vt100'
		|| term === 'wezterm'
		|| /^xterm/.test(term);
}

export function parseLsColors () {
	let s;

	if ((s = process.env['LS_COLORS']) == undefined || s == '') {
		const colorTerm = process.env['COLORTERM'];
		if (!(colorTerm != undefined && colorTerm != '')
		 && !knownTermType()
		 && !process.stdout.hasColors()) {
			pref.printWithColor = false;
		}
		return;
	}

	const CTRL_MAP = {
		'a':  7, 'b':  8, 't':  9, 'n': 10, 'v':  11,
		'f': 12, 'r': 13, 'e': 27, '_': 32, '?': 127
	};
	const extensions = pref.colorMap.extensions;
	const stats = {};

	let p = 0;
	let state = 'PS_START';
	let label;

	function getFunkeyString (equals_end) {
		const buf = [];

		let num = 0;
		let state = 'gnd';

		while (state != 'end' && state != 'error') {
			switch (state) {
			case 'gnd':
				switch (p < s.length ? s.charAt(p) : 'END') {
				case ':': case 'END':
					state = 'end';
					break;
				case '\\':
					state = 'backslash';
					++p;
					break;
				case '^':
					state = 'caret';
					++p;
				case '=':
					if (equals_end) {
						state = 'end';
						break;
					}
					/*FALLTHRU*/
				default:
					buf.push(s.charAt(p++));
					break;
				}
				break;

			case 'backslash':
				switch (p < s.length ? s.charAt(p) : 'END') {
				case '0': case '1': case '2': case '3':
				case '4': case '5': case '6': case '7':
					state = 'octal';
					num = s.charCodeAt(p) - '0'.charCodeAt(0);
					break;
				case 'x': case 'X':
					state = 'hex';
					num = 0;
					break;
				case 'END':
					state = 'error';
					break;
				default:
					num = CTRL_MAP[s.charAt(p)] ?? s.charCodeAt(p);
					break;
				}
				if (state == 'backslash') {
					buf.push(String.fromCharCode(num));
					state = 'gnd';
				}
				++p;
				break;

			case 'octal':
				if (/^[0-7]/.test(s.charAt(p))) {
					num = (num << 3)
						+ (s.charCodeAt(p) - '0'.charCodeAt(0));
				}
				else {
					buf.push(num);
					state = 'gnd';
				}
				break;

			case 'hex':
				if (/^[0-9]$/.test(s.charAt(p))) {
					num = (num << 4)
						+ (s.charCodeAt(p) - '0'.charCodeAt(0));
				}
				else if (/^[a-f]$/i.test(s.charAt(p))) {
					num = (num << 4)
						+ (s.toLowerCase().charCodeAt(p) - 'a'.charCodeAt(0));
				}
				else {
					buf.push(num);
					state = 'gnd';
				}

			case 'caret':
				state = 'gnd';
				if (/^[@-~]$/.test(s.charAt(p))) {
					buf.push(s.charCodeAt(p) - '@'.charCodeAt(0));
				}
				else if (s.charAt(p) == '?') {
					buf.push('\x7f');
				}
				else {
					state = 'error';
				}
				break;

			default:
				throw new Error(`invalid state: ${state} at getFunkeyString`);
			}
		}

		return {
			buf: buf.join(''),
			ok: state != 'error'
		};
	}

loop:
	while (true) {
		switch (state) {
		case 'PS_START':
			switch (p < s.length ? s.charAt(p) : 'END') {
			case ':':
				++p;
				break;

			case '*':
				extensions.push({ext: null, seq: null});
				++p;
				const funkey = getFunkeyString(true);
				if (funkey.ok) {
					extensions[extensions.length - 1].ext = funkey.buf;
					state = 'PS_4';
				}
				else {
					state = 'PS_FAIL';
				}
				break;
			case 'END':
				state = 'PS_DONE';
				break loop;

			default:
				label = s.charAt(p++);
				state = 'PS_2';
				break;
			}
			break;

		case 'PS_2':
			if (p < s.length) {
				label += s.charAt(p++);
				state = 'PS_3';
			}
			else {
				state = 'PS_FAIL';
			}
			break;

		case 'PS_3':
			state = 'PS_FAIL';
			if (s.charAt(p++) == '=') {
				if (label in pref.colorMap.knownType) {
					const funkey = getFunkeyString(false);
					if (funkey.ok) {
						pref.colorMap.knownType[label] = funkey.buf;
						state = 'PS_START';
					}
					else {
						state = 'PS_FAIL';
					}
				}
				if (state == 'PS_FAIL') {
					error(0, null,
						`unrecognized prefix: %s`,
						quoteUtils.quote(label));
				}
			}
			break;

		case 'PS_4':
			if (s.charAt(p++) == '=') {
				const funkey = getFunkeyString(false);
				if (funkey.ok) {
					const e = extensions[extensions.length - 1];
					e.seq = funkey.buf;

					const key = e.ext.toLowerCase();
					if (!(key in stats)) {
						stats[key] = {
							extensions: new Set,
							sequence: new Set
						};
					}
					stats[key].extensions.add(e.ext);
					stats[key].sequence.add(e.seq);

					state = 'PS_START';
				}
				else {
					state = 'PS_FAIL';
				}
			}
			else {
				state = 'PS_FAIL';
			}

		case 'PS_FAIL':
			break;

		default:
			throw new Error(`invalid state: ${state} at parseLsColors`);
		}
	}

	if (state == 'PS_FAIL') {
		error(0, null, `unparsable value for LS_COLORS environment variable`);
		pref.printWithColor = false;
	}
	else {
		for (let i = 0; i < extensions.length; i++) {
			const e = extensions[i];
			const key = e.ext.toLowerCase();
			if (!(key in stats)) continue;
			if (stats[key].extensions.size > 1
			 && stats[key].sequence.size == 1) {
				if (!stats[key].processed) {
					e.ext = e.ext.toLowerCase();
					e.caseIgnore = true;
					stats[key].processed = true;
				}
				else {
					extensions.splice(i--, 1);
				}
			}
		}
	}

	if (pref.colorMap.knownType['ln'] == 'target') {
		pref.colorSymlinkAsReferent = true;
	}
}

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
