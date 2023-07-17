import assert from 'node:assert/strict';

import {versionUtils} from '../src/version.js';

/*
 * asserts:
 *   equal(actual, expected[, message])
 */

/* set of well sorted examples */
const examples = [
  '',
  '.',
  '..',
  '.0',
  '.9',
  '.A',
  '.Z',
  '.a~',
  '.a',
  '.b~',
  '.b',
  '.z',
  '.zz~',
  '.zz',
  '.zz.~1~',
  '.zz.0',
  '.\x01',
  '.\x01.txt',
  '.\x01x',
  '.\x01x\x01',
  '.\x01.0',
  '0',
  '9',
  'A',
  'Z',
  'a~',
  'a',
  'a.b~',
  'a.b',
  'a.bc~',
  'a.bc',
  'a+',
  'a.',
  'a..a',
  'a.+',
  'b~',
  'b',
  'gcc-c++-10.fc9.tar.gz',
  'gcc-c++-10.fc9.tar.gz.~1~',
  'gcc-c++-10.fc9.tar.gz.~2~',
  'gcc-c++-10.8.12-0.7rc2.fc9.tar.bz2',
  'gcc-c++-10.8.12-0.7rc2.fc9.tar.bz2.~1~',
  'glibc-2-0.1.beta1.fc10.rpm',
  'glibc-common-5-0.2.beta2.fc9.ebuild',
  'glibc-common-5-0.2b.deb',
  'glibc-common-11b.ebuild',
  'glibc-common-11-0.6rc2.ebuild',
  'libstdc++-0.5.8.11-0.7rc2.fc10.tar.gz',
  'libstdc++-4a.fc8.tar.gz',
  'libstdc++-4.10.4.20040204svn.rpm',
  'libstdc++-devel-3.fc8.ebuild',
  'libstdc++-devel-3a.fc9.tar.gz',
  'libstdc++-devel-8.fc8.deb',
  'libstdc++-devel-8.6.2-0.4b.fc8',
  'nss_ldap-1-0.2b.fc9.tar.bz2',
  'nss_ldap-1-0.6rc2.fc8.tar.gz',
  'nss_ldap-1.0-0.1a.tar.gz',
  'nss_ldap-10beta1.fc8.tar.gz',
  'nss_ldap-10.11.8.6.20040204cvs.fc10.ebuild',
  'z',
  'zz~',
  'zz',
  'zz.~1~',
  'zz.0',
  'zz.0.txt',
  '\x01',
  '\x01.txt',
  '\x01x',
  '\x01x\x01',
  '\x01.0',
  '#\x01.b#',
  '#.b#'
];

const equals = [
	'a',
	'a0',
	'a0000',
	null,
	'a\x01c-27.txt',
	'a\x01c-027.txt',
	'a\x01c-00000000000000000000000000000000000000000000000000000027.txt',
	null,
	'.a\x01c-27.txt',
	'.a\x01c-027.txt',
	'.a\x01c-00000000000000000000000000000000000000000000000000000027.txt',
	null,
	'a\x01c-',
	'a\x01c-0',
	'a\x01c-00',
	null,
	'.a\x01c-',
	'.a\x01c-0',
	'.a\x01c-00',
	null,
	'a\x01c-0.txt',
	'a\x01c-00.txt',
	null,
	'.a\x01c-1\x01.txt',
	'.a\x01c-001\x01.txt',
	null
];

function x (s) {
	return '<<<' + s.replace(
		/[\u0000-\u001f]/g,
		$0 => {
			return '\x1b[4m^' +
				String.fromCodePoint(64 + $0.codePointAt(0)) +
				'\x1b[24m';
		}) +
		'>>>(' + s.length + ')';
}

describe('pre test', () => {
	it('#1', () => {assert.ok(versionUtils.filevercmp('', '') == 0)});
	it('#2', () => {assert.ok(versionUtils.filevercmp('a', 'a') == 0)});
	it('#3', () => {assert.ok(versionUtils.filevercmp('a', 'b') < 0)});
	it('#4', () => {assert.ok(versionUtils.filevercmp('b', 'a') > 0)});
	it('#5', () => {assert.ok(versionUtils.filevercmp('00', '01') < 0)});
	it('#6', () => {assert.ok(versionUtils.filevercmp('01', '010') < 0)});
	it('#7', () => {assert.ok(versionUtils.filevercmp('9', '10') < 0)});
	it('#8', () => {assert.ok(versionUtils.filevercmp('0a', '0') > 0)});
});

describe('file_prefixlen', () => {
	for (const ex of examples) {
		it(`${ex}`, () => {
			const prefixLen = versionUtils.file_prefixlen(ex);
			const prefixLen_expected = versionUtils.file_prefixlen2(ex);
			if (prefixLen_expected != prefixLen) {
				const message = [
					`actual prefixLen for "${x(ex)}": ${prefixLen}`,
					`        expected for "${x(ex)}": ${prefixLen_expected}`,
				].join('\n');
				console.log(message);
			}
			assert.equal(prefixLen, prefixLen_expected);
		});
	}
});

describe('filevercmp matrix test', () => {
	for (let i = 0; i < examples.length; i++) {
		for (let j = 0; j < examples.length; j++) {
			const a = examples[i];
			const b = examples[j];
			let title = `${i}: "${x(a)}" - ${j}: "${x(b)}"`;

			if (i < j) {
				title += ' (expect < 0)';
				it(title, () => {
					const result = versionUtils.filevercmp(a, b);
					assert.ok(result < 0);
				});
			}
			else if (j < i) {
				title += ' (expect > 0)';
				it(title, () => {
					const result = versionUtils.filevercmp(a, b);
					assert.ok(result > 0);
				});
			}
			else {
				title += ' (expect == 0)';
				it(title, () => {
					const result = versionUtils.filevercmp(a, b);
					assert.ok(result == 0);
				});
			}
		}
	}
});

describe('filevercmp equals test', () => {
	for (let i = 0; i < equals.length; i++) {
		for (; equals[i] != null; i++) {
			for (let j = i; equals[j] != null; j++) {
				const is = equals[i];
				const js = equals[j];
				it(`${x(is)} : ${x(js)}`, () => {
					assert.equal(versionUtils.filevercmp(is, js), 0);
					assert.equal(versionUtils.filevercmp(js, is), 0);
				});
			}
		}
	}
});
