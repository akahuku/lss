/**
 * path.js -- some ports of gnulib/coreutils functions
 *
 * @author akahuku@gmail.com
 */

import {Buffer} from 'node:buffer';

const SLASH_CODEPOINT = '/'.charCodeAt(0);
const DOT_CODEPOINT = '.'.charCodeAt(0);

// port of last_component() in gnulib/lib/basename-lgpl.c
export function getLastComponentPosition (name) {
	if (typeof name == 'string') {
		return getLastComponentPosition_s(name);
	}
	else if (Buffer.isBuffer(name)) {
		return getLastComponentPosition_b(name);
	}
	else {
		throw new Error(`getLastComponentPosition: invalid type`);
	}
}

function getLastComponentPosition_s (name) {
	let base = 0, p = 0, wasLastSlash = false;

	while (name.charCodeAt(base) == SLASH_CODEPOINT) {
		base++;
	}

	for (p = base; p < name.length; p++) {
		if (name.charCodeAt(p) == SLASH_CODEPOINT) {
			wasLastSlash = true;
		}
		else if (wasLastSlash) {
			base = p;
			wasLastSlash = false;
		}
	}

	return base;
}

function getLastComponentPosition_b (name) {
	let base = 0, p = 0, wasLastSlash = false;

	while (name[base] == SLASH_CODEPOINT) {
		base++;
	}

	for (p = base; p < name.length; p++) {
		if (name[p] == SLASH_CODEPOINT) {
			wasLastSlash = true;
		}
		else if (wasLastSlash) {
			base = p;
			wasLastSlash = false;
		}
	}

	return base;
}



// port of dir_len() in gnulib/lib/dirname-lgpl.c
export function getPathLength (name) {
	if (typeof name == 'string') {
		return getPathLength_s(name);
	}
	else if (Buffer.isBuffer(name)) {
		return getPathLength_b(name);
	}
	else {
		throw new Error(`getPathLength: invalid type`);
	}
}

function getPathLength_s (name) {
	let length, prefixLength = 0;

	if (name.charCodeAt(0) == SLASH_CODEPOINT) {
		prefixLength++;
	}

	for (length = getLastComponentPosition_s(name);
	  prefixLength < length;
	  length--) {
		if (name.charCodeAt(length - 1) != SLASH_CODEPOINT) break;
	}

	return length;
}

function getPathLength_b (name) {
	let length, prefixLength = 0;

	if (name[0] == SLASH_CODEPOINT) {
		prefixLength++;
	}

	for (length = getLastComponentPosition_b(name);
	  prefixLength < length;
	  length--) {
		if (name[length - 1] != SLASH_CODEPOINT) break;
	}

	return length;
}



// port of base_len() in gnulib/lib/basename-lgpl.c
export function getBasenameLength (name) {
	if (typeof name == 'string') {
		return getBasenameLength_s(name);
	}
	else if (Buffer.isBuffer(name)) {
		return getBasenameLength_b(name);
	}
	else {
		throw new Error(`getBasenameLength: invalid type`);
	}
}

function getBasenameLength_s (name) {
	let length;

	for (length = name.length;
	  1 < length && name.charCodeAt(length - 1) == SLASH_CODEPOINT;
	  length--) {
		continue;
	}

	return length;
}

function getBasenameLength_b (name) {
	let length;

	for (length = name.length;
	  1 < length && name[length - 1] == SLASH_CODEPOINT;
	  length--) {
		continue;
	}

	return length;
}



// port of file_name_concat() in gnulib/lib/filenamecat.c
export function concatFilenameToPath (dir, base) {
	if (typeof dir == 'string'
	 && typeof base == 'string') {
		return concatFilenameToPath_s(dir, base);
	}
	else if (Buffer.isBuffer(dir)
	 && Buffer.isBuffer(base)) {
		return concatFilenameToPath_b(dir, base);
	}
	else {
		throw new Error(`concatFilenameToPath: invalid type`);
	}
}

function concatFilenameToPath_s (dir, base) {
	const dirbase = getLastComponentPosition_s(dir);
	const dirbaselen = getBasenameLength_s(dir.substring(dirbase));
	const dirlen = dirbase + dirbaselen;
	let sep = '';

	if (dirbaselen) {
		if (dir.charCodeAt(dirlen - 1) != SLASH_CODEPOINT
		 && base.charCodeAt(0) != SLASH_CODEPOINT) {
			sep = '/';
		}
	}
	else if (base.charCodeAt(0) == SLASH_CODEPOINT) {
		sep = '.';
	}

	return `${dir.substring(0, dirlen)}${sep}${base}`;
}

function concatFilenameToPath_b (dir, base) {
	const dirbase = getLastComponentPosition_b(dir);
	const dirbaselen = getBasenameLength_b(dir.subarray(dirbase));
	const dirlen = dirbase + dirbaselen;
	let sep = '';

	if (dirbaselen) {
		if (dir[dirlen - 1] != SLASH_CODEPOINT
		 && base[0] != SLASH_CODEPOINT) {
			sep = '/';
		}
	}
	else if (base[0] == SLASH_CODEPOINT) {
		sep = '.';
	}

	return Buffer.concat([
		dir.subarray(0, dirlen), Buffer.from(sep), base
	]);
}



// port of make_link_name() in coreutils/src/ls.c
export function makeLinkName (name, linkName) {
	if (typeof name == 'string'
	 && typeof linkName == 'string') {
		return makeLinkName_s(name, linkName);
	}
	else if (Buffer.isBuffer(name)
	 && Buffer.isBuffer(linkName)) {
		return makeLinkName_b(name, linkName);
	}
	else {
		throw new Error(`makeLinkName: invalid type`);
	}
}

function makeLinkName_s (name, linkName) {
	if (!linkName) {
		return null;
	}

	if (linkName.startsWith('/')) {
		return linkName;
	}

	/*
	 * name              dirName
	 * --------------    ---------
	 * "path/to/file" -> "path/to"
	 * "path/to/"     -> "path"
	 * "path"         -> ""
	 */

	const prefixLength = getPathLength(name);
	if (prefixLength == 0) {
		return linkName;
	}

	const dirName = name.substring(0, prefixLength);
	return dirName.endsWith('/') ?
		dirName + linkName :
		dirName + '/' + linkName;
}

function makeLinkName_b (name, linkName) {
	if (!linkName) {
		return null;
	}

	if (linkName[0] == SLASH_CODEPOINT) {
		return linkName;
	}

	/*
	 * name              dirName
	 * --------------    ---------
	 * "path/to/file" -> "path/to"
	 * "path/to/"     -> "path"
	 * "path"         -> ""
	 */

	const prefixLength = getPathLength_b(name);
	if (prefixLength == 0) {
		return linkName;
	}

	const dirName = name.subarray(0, prefixLength);
	return dirName[dirName.length - 1] == SLASH_CODEPOINT ?
		Buffer.concat([dirName, linkName]) :
		Buffer.concat([dirName, Buffer.from('/'), linkName]);
}



// port of attach() in coreutils/src/ls.c
export function joinPath (dirName, name) {
	if (typeof dirName == 'string'
	 && typeof name == 'string') {
		return joinPath_s(dirName, name);
	}
	else if (Buffer.isBuffer(dirName)
	 && Buffer.isBuffer(name)) {
		return joinPath_b(dirName, name);
	}
	else {
		throw new Error(`joinPath: invalid type`);
	}
}

function joinPath_s (dirName, name) {
	if (dirName = '.') {
		return name;
	}
	else {
		if (!dirName.endsWith('/')) {
			return `${dirName}/${name}`;
		}
		else {
			return `${dirName}${name}`;
		}
	}
}

function joinPath_b (dirName, name) {
	if (dirName.length == 1 && dirName[0] == DOT_CODEPOINT) {
		// '.' + name -> name
		return Buffer.from(name);
	}
	else {
		// '????' + name -> ????/name
		if (dirName.length
		 && dirName[dirName.length - 1] != SLASH_CODEPOINT) {
			return Buffer.concat([
				dirName, Buffer.from('/'), name]);
		}

		// '' + name -> name
		// '????/' + name -> ????/name
		else {
			return Buffer.concat([dirName, name]);
		}
	}
}



export function isAbsolute (path) {
	if (typeof path == 'string') {
		return path.startsWith('/');
	}
	else if (Buffer.isBuffer(path)) {
		return path.length && path[0] == SLASH_CODEPOINT;
	}
	else {
		throw new Error(`isAbsolute: invalid type`);
	}
}

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
