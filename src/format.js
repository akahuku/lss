/**
 * format.js -- partial implementation of printf in javascript
 *
 * @author akahuku@gmail.com
 */

import Unistring from '@akahuku/unistring';

const MIXING_ERROR = 'Mixing "*" and "*n$" is not allowed.';
const NOT_IMPLEMENTED_ERROR = 'Not implemented.';
const EXTRA_DATA_ERROR = 'Extra data is appended to the conversion specifier "%".'

const options = {awidth: 2};

function alignString (flags, minWidth, maxWidth, value) {
	if (typeof value != 'string') {
		throw new Error(`${value} is not a string, ${typeof value}.`);
	}

	let result = value.toString();
	let cols = Unistring.getColumnsFor(result, options);
	if (maxWidth && cols > maxWidth) {
		result = Unistring.divideByColumns(result, maxWidth, options)[0];
		cols = Unistring.getColumnsFor(result, options);
	}
	if (minWidth && cols < minWidth) {
		const pad = ' '.repeat(minWidth - cols);
		if (flags?.includes('-')) {
			result = result + pad;
		}
		else {
			result = pad + result;
		}
	}
	return result;
}

function alignNumber (flags, minWidth, precision, value) {
	let value2, isPlus = null;
	if (typeof value != 'number') {
		throw new Error(`${value} is not a number, ${typeof value}.`);
	}
	if (!Number.isFinite(value) && !Number.isNaN(value)) {
		value2 = `(${value})`;
	}
	else if (Number.isNaN(value)) {
		value2 = '(NaN)';
	}
	else if (value === 0 && precision === 0) {
		value2 = '';
		isPlus = false;
	}
	else {
		value2 = value.toString();
		isPlus = value >= 0;
	}

	let cols = Unistring.getColumnsFor(value2, options);
	let flags2 = flags ?? '';
	let fieldPadChar = ' ';
	let alignRight = true;
	if (flags2.includes('0') && (!flags2.includes('-') && !precision)) {
		fieldPadChar = '0';
	}
	if (flags2.includes('-')) {
		alignRight = false;
		fieldPadChar = ' ';
	}
	if (flags2.includes('+')) {
		if (isPlus === true) {
			value2 = '+' + value2;
			cols++;
		}
	}
	else if (flags2.includes(' ')) {
		if (isPlus === true) {
			value2 = ' ' + value2;
			cols++;
		}
	}
	if (precision && cols < precision) {
		const pad = '0'.repeat(precision - cols);
		value2 = pad + value2;
		cols = precision;
	}
	if (minWidth && cols < minWidth) {
		const pad = fieldPadChar.repeat(minWidth - cols);
		if (alignRight) {
			value2 = pad + value2;
		}
		else {
			value2 = value2 + pad;
		}
	}
	return value2;
}

export function printf (...args) {
	const format = args[0];
	let index = 1;
	let indexSpecified = false;
	return format.replace(
		/*
		 * directive := % header? flags min-width? precision? length? specifier
		 *
		 * header := int '$'
		 *
		 * flags := ('#' | '0' | '-' | ' ' | '+')*
		 *
		 * min-width := int
		 *          '*'
		 *          '*' int '$'
		 *
		 * precision := '.' precision-body?
		 * precision-body := int
		 *                   '*'
		 *                   '*' int '$'
		 *
		 * length := 'hh' | 'h' | 'l' | 'll' | 'j' | 'z' | 't' | 'L'
		 *
		 * specifier := 'd' | 's' | '%'
		 *
		 * int := [1-9][0-9]*
		 */
		/%([1-9][0-9]*\$)?([-+#0 ]+)?([1-9][0-9]*|\*(?:[1-9][0-9]*\$)?)?(\.(?:[1-9][0-9]*|\*(?:[1-9][0-9]*\$)?)?)?(?:hh|ll|[hljztL])?([diouxXfFeEgGaAcspnCS%])/g,
		(...matches) => {
			let [, aheader, flags, awidth, aprecision, specifier] = matches;

			if (specifier == '%') {
				if (aheader != undefined
				 || flags != undefined
				 || awidth != undefined
				 || aprecision != undefined) {
					throw new Error(EXTRA_DATA_ERROR);
				}
				return '%';
			}

			let width, precision, n, value;
			if (aheader != undefined) {
				if (!Number.isNaN(n = parseInt(aheader, 10))) {
					value = args[n];
					indexSpecified = true;
				}
			}
			if (awidth != undefined) {
				if (awidth.charAt(0) != '*') {
					width = parseInt(awidth, 10);
				}
				else {
					if (!Number.isNaN(n = parseInt(awidth.substring(1), 10))) {
						width = args[n];
						indexSpecified = true;
					}
					else {
						if (indexSpecified) throw new Error(MIXING_ERROR);
						width = args[index++];
					}
				}
				if (!Number.isInteger(width)) {
					throw new Error(`width ${width} is not a integer.`);
				}
				if (width < 0) {
					flags = (flags ?? '') + '-';
					width = -width;
				}
			}
			if (aprecision != undefined) {
				if (aprecision == '.') {
					precision = 0;
				}
				else if (aprecision.charAt(1) != '*') {
					precision = parseInt(aprecision.substring(1), 10);
				}
				else {
					if (!Number.isNaN(n = parseInt(aprecision.substring(2), 10))) {
						precision = args[n];
						indexSpecified = true;
					}
					else {
						if (indexSpecified) throw new Error(MIXING_ERROR);
						precision = args[index++];
					}
				}
				if (!Number.isInteger(precision)) {
					throw new Error(`precision ${precision} is not a integer.`);
				}
				if (precision < 0) {
					precision = undefined;
				}
			}
			if (value == undefined) {
				if (indexSpecified) throw new Error(MIXING_ERROR);
				value = args[index++];
			}

			switch (specifier) {
			case 's':
				return alignString(flags, width, precision, value);
			case 'd': case 'i':
				return alignNumber(flags, width, precision, value);
			default:
				throw new Error(NOT_IMPLEMENTED_ERROR);
			}
		}
	);
}

Object.defineProperties(printf, {
	awidth: {
		get: () => {
			return options.awidth;
		},
		set: value => {
			if (value == 1 || value == 2) {
				options.awidth = value;
			}
		}
	}
});
