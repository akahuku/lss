import child_process from 'node:child_process';
import assert from 'node:assert/strict';
import {
	strftime, canonicalizeLocalMachineLocale, getLangInfo,
	getDefaultLocale, getDefaultTimezone
} from '../src/time.js';

/*
 * Known differences between strftime(Intl) and coreutils date:
 *
 * [en_US locale]
 *        strftime(Intl)    coreutils date
 *   %EC       "AD"              "20"
 *   %Z        "GMT+9"           "JST"
 */
const NAME_SPECS = 'a,A,b,B,C,EC,h,p,P,z,Z';

/*
 * Known differences between strftime(Intl) and coreutils date:
 *
 * [en_US locale]
 *        strftime(Intl)    coreutils date
 *   %EY      "2024"           "2024 AD"
 *
 * [ja_JP locale]
 *        strftime(Intl)    coreutils date
 *   %b       "3月"           " 3月"
 *   %h       "3月"           " 3月"
 *   %EY      "令和6年"       "令和06年"
 */
const NUMERIC_SPECS = 'd,D,F,e,G,g,H,I,j,k,l,m,M,R,s,S,T,u,U,V,w,W,y,Y,Ey,EY';
function getNativeDate (locale, timezone, format, date) {
	let result;
	let command = [];
	if (locale) {
		command.push(`LANG=${locale}`);
	}
	if (timezone) {
		command.push(`TZ=${timezone}`);
	}
	command.push(`date --date='@${Math.trunc(date.getTime() / 1000)}' "+${format}"`);
	try {
		result = child_process.execSync(command.join(' ')).toString();
	}
	catch (err) {
		console.dir(err);
		result = '';
	}
	return result.replace(/\s+$/, '');
}

const localeCodeMap = {
	'en-US': 'en_US',
	'ja-JP': 'ja_JP.utf8'
};

function testSpecs (specs, locale, timezone) {
	const now = new Date;
	const header = `%{locale:${locale}}%{timezone:${timezone}}`;
	const expects = getNativeDate(
		localeCodeMap[locale], timezone,
		specs.split(',').map(a => `%${a}`).join('%n'),
		now).split('\n');

	specs.split(',').forEach((spec, index) => {
		it(`spec %${spec}`, () => {
			const result = strftime(`${header}%${spec}`, now);
			assert.equal(result, expects[index]);
		});
	});
}

describe('getDefaultLocale', () => {
	it('empty arguments', () => {
		const result = getDefaultLocale();
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('env', () => {
		const result = getDefaultLocale('env');
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('Intl', () => {
		const result = getDefaultLocale('Intl');
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('invalid argument', () => {
		const result = getDefaultLocale('invalid argument');
		assert.ok(result == undefined);
	});
});

describe('getDefaultTimezone', () => {
	it('empty arguments', () => {
		const result = getDefaultTimezone();
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('env', () => {
		const oldTZ = process.env['TZ'];
		process.env['TZ'] = 'Asia/Tokyo';
		try {
			const result = getDefaultTimezone('env');
			assert.ok(typeof result == 'string');
			assert.equal(result, 'Asia/Tokyo');
		}
		finally {
			if (oldTZ) {
				process.env['TZ'] = oldTZ;
			}
			else {
				delete process.env['TZ'];
			}
		}
	});

	it('Intl', () => {
		const result = getDefaultTimezone('Intl');
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('timedatectl', () => {
		const result = getDefaultTimezone('timedatectl');
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('etc', () => {
		const result = getDefaultTimezone('etc');
		assert.ok(typeof result == 'string');
		assert.ok(result.length > 0);
	});

	it('invalid argument', () => {
		const result = getDefaultTimezone('invalid argument');
		assert.ok(result == undefined);
	});
});

describe('canonicalizeLocalMachineLocale', () => {
	it('en-us', () => {
		const result = canonicalizeLocalMachineLocale('en-us');
		assert.equal(result, 'en_US.utf8');
	});
});

describe('getLangInfo', () => {
	it('era_d_t_fmt@ja-JP', () => {
		const result = getLangInfo('ja-jp', 'era_d_t_fmt');
		assert.ok(result.length > 0);
	});
});

describe('japanese era', () => {
	const now = new Date;
	const header = '%{locale:ja-JP}%{timezone:Asia/Tokyo}';

	it('%Ec, Standard Date and Time string including Reiwa era', () => {
		const result = strftime(`${header}%Ec`, now);
		assert.match(result, /令和\d+年\d+月\d+日\s+\d+時\d+分\d+秒/);
	});
	it('%EC, Name of Reiwa era', () => {
		const result = strftime(`${header}%EC`, now);
		assert.equal(result, '令和');
	});
	it('%Ey, Year of Reiwa era', () => {
		const result = strftime(`${header}%Ey`, now);
		assert.match(result, /^0*[0-9]+$/);
	});
	it('%EY, Reiwa era name and year', () => {
		const result = strftime(`${header}%EY`, now);
		assert.match(result, /^令和0*[0-9]+年$/);
	});
});

describe('name specs@en-US', () => {
	testSpecs(NAME_SPECS, 'en-US', 'Asia/Tokyo');
});

describe('numeric specs@en-US', () => {
	testSpecs(NUMERIC_SPECS, 'en-US', 'Asia/Tokyo');
});

describe('name specs@ja-JP', () => {
	testSpecs(NAME_SPECS, 'ja-JP', 'Asia/Tokyo');
});

describe('numeric specs@ja-JP', () => {
	testSpecs(NUMERIC_SPECS, 'ja-JP', 'Asia/Tokyo');
});
