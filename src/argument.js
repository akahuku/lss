/**
 * argumentUtils -- partial port of gnulib/lib/argmatch.c
 *
 * @author akahuku@gmail.com
 */

import {self, runtime} from './base.js';
import {quoteUtils} from './quoting.js';

export const argumentUtils = (() => {
	function argmatch_die (payload) {
		runtime.event.emit('argmatch_die', payload);
		console.error(payload.message);
		process.exit(1);
	}

	function argmatch_invalid (context, value, problem) {
		value = quoteUtils.quotearg_style('locale', value);
		context = quoteUtils.quote(context);
		return problem.isAmbiguous ?
			`ambiguous argument ${value} for ${context}` :
			`invalid argument ${value} for ${context}`;
	}

	function argmatch_valid (argList) {
		let lastVal = null;
		let result = [];

		result.push('Valid arguments are:');
		for (let i = 0; i < argList.length; i++) {
			const listItem = Array.isArray(argList[i]) ?
				argList[i].map(a => quoteUtils.quote(a)).join(', ') :
				quoteUtils.quote(argList[i]);
			result.push(`  • ${listItem}`);
		}
		return result.join('\n');
	}

	function argmatch (arg, argList) {
		const arglen = arg.length;
		const matches = {};

		for (let i = 0; i < argList.length; i++) {
			const item = Array.isArray(argList[i]) ?
				argList[i] : [argList[i]];

			for (let j = 0; j < item.length; j++) {
				if (item[j].startsWith('#')) {
					continue;
				}
				if (item[j].substring(0, arglen) == arg) {
					if (item[j].length == arglen) {
						return {
							index: i,
							value: item[0].replace(/^#/, '')
						};
					}
					else {
						if (!(i in matches)) {
							matches[i] = [];
						}
						matches[i].push(item[0].replace(/^#/, ''));
					}
				}
			}
		}

		const keys = Object.keys(matches);
		if (keys.length == 1) {
			return {
				index: keys[0] - 0,
				value: matches[keys[0]][0]
			};
		}
		else if (keys.length > 1) {
			return {isAmbiguous: true};
		}
		else {
			return {notMatched: true};
		}
	}

	function argmatch_exact (arg, argList) {
		for (let i = 0; i < argList.length; i++) {
			for (let j = 0; j < argList[i].length; j++) {
				if (argList[i][j] == arg) {
					return {index: i, value: argList[i][0]};
				}
			}
		}
		return {notMatched: true};
	}

	function xargmatch (context, arg, argList, options = {}) {
		const exact = options.exact ?? false;
		const onNotMatch = options.onNotMatch || argmatch_die;
		const res = exact ?
			argmatch_exact(arg, argList) :
			argmatch(arg, argList);

		if (!('index' in res) && typeof onNotMatch == 'function') {
			const invalidMessage = argmatch_invalid(context, arg, res);
			const validList = argmatch_valid(argList);
			const payload = {
				message: `${self}: ${invalidMessage}\n${validList}`,
				invalidMessage, validList,
				context, res, argList
			};
			onNotMatch(payload);
		}

		return res;
	}

	return {
		argmatch,
		argmatchExact: argmatch_exact,
		argmatchInvalid: argmatch_invalid,
		argmatchValid: argmatch_valid,
		xargmatch
	};
})();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
