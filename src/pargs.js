/**
 * pargs.js -- command line arguments parser
 *
 * @author akahuku@gmail.com
 */

import {Buffer} from 'node:buffer';

const ERROR_MESSAGES = {
	'0': 'Unknown switch',
	'1': 'Missing required parameter',
	'2': 'Unnecessary parameter given',
	'3': 'Parameter required switch must be the last of packed'
};

class ParseArgError extends Error {
	constructor (message, code, switchString, param) {
		super(message);
		this.name = 'ParseArgError';
		this.parseArgErrorCode = code;
		this.switchString = switchString;
		this.param = param;
	}
}

function createParseArgError (code, switchString, param) {
	return new ParseArgError(
		ERROR_MESSAGES[code],
		code, switchString, param
	);
}

function initArgs (args) {
	if (!Array.isArray(args)) {
		args = [args];
	}

	return args.reduce((result, arg) => {
		if (Buffer.isBuffer(arg)) {
			return result.concat(splitFromBuffer(arg));
		}
		else if (typeof arg == 'string') {
			return result.concat(splitFromString(arg));
		}
		else {
			throw new Error('invalid arg');
		}
	}, []);
}

function initSwitches (switchDescriptions) {
	const switchDefs = [];
	const switchMap = {};

	if (!Array.isArray(switchDescriptions)) {
		throw new Error('Switch descriptions must be an array');
	}

	for (const switchDescription of switchDescriptions) {
		const data = {
			multipleValue: false,
			minimumParameterCount: -1
		};
		let desc = switchDescription;

		/*
		 * switch-desc := <name> <param-def>
		 * name := <short>
		 *         : <long>
		 *         <short> : <long>
		 * short := string
		 * long := string
		 * param-def := = <multiple-desc>? <count>
		 * multiple-desc := []
		 * count := ?
		 *          #
		 */

		desc = desc.replace(
			/(\[\])?=([?#])\s*$/,
			($0, multipleIndicator, countIndicator) => {
				if (multipleIndicator == '[]') {
					data.multipleValue = true;
				}
				if (countIndicator == '?') {
					data.minimumParameterCount = 0;
				}
				else if (countIndicator == '#') {
					data.minimumParameterCount = 1;
				}

				return '';
			}
		);

		desc = desc.replace(/^\s+|\s+$/g, '').split(/\s*:\s*/, 2);
		switch (desc.length) {
		case 1:
			if (desc[0].length == 0) {
				throw new Error(`invalid switch description: "${switchDescription}"`);
			}
			else {
				data[desc[0].length == 1 ? 'short' : 'long'] = desc[0];
			}
			switchMap[desc[0]] = switchDefs.length;
			break;

		case 2:
			if (desc[0] == '' && desc[1] == '') {
				throw new Error(`invalid switch description: "${switchDescription}"`);
			}
			if (desc[0] != '') {
				switchMap[data.short = desc[0]] = switchDefs.length;
			}
			if (desc[1] != '') {
				switchMap[data.long = desc[1]] = switchDefs.length;
			}
			break;
		}

		switchDefs.push(data);
	}

	return {switchDefs, switchMap};
}

export function splitFromBuffer (buffer) {
	const result = [];
	const q = "'".charCodeAt(0);
	const backslash = '\\'.charCodeAt(0);

	for (let i = 0, goal = buffer.length; i < goal; i++) {
		if (buffer[i] != q) continue;

		const chunks = [];
		let from = ++i;

		for (; i < goal; i++) {
			if (buffer[i] == backslash) {
				chunks.push(buffer.subarray(from, i));
				if (++i >= goal) {
					throw new Error('incomplete backslash');
				}
				from = i;
			}
			else if (buffer[i] == q) {
				chunks.push(buffer.subarray(from, i++));
				result.push(Buffer.concat(chunks));
				break;
			}
		}
	}

	return result;
}

export function splitFromString (str) {
	const result = [];

	(str.match(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|-[^=]+='(?:\\.|[^'])'|-[^=]+="(?:\\.|[^"])"|\S+/g) ?? []).forEach(a => {
		if (/^(-[^=]+=)'(\\.|[^'])'$/.test(a)) {
			result.push(`${RegExp.$1}=${RegExp.$2}`);
		}
		else if (/^(-[^=]+=)"((?:\\.|[^"])*)"$/.test(a)) {
			result.push(Buffer.from(`${RegExp.$1}${RegExp.$2}`));
		}
		else if (/^'(.*)'$/.test(a)) {
			result.push(Buffer.from(RegExp.$1));
		}
		else if (/^"(.*)"$/.test(a)) {
			result.push(Buffer.from(RegExp.$1));
		}
		else {
			result.push(Buffer.from(a));
		}
	});

	return result;
}

export function pargs (arg, switchDescriptions, options = {}) {
	function emit (eventName, ...params) {
		if (typeof options[eventName] == 'function') {
			return options[eventName](...params);
		}
	}

	function getSwitch (leader, name) {
		let inverted = false;
		let name2 = name;

		if (options.allowInvert !== false && /^no-/.test(name)) {
			inverted = true;
			name2 = name2.substring(3);
		}

		if (name2 in switchMap) {
			const sw = switchDefs[switchMap[name2]];
			// OK: boolean switch, not inverted
			// OK: boolean switch, inverted
			// OK: string switch, not inverted
			// NG: string switch, inverted
			if (!(sw.minimumParameterCount >= 0 && inverted)) {
				return sw;
			}
		}

		// Unknown switch
		emit('onUnknownSwitch', `${leader}${name}`);
		throw createParseArgError(0, `${leader}${name}`);
	}

	function storeSwitch (index, leader, name, params, overrideSwitch) {
		const startIndex = index;
		const sw = overrideSwitch ?? getSwitch(leader, name);
		let param, paramBuffer;

		if (params != undefined) {
			param = params.string;
			paramBuffer = params.buffer;

			if (sw.minimumParameterCount < 0) {
				// Parameter was given to switch that did not need it.
				//
				//   NG: app --help=foo
				//
				// Note: Here we assume that the characters used in
				// the switch names are latin-1 or 1-byte code.
				if (name.length < args[index].length) {
					throw createParseArgError(2, name);
				}
			}
		}
		else {
			// No parameter was given to switch that needed it.
			//
			// case 1: Switch with required parameter
			//         (minimumParameterCount > 0)
			//   NG: app --comment
			//   NG: app --comment --other-switch
			//   NG: app --comment --
			//   OK: app --comment 'hello!'
			//
			// case 2: Switch with optional parameter
			//         (minimumParameterCount == 0)
			//   OK: app --comment
			//   OK: app --comment --other-switch
			//   OK: app --comment --
			//    ?: app --comment 'hello!'
			if (sw.minimumParameterCount < 0) {
				param = !/^no-/.test(name);
			}
			else if (sw.minimumParameterCount > 0) {
				if (index + 1 < args.length
				 && !args[index + 1].toString().startsWith('-')) {
					paramBuffer = args[++index];
					param = paramBuffer.toString();
				}
				else {
					// case 1, NG pattern
					throw createParseArgError(1, name);
				}
			}
			else if (sw.minimumParameterCount == 0) {
				if (index + 1 < args.length
				 && !args[index + 1].toString().startsWith('-')) {
					// case 2, ambiguous pattern
					paramBuffer = args[++index];
					param = paramBuffer.toString();
					const queryResult = emit(
						'onQueryAmbiguousParam',
						sw, param, paramBuffer);

					if (queryResult === false) {
						paramBuffer = Buffer.from('');
						param = '';
						--index;
					}
				}
				else {
					paramBuffer = Buffer.from('');
					param = '';
				}
			}
		}

		const storeName = sw.long ?? sw.short;
		if (sw.minimumParameterCount >= 0) {
			if (sw.multipleValue) {
				if (!Array.isArray(switches[storeName])) {
					switches[storeName] = [];
				}
				const storeItem = {
					name: `${leader}${name}`,
					string: param,
					buffer: paramBuffer
				};
				switches[storeName].push(storeItem);
				emit('onSwitch', storeName, storeItem);
			}
			else {
				const storeItem = {
					name: `${leader}${name}`,
					string: param,
					buffer: paramBuffer
				};
				switches[storeName] = storeItem;
				emit('onSwitch', storeName, storeItem);
			}
		}
		else {
			const storeItem = {
				name: `${leader}${name}`,
				value: param
			};
			switches[storeName] = storeItem;
			emit('onSwitch', storeName, storeItem);
		}

		return index - startIndex;
	}

	function extractShortSwitches (index, leader, name, params) {
		const startIndex = index;
		for (let i = 0, goal = name.length; i < goal; i++) {
			const sw = getSwitch(leader, name.charAt(i));
			if (i == goal - 1) {
				index += storeSwitch(index, leader, name, params, sw);
			}
			else {
				if (sw.minimumParameterCount >= 0) {
					throw createParseArgError(3, name);
				}

				index += storeSwitch(index, leader, name, undefined, sw);
			}
		}
		return index - startIndex;
	}

	function operand (index, string, buffer) {
		operands.push({string, buffer});
	}

	const args = initArgs(arg);
	const {switchDefs, switchMap} = initSwitches(switchDescriptions);
	const switches = {};
	const operands = [];
	let foundSentinel = false;

	try {
		for (let i = 0, goal = args.length; i < goal; i++) {
			const bufarg = args[i];
			const strarg = bufarg.toString();

			if (strarg == '--' && !foundSentinel) {
				foundSentinel = true;
			}
			else if (!foundSentinel && /^(--)([^=]+)=([\s\S]*)$/.test(strarg)) {
				const leader = RegExp.$1;
				const name = RegExp.$2;
				const params = {
					string: RegExp.$3,
					// 3 means: ('--' + '=').length
					buffer: bufarg.subarray(name.length + 3)
				};
				i += storeSwitch(i, leader, name, params);
			}
			else if (!foundSentinel && /^(--)(.+)$/.test(strarg)) {
				const leader = RegExp.$1;
				const name = RegExp.$2;
				i += storeSwitch(i, leader, name);
			}
			else if (!foundSentinel && /^(-)([^-][^=]*)=([\s\S]*)$/.test(strarg)) {
				const leader = RegExp.$1;
				const name = RegExp.$2;
				const params = {
					string: RegExp.$3,
					// 2 means: ('-' + '=').length
					buffer: bufarg.subarray(name.length + 2)
				};
				i += extractShortSwitches(i, leader, name, params);
			}
			else if (!foundSentinel && /^(-)([^-].*)$/.test(strarg)) {
				const leader = RegExp.$1;
				const name = RegExp.$2;
				i += extractShortSwitches(i, leader, name);
			}
			else {
				operand(i, strarg, bufarg);
			}
		}
	}
	catch (error) {
		if (error instanceof ParseArgError) {
			return {error};
		}
		else {
			throw error;
		}
	}

	return {switches, operands};
}

Object.defineProperties(pargs, {
	ParseArgError: {
		get: () => ParseArgError
	},
	ERROR_MESSAGES: {
		get: () => ERROR_MESSAGES
	}
});

/*
if (process.argv.length >= 3) {
	const args = Buffer.from(
		process.argv[2]
			.replace(/\s+$/, '')
			.split(' ')
			.map(a => parseInt(a, 16)));
	const switches = [
		'h:help',
		'v:verbose=?',
		'level=#',
		'ignore[]=#',
	];
	const result = pargs(args, switches);
	console.dir(result);
}
*/

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
