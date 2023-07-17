import assert from 'node:assert/strict';

import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {runtime} from '../src/base.js';
import {getUserName, getGroupName} from '../src/id.js';
import {getCapability} from '../src/capability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * asserts:
 *   equal(actual, expected[, message])
 */

describe('native addon', () => {
	describe('uid', () => {
		[1000, 2, 1000000000].forEach(uid => {
			it(`getUserName(), uid: ${uid}`, () => {
				const result1 = getUserName.viaAddon(uid);
				const result2 = getUserName.viaChildProcess(uid);
				assert.equal(result1, result2);
			});
		});
	});

	describe('gid', () => {
		[1000, 100, 1000000000].forEach(gid => {
			it(`getUserGroup(), gid: ${gid}`, () => {
				const result1 = getGroupName.viaAddon(gid);
				const result2 = getGroupName.viaChildProcess(gid);
				assert.equal(result1, result2);
			});
		});
	});

	describe('capability', () => {
		it('should return empty string from getCapability() with non-capability file', () => {
			const result1 = getCapability.viaAddon('package.json');
			const result2 = getCapability.viaChildProcess('package.json');
			assert.equal(result1, '0 '); // 0: no capability
			assert.equal(result1, result2);
		});

		it('should return empty string from getCapability() with non-exist file', () => {
			const result1 = getCapability.viaAddon('foobar.xyz');
			const result2 = getCapability.viaChildProcess('foobar.xyz');
			assert.equal(result1, '2 '); // 2: NOENT
			assert.equal(result1, result2);
		});

		it('should return any string from getCapability() with capability file', () => {
			const result1 = getCapability.viaAddon('/usr/bin/ping');
			const result2 = getCapability.viaChildProcess('/usr/bin/ping');
			assert.match(result1, /0 .+/);
			assert.equal(result1, result2);
		});
	});

	describe('magic', () => {
		it('should return mime type string from getMagic() with a file', () => {
			const file = path.join(__dirname, '../build/Release/lss.node');
			const result = runtime.addon.getMagic(file);
			assert.match(result, /^application\/x-sharedlib$/);
			console.log(`result: "${result}"`);

			const result2 = runtime.addon.closeMagic();
			assert.ok(result2);
		});
	});

	describe('extend attributes', () => {
		it('should throw an error for attributes which contains non-string value', () => {
			const attribs = {
				'user.test1': `test1-value-${Math.random().toFixed(8)}`,
				'user.test2': 100
			};

			assert.throws(() => {
				const setResult = runtime.addon.setExtendAttribute(__filename, attribs);
			});
		});

		it('should set/get extend attribute with a file', () => {
			const attribs = {
				'user.test1': `test1-value-${Math.random().toFixed(8)}`,
				'user.test2': (100).toString()
			};

			const setResult = runtime.addon.setExtendAttribute(__filename, attribs);
			assert.ok(setResult);

			const getResult = runtime.addon.getExtendAttribute(__filename);
			assert.deepEqual(getResult, attribs);
		});
	});
});
