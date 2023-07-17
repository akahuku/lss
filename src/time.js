/**
 * time.js -- implementation of strftime in javascript
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';
import Unistring from '@akahuku/unistring';

const AVAILABLE_CALENDARS = {
	'buddhist': 1,
	'chinese': 1,
	'coptic': 1,
	'ethiopia': 1,
	'ethiopic': 1,
	//'gregory': 1,
	'hebrew': 1,
	'indian': 1,
	'islamic': 1,
	'islamic-umalqura': 1,
	'islamic-tbla': 1,
	'islamic-civil': 1,
	'islamic-rgsa': 1,
	'iso8601': 1,
	'japanese': 1,
	'persian': 1,
	'roc': 1
};

const WEEKDAYS = {
	'Sunday': [0, 7],
	'Monday': [1, 1],
	'Tuesday': [2, 2],
	'Wednesday': [3, 3],
	'Thursday': [4, 4],
	'Friday': [5, 5],
	'Saturday': [6, 6]
};

const FORMAT_MAP = {
	generic: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			era: 'short',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			weekday: 'long',
			hour12: false,
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
			timeZoneName: 'longOffset',
			timezone: t});
	},
	a: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			weekday: 'short',
			timezone: t});
	},
	A: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			weekday: 'long',
			timezone: t});
	},
	b: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			month: 'short',
			timezone: t});
	},
	B: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			month: 'long',
			timezone: t});
	},
	EC: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			era: 'short',
			year: 'numeric',
			calendar: getLocalCalendarName(l),
			timezone: t});
	},
	p: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			hour:'numeric',
			hour12: true,
			timezone: t});
	},
	Z: (l, t) => {
		return new Intl.DateTimeFormat(l, {
			timeZoneName:'short',
			timezone: t});
	},
};

const TRANSLATORS = {
	'%': () => '%',
	n: () => '\n',
	t: () => '\t',

	/*
	 * name specs
	 */

	// short name of day of week
	a: (d,l,t,f,w,g) => {
		return align(format(d, l, t, 'a'), f, w);
	},
	// full name of day of week
	A: (d,l,t,f,w,g) => {
		return align(format(d, l, t, 'A'), f, w);
	},
	// short month name
	b: (d,l,t,f,w,g) => {
		return align(format(d, l, t, 'b'), f, w);
	},
	// long month name
	B: (d,l,t,f,w,g) => {
		return align(format(d, l, t, 'B'), f, w);
	},
	// century number
	C: (d,l,t,f,w,g) => {
		return align(Math.trunc(g.year / 100), f, w || 2);
	},
	// local era name
	EC: (d,l,t,f,w,g) => {
		const parts = getParts(d, l, t, 'EC', ['era']);
		return align(parts.length ? parts[0].value : '', f, w);
	},
	// equiv to %b
	h: (d,l,t,f,w,g) => {
		return align(format(d, l, t, 'b'), f, w);
	},
	// AM/PM
	p: (d,l,t,f,w,g) => {
		const parts = getParts(d, l, t, 'p', ['dayPeriod']);
		const dayPeriod = parts.length ?
			parts[0].value :
			'';
		return align(dayPeriod, f, w);
	},
	// am/pm
	P: (d,l,t,f,w,g) => {
		const parts = getParts(d, l, t, 'p', ['dayPeriod']);
		const dayPeriod = parts.length ?
			parts[0].value.toLocaleLowerCase() :
			'';
		return align(dayPeriod , f, w);
	},
	// timezone (numeric)
	z: (d,l,t,f,w,g) => {
		return align(g.timeZoneName.replace(/[^-+0-9]/g, ''), f, w);
	},
	// timezone name or abbreviation
	Z: (d,l,t,f,w,g) => {
		const parts = getParts(d, l, t, 'Z', ['timeZoneName']);
		return align(parts.length ? parts[0].value : '', f, w);
	},

	/*
	 * numeric specs
	 */

	// day of month, 2digits
	d: (d,l,t,f,w,g) => {
		return align(g.day, f, w || 2);
	},
	// shortcut of '%m/%d/%y'
	D: (d,l,t,f,w,g) => {
		const month = align(g.month, '', 2);
		const day = align(g.day, '', 2);
		const year = align(g.year % 100, '', 2);
		return align(`${month}/${day}/${year}`, f, w);
	},
	// shortcut of '%Y-%m-%d'
	F: (d,l,t,f,w,g) => {
		const year = align(g.year, '', 0);
		const month = align(g.month, '', 2);
		const day = align(g.day, '', 2);
		return align(`${year}-${month}-${day}`, f, w);
	},
	// day of month, 2digits, with blank character
	e: (d,l,t,f,w,g) => {
		return align(g.day, f, w || 2)
			.replace(/^0+/, $0 => ' '.repeat($0.length));
	},
	// ISO 8601 week-based year, 4digits
	G: (d,l,t,f,w,g) => {
		return align(getYearISO(d, g, t), f, w || 4);
	},
	// ISO 8601 week-based year, 2digits
	g: (d,l,t,f,w,g) => {
		return align(getYearISO(d, g, t) % 100, f, w || 2);
	},
	// hour using 24-hour clock, 2digits
	H: (d,l,t,f,w,g) => {
		return align(g.hour, f, w || 2);
	},
	// hour using 12-hour clock, 2digits
	I: (d,l,t,f,w,g) => {
		return align(g.hour % 12, f, w || 2);
	},
	// day of year, 3digits
	j: (d,l,t,f,w,g) => {
		return align(getTotalDays(d), f, w || 3);
	},
	// hour using 24-hour clock, 2digits, with blank character
	k: (d,l,t,f,w,g) => {
		return align(g.hour, f, w || 2)
			.replace(/^0+/, $0 => ' '.repeat($0.length));
	},
	// hour using 12-hour clock, 2digits, with blank character
	l: (d,l,t,f,w,g) => {
		return align(g.hour % 12, f, w || 2)
			.replace(/^0+/, $0 => ' '.repeat($0.length));
	},
	// month, 2digits
	m: (d,l,t,f,w,g) => {
		return align(g.month, f, w || 2);
	},
	// minute, 2digits
	M: (d,l,t,f,w,g) => {
		return align(g.minute, f, w || 2);
	},
	// quarter index (Jan-Mar is 1, Apr-Jun is 2...)
	q: (d,l,t,f,w,g) => {
		const q = ((g.month * 11) >> 5) + 1;
		return align(q, f, w || 1);
	},
	// shortcut of '%H:%M'
	R: (d,l,t,f,w,g) => {
		const hour = align(g.hour, '', 2);
		const minute = align(g.minute, '', 2);
		return align(`${hour}:${minute}`, f, w);
	},
	// seconds from epoch
	s: (d,l,t,f,w,g) => {
		const totalSeconds = Math.trunc(d.getTime() / 1000);
		return align(totalSeconds, f, w);
	},
	// second, 2digits
	S: (d,l,t,f,w,g) => {
		return align(g.second, f, w || 2);
	},
	// shortcut of '%H:%M:%S'
	T: (d,l,t,f,w,g) => {
		const hour = align(g.hour, '', 2);
		const minute = align(g.minute, '', 2);
		const second = align(g.second, '', 2);
		return align(`${hour}:${minute}:${second}`, f, w);
	},
	// day of week (from monday = 1)
	u: (d,l,t,f,w,g) => {
		const weekday = WEEKDAYS[g.weekday][1];
		return align(weekday, f, w || 0);
	},
	// week number of year (from sunday = 01)
	U: (d,l,t,f,w,g) => {
		const weeks = getTotalWeeksFromSunday(d, g);
		return align(weeks, f, w || 2);
	},
	// ISO 8601 week number of year
	V: (d,l,t,f,w,g) => {
		const weeks = getTotalWeeksISO(d, g, t);
		return align(weeks, f, w || 2);
	},
	// day of week (from sunday = 0)
	w: (d,l,t,f,w,g) => {
		const weekday = WEEKDAYS[g.weekday][0];
		return align(weekday, f, w);
	},
	// week number of year (from monday = 01)
	W: (d,l,t,f,w,g) => {
		const weeks = getTotalWeeksFromMonday(d, g);
		return align(weeks, f, w || 2);
	},
	// year, 2digits
	y: (d,l,t,f,w,g) => {
		return align(g.year % 100, f, w || 2);
	},
	// year
	Y: (d,l,t,f,w,g) => {
		return align(g.year, f, w);
	},
	// local era, 2digits
	Ey: (d,l,t,f,w,g) => {
		const parts = getParts(d, l, t, 'EC', ['year']);
		return align(parts.length ? parts[0].value % 100 : '', f, w || 2);
	},
	// local era
	EY: (d,l,t,f,w,g) => {
		return align(format(d, l, t, 'EC'), f, w);
	},

	/*
	 * aliases
	 */

	c: (d,l,t,f,w,g) => {
		return align(applyAlias('d_t_fmt', d, l, t), f, w);
	},
	Ec: (d,l,t,f,w,g) => {
		return align(applyAlias('era_d_t_fmt', d, l, t), f, w);
	},
	r: (d,l,t,f,w,g) => {
		return align(applyAlias('t_fmt_ampm', d, l, t), f, w);
	},
	x: (d,l,t,f,w,g) => {
		return align(applyAlias('d_fmt', d, l, t), f, w);
	},
	Ex: (d,l,t,f,w,g) => {
		return align(applyAlias('era_d_fmt', d, l, t), f, w);
	},
	X: (d,l,t,f,w,g) => {
		return align(applyAlias('t_fmt', d, l, t), f, w);
	},
	EX: (d,l,t,f,w,g) => {
		return align(applyAlias('era_t_fmt', d, l, t), f, w);
	},
};

let availableLocales;
let defaultLocale;
let defaultTimezone;
let awidth = 2;
const langInfoPool = {};
const formatterPool = {};

function execSync (command) {
	return child_process.execSync(`${command} 2>/dev/null`)
		.toString()
		.replace(/\s+$/, '');
}

function getLocalCalendarName (l) {
	const locale = new Intl.Locale(l);
	const calendars = locale.calendars ?? locale.getCalendars();
	for (const cal of calendars) {
		if (cal in AVAILABLE_CALENDARS) {
			return cal;
		}
	}
	return undefined;
}

function getTotalDays (d) {
	return Math.ceil((d.getTime() - (new Date(d.getFullYear(), 0, 1)).getTime()) / (24 * 60 * 60 * 1000));
}

function getTotalWeeksFromMonday (d, g) {
	const days = getTotalDays(d);
	const weekday = WEEKDAYS[g.weekday][1];
	const weeks = Math.trunc((days + 7 - weekday) / 7);
	return weeks;
}

function getTotalWeeksFromSunday (d, g) {
	const days = getTotalDays(d);
	const weekday = WEEKDAYS[g.weekday][0];
	const weeks = Math.trunc((days + 6 - weekday) / 7);
	return weeks;
}

function getTotalWeeksISO (d, g, t) {
	const weeks = getTotalWeeksFromMonday(d, g);
	const dow1_1 = (new Date(`${d.getFullYear()}/1/1`)).getDay();
	let idow = weeks + (dow1_1 > 4 || dow1_1 <= 1 ? 0 : 1);
	if (idow == 53
	 && (new Date(`${d.getFullYear()}/12/31`)).getDay() < 4) {
		idow = 1;
	}
	else if (idow === 0) {
		const last = new Date(`${d.getFullYear() - 1}/12/31`);
		idow = getTotalWeeksISO(last, getGenericParts(last, t));
	}
	return idow;
}

function getYearISO (d, g, t) {
	let year = g.year;
	const vweeks = getTotalWeeksISO(d, g, t);
	const wweeks = getTotalWeeksFromMonday(d, g);
	if (wweeks > vweeks) {
		year++;
	}
	else if (wweeks == 0 && vweeks >= 52) {
		year--;
	}
	return year;
}

function applyAlias(name, d, l, t) {
	const alias = getLangInfo(l, name);
	if (!alias) return '';

	return strftime(`%{locale:${l}}%{timezone:${t}}${alias}`, d);
}

export function getDefaultTimezone (method) {
	if (defaultTimezone !== undefined) {
		return defaultTimezone;
	}

	// via TZ environment variable, only Olson format
	if (!method || method === 'env') {
		if (/([A-Za-z0-9\-+_]+\/[A-Za-z0-9\-+_]+)/.test(process.env['TZ'])) {
			return defaultTimezone = RegExp.$1;
		}
	}

	// via Intl
	if (!method || method === 'Intl') {
		let result;
		try {
			result = new Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (result != undefined) {
				return defaultTimezone = result;
			}
		}
		catch {;}
	}

	// via systemd
	if (!method || method === 'timedatectl') {
		try {
			return defaultTimezone = execSync(`timedatectl show -p Timezone --value`);
		}
		catch {;}
	}

	// via file under /etc
	if (!method || method === 'etc') {
		try {
			return defaultTimezone = execSync(`cat /etc/timezone`);
		}
		catch {;}
	}

	return undefined;
}

export function getDefaultLocale (method) {
	if (defaultLocale !== undefined) {
		return defaultLocale;
	}

	let locale;

	// environment variables
	if (!method || method === 'env') {
		locale = ['LC_ALL', 'LC_TIME', 'LANG'].reduce((result, current) => {
			if (current in process.env && result == '') {
				return process.env[current];
			}
			else {
				return result;
			}
		}, '');

		if (locale != '') {
			if (locale == 'C' || locale == 'POSIX') {
				locale = 'en-US';
			}
			else {
				locale = locale
					// en_US -> en-US
					.replace(/_/g, '-')
					// en-US.utf8 -> en-US
					.replace(/\..+/, '');
			}

			try {
				return defaultLocale = new Intl.Locale(locale).baseName;
			}
			catch (e) {
			}
		}
	}

	if (!method || method === 'Intl') {
		return defaultLocale = new Intl.DateTimeFormat().resolvedOptions().locale;
	}

	return undefined;
}

export function canonicalizeLocalMachineLocale (alocale) {
	if (!availableLocales) {
		const command = `locale -a`;
		const result = execSync(command);
		availableLocales = {};
		result.split('\n').forEach(locale => {
			availableLocales[locale.toLowerCase().replace(/_/g, '-')] = locale;
		});
	}

	alocale = alocale.toLowerCase();

	if (alocale in availableLocales) {
		return availableLocales[alocale];
	}
	for (const locale in availableLocales) {
		if (locale.includes(alocale)) {
			return availableLocales[locale];
		}
	}

	return null;
}

export function getLangInfo (locale, key) {
	locale = canonicalizeLocalMachineLocale(locale);
	if (!locale) return '';
	if (!(locale in langInfoPool)) {
		langInfoPool[locale] = new Map;
		const command = `LC_TIME=${locale} locale -k LC_TIME`;
		const infoset = execSync(command);
		infoset.split('\n').forEach(info => {
			if (/^([^=]+)=(.+)/.test(info)) {
				let itemKey = RegExp.$1;
				let itemValue = RegExp.$2.replace(/^["']|["']$/g, '');

				// Remove all specs representing aliases to suppress recursion.
				if (/_fmt$/.test(itemKey)) {
					itemValue = itemValue.replace(
						/%[_\-0^#]?\d*[EO]?[crxX]/g, '');
				}

				langInfoPool[locale].set(itemKey, itemValue);
			}
		});
	}

	return langInfoPool[locale][key].get(itemKey);
}

function ensureFormatter (key, locale, timezone) {
	if (!(locale in formatterPool)) {
		formatterPool[locale] = {};
	}
	if (!(timezone in formatterPool[locale])) {
		formatterPool[locale][timezone] = {};
	}
	if (!(key in formatterPool[locale][timezone])) {
		if (typeof FORMAT_MAP[key] != 'function') {
			throw new Error(`Internal Error: format '${key}' is not found in FORMAT_MAP object.`);
		}

		formatterPool[locale][timezone][key] = FORMAT_MAP[key](
			locale, timezone
		);
	}
	return formatterPool[locale][timezone][key];
}

function getGenericParts (datetime, timezone) {
	const key = 'generic';
	const locale = 'en-US';
	const formatter = ensureFormatter(key, locale, timezone);
	const parts = formatter.formatToParts(datetime);
	return parts.reduce((result, item) => {
		if (item.type != 'literal') {
			result[item.type] = /^\d+$/.test(item.value) ?
				item.value - 0 :
				item.value;
		}
		return result;
	}, {});
}

export function format (datetime, locale, timezone, key) {
	return ensureFormatter(key, locale, timezone)
		.format(datetime);
}

export function getParts (datetime, locale, timezone, key, includes, excludes) {
	let parts = ensureFormatter(key, locale, timezone)
		.formatToParts(datetime);

	if (!Array.isArray(includes) && !Array.isArray(excludes)) {
		return parts;
	}

	if (Array.isArray(excludes)) {
		const tmp = [];
		for (const item of parts) {
			if (!excludes.includes(item.type)) {
				tmp.push(item);
			}
		}
		parts = tmp;
	}

	if (Array.isArray(includes)) {
		const tmp = [];
		for (const item of parts) {
			if (includes.includes(item.type)) {
				tmp.push(item);
			}
		}
		parts = tmp;
	}

	return parts;
}

export function align (value, flag, width) {
	if (value === undefined) return null;
	if (value === null) return null;
	if (Number.isNaN(value)) return null;
	if (typeof value == 'number' && !Number.isFinite(value)) return null;

	value = '' + value;
	flag = flag.charAt(0);
	const isNumber = /^\d+$/.test(value);

	if (isNumber && flag == '-') {
		value = value.replace(/^[0 ]+/, '');
	}
	else {
		const columns = Unistring.getColumnsFor(value, {awidth});
		if (columns < width) {
			let pad;
			if (flag == '0') {
				pad = '0';
			}
			else if (flag == '_') {
				pad = ' ';
			}
			else {
				pad = isNumber ? '0' : ' ';
			}

			value = pad.repeat(width - columns) + value;
		}
	}

	return value;
}

export function strftime (format, datetime) {
	if (typeof format != 'string') return null;

	let locale;
	let timezone;

	format = format
		.replace(/%\{locale:\s*([^}]+)\}/g, ($0, alocale) => {
			locale = alocale;
			return '';
		})
		.replace(/%\{timezone:\s*([^}]+)\}/g, ($0, atimezone) => {
			timezone = atimezone;
			return '';
		});

	datetime = datetime ?? new Date;

	if (!locale) {
		locale = getDefaultLocale();
	}
	locale = locale.replace(/_/g, '-');

	if (!timezone) {
		timezone = getDefaultTimezone();
	}

	const genericParts = getGenericParts(datetime, timezone);

	return format.replace(
		/%([_\-0^#]?)(\d*)([EO]?.)/g,
		($0, flag, width, spec) => {
			if (!(spec in TRANSLATORS)) return $0;

			let result;
			try {
				result = TRANSLATORS[spec](
					datetime,
					locale,
					timezone,
					flag,
					parseInt(width, 10) || 0,
					genericParts);
			}
			catch (err) {
				console.dir(err);
				return $0;
			}

			if (result == undefined) return $0;

			if (flag == '^') {
				if (spec != 'P') {
					result = result.toLocaleUpperCase();
				}
			}
			else if (flag == '#') {
				if ('aAbBh'.includes(spec)) {
					result = result.toLocaleUpperCase();
				}
				else if ('pPZ'.includes(spec)) {
					result = result.toLocaleLowerCase();
				}
			}

			return result;
		}
	);
}

Object.defineProperties(strftime, {
	defaultLocale: {
		get: () => {
			return getDefaultLocale();
		},
		set: value => {
			defaultLocale = value;
		}
	},
	defaultTimezone: {
		get: () => {
			return getDefaultTimezone();
		},
		set: value => {
			defaultTimezone = value;
		}
	},
	awidth: {
		get: () => {
			return awidth;
		},
		set: value => {
			if (value === 1 || value === 2) {
				awidth = value;
			}
		}
	}
});
