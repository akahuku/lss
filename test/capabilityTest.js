import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {
	getCapability, capUtils
} from '../src/capability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * asserts:
 *   equal(actual, expected[, message])
 */

describe('getCapability.viaChildProcess', () => {
	it('should return correct capability', () => {
		const arg = '/usr/bin/ping';
		const result = getCapability.viaChildProcess(arg);
		assert.match(result, /0 .+/);
		console.log(result);
	});

	it('should throw exception for non-capability file', () => {
		const result = getCapability.viaChildProcess(__filename);
		assert.equal(result, '0 ');
	});

	it('should throw exception for non-exist file', () => {
		const result = getCapability.viaChildProcess('noexist.noexist');
		assert.equal(result, '2 '); // 2: NOENT
	});
});
