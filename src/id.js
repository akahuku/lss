/**
 * id.js -- uid/gid to name mapper
 *
 * @author akahuku@gmail.com
 */

import child_process from 'node:child_process';
import {runtime} from './base.js';

export function getUserName (id) {
	for (const name of ['viaAddon', 'viaChildProcess']) {
		const result = getUserName[name](id);
		if (result != '') return result;
	}
	return '';
}

getUserName.viaAddon = id => {
	try {
		return runtime.addon.getUserName(id);
	}
	catch {
		return '';
	}
};

getUserName.viaChildProcess = id => {
	const args = ['passwd', id];
	const opts = {
		timeout: 3000,
		encoding: 'utf8'
	};
	try {
		return child_process
			.execFileSync('getent', args, opts)
			.split(':')[0];
	}
	catch {
		return '';
	}
};

export function getGroupName (id) {
	for (const name of ['viaAddon', 'viaChildProcess']) {
		const result = getGroupName[name](id);
		if (result != '') return result;
	}
	return '';
}

getGroupName.viaAddon = id => {
	try {
		return runtime.addon.getGroupName(id);
	}
	catch {
		return '';
	}
};

getGroupName.viaChildProcess = id => {
	const args = ['group', id];
	const opts = {
		timeout: 3000,
		encoding: 'utf8'
	};
	try {
		return child_process
			.execFileSync('getent', args, opts)
			.split(':')[0];
	}
	catch {
		return '';
	}
};

export const idUtils = (() => {
	const caches = new Map([
		['user', new Map],
		['group', new Map]
	]);

	function user (id) {
		const cache = caches.get('user');
		let result = cache.get(id);
		if (result === undefined) {
			cache.set(id, result = getUserName(id) ?? '?');
		}
		return result;
	}

	function group (id) {
		const cache = caches.get('group');
		let result = cache.get(id);
		if (result === undefined) {
			cache.set(id, result = getGroupName(id) ?? '?');
		}
		return result;
	}

	return {user, group};
})();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
