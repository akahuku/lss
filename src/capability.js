/**
 * capUtils -- linux capability utility
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';
import util from 'node:util';

import {runtime} from './base.js';

export function getCapability (filePath) {
	for (const name of ['viaAddon', 'viaChildProcess']) {
		const result = getCapability[name](filePath);
		if (result != '') return result;
	}
	return '0 ';
}

getCapability.viaAddon = filePath => {
	try {
		return runtime.addon.getCapability(filePath);
	}
	catch {
		return '';
	}
};

getCapability.viaChildProcess = filePath => {
	const args = [filePath];
	const opts = {
		encoding: 'utf8',
		stdio: 'pipe',
		timeout: 3000
	};
	const result = child_process.spawnSync('getcap', args, opts);

	// no data
	// note: this test is not robust.
	if (/no such file or directory/i.test(result.stderr)) {
		return '2 ';
	}

	// something error
	if (/.+/.test(result.stderr)) {
		return '';
	}

	// a file which has something capabilities
	if (/.+/.test(result.stdout)) {
		const fragments = result.stdout
			.replace(/^\s+|\s+$/g, '')
			.split(/\s+/);
		const caps = [];
		let fragment;

		while (fragments.length
		  && /^[^=+-]+[=+-]\w+$/.test(fragment = fragments.pop())) {
			caps.unshift(fragment);
		}

		return `0 ${caps.join(' ')}`;
	}

	// a file which has not capabilities
	return '0 ';
};

export const capUtils = (() => {
	let unsupportedDevice;

	function isENOTSUP (err) {
		// note: asume ENOTSUP == EOPNOTSUPP
		return err == 95;
	}

	function isUnsupported (err) {
		return err == 22/*EINVAL*/
			|| err == 38/*ENOSYS*/
			|| isENOTSUP(err);
	}

	function hasCapability (filePath) {
		try {
			const result = getCapability(filePath);

			// no capabilities
			if (result == '0 ') {
				return {capability: ''};
			}

			// valid capabilities
			let re = /^0 (.+)/.exec(result);
			if (re) {
				return {capability: re[1]};
			}

			// errno returned
			re = /^(\d+) /.exec(result);
			if (re) {
				return {
					reason: util.getSystemErrorName(re[1] - 0),
					errno: re[1] - 0
				};
			}

			// unknown result
			throw new Error('unknown error');
		}
		catch (err) {
			//console.dir(err);
			return {
				reason: err.message,
				errno: err.errno || -1
			};
		}
	}

	function hasCapabilityWithCache (path, f) {
		if (f.stat.dev == unsupportedDevice) {
			return false;
		}

		const b = hasCapability(path.toString());
		if ('capability' in b) {
			return b.capability != '';
		}
		else {
			if (isUnsupported(b.errno)) {
				unsupportedDevice = f.stat.dev;
			}
			return false;
		}
	}

	return {
		hasCapability, hasCapabilityWithCache
	};
})();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
