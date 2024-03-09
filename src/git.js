/**
 * git.js -- wrapper of git-status
 */

import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import {default as nodePath} from 'node:path';

import {fileWhich} from './utils.js';

const UPDATED_DIRECTORY_MARK = '+'
const GIT_EXECUTABLE = 'git';

const COMMITTED_INDEX = 0;
const UPDATED_WT_INDEX = 1;
const UNMERGED_INDEX = 2;
const UNTRACKED_INDEX = 3;
const IGNORED_INDEX = 4;
const OTHER_FILES_INDEX = 5;
const OTHER_FILES_LABEL = 'Files not marked by git at this time';
const SECTION_LABELS = [
	{
		label: 'Changes to be committed',
		color: '32'
	},
	{
		label: 'Changes not staged for commit',
		color: '31'
	},
	{
		label: 'Unmerged paths',
		color: '31'
	},
	{
		label: 'Untracked files',
		color: '31'
	},
	{
		label: 'Ignored files',
		color: '31'
	}
];

const STATUS_CHAR_MAP = {
	/*
	 * 0: generic header
	 * 1: description for index
	 * 2: description for working tree
	 */
	' ': [null,         'not updated',  'index and work tree matches'],
	'M': ['modified',   'updated',      'work tree changed since index'],
	'T': ['typechange', 'type changed', 'type changed since index'],
	'A': ['newfile',    'added',        null],
	'D': ['deleted',    'deleted',      'deleted in work tree'],
	'R': ['renamed',    'renamed',      'renamed in work tree'],
	'C': ['copied',     'copied',       'copied in work tree'],
	'U': [null,         null,           null],
	'?': ['untracked',  null,           null],
	'!': ['ignored',    null,           null],

	// special char
	[UPDATED_DIRECTORY_MARK]: ['mixed', null, null]
};

const UNMERGED_MAP = {
	'DD': 'both deleted',
	'AU': 'added by us',
	'UD': 'deleted by them',
	'UA': 'added by them',
	'DU': 'deleted by us',
	'AA': 'both added',
	'UU': 'both modified'
};

function parseStatus (st) {
	if (st === '!!') {
		return [{
			order: IGNORED_INDEX,
			char: '!',
			pathCount: 1
		}];
	}
	else if (st === '??') {
		return [{
			order: UNTRACKED_INDEX,
			char: '?',
			pathCount: 1
		}];
	}
	else if (st in UNMERGED_MAP) {
		return [{
			order: UNMERGED_INDEX,
			char: st,
			pathCount: 1
		}];
	}
	else {
		const re = /^([ MTADRC])([ MTADRC])$/.exec(st);
		if (re) {
			const result = [];
			for (let i = 1; i <= 2; i++) {
				if (re[i] == ' ') continue;
				result.push({
					order: i == 1 ? COMMITTED_INDEX : UPDATED_WT_INDEX,
					char: re[i],
					pathCount: 'RC'.includes(re[i]) ? 2 : 1
				});
			}
			return result;
		}
	}

	return null;
}

function parseGitStatus (buffer, root, basePath, filterFunc) {
	/*
	 * buffer: result of 'git-status'
	 * root: repository root path
	 *   ex. '/path/to/repository'
	 * basePath: relative path from root
	 *   ex. ''
	 *       '.'
	 *       'src'
	 */

	if (!Buffer.isBuffer(buffer)) {
		throw new Error('parseGitStatus: argument #1 is not a buffer');
	}

	const result = {
		branchHeader: null,
		sections: SECTION_LABELS.map((label, index) => {
			return {index, label: label.label, entries: []};
		})
	};

	let mode = 0;
	let current = 0;
	let dirs = new Set;

	basePath = nodePath.resolve(basePath) + '/';
	if (basePath.indexOf(root) !== 0) {
		throw new Error('parseGitStatus: invalid base path');
	}

	loop: while (current < buffer.length) {
		if (mode == 1 && current + 3 <= buffer.length) {
			const statuses = parseStatus(buffer.toString('utf8', current, current + 2));
			if (!statuses) break loop;
			current += 3;

			const pathCount = Math.max.apply(Math, statuses.map(s => s.pathCount));
			let path, pathOrig;

			// rename or copy - takes two paths
			if (pathCount == 2) {
				let termIndex = buffer.indexOf(0, current);
				if (termIndex < 0) break loop;

				// path
				path = buffer.toString('utf8', current, termIndex);
				current = termIndex + 1;

				termIndex = buffer.indexOf(0, current);
				if (termIndex < 0) break loop;

				// pathOrig
				pathOrig = buffer.toString('utf8', current, termIndex);
				current = termIndex + 1;
			}

			// other line
			else {
				const termIndex = buffer.indexOf(0, current);
				if (termIndex < 0) break loop;

				// path
				path = buffer.toString('utf8', current, termIndex);
				current = termIndex + 1;
			}

			if (typeof filterFunc === 'function') {
				if (filterFunc(nodePath.basename(path))) continue;
			}

			/*
			 * Rewrite file name to full path
			 *   README.md  -> /path/to/repository/README.md
			 *   src/foo.js -> /path/to/repository/src/foo.js
			 */
			path = nodePath.resolve(root, path);
			if (!path.startsWith(basePath)) continue;

			/*
			 * Remove the leading basePath.
			 * When basePath is assumed to be '/path/to/repository/src/'...
			 *   /path/to/repository/src/foo.js     -> foo.js
			 *   /path/to/repository/src/bar/baz.js -> bar/baz.js
			 */
			path = path.substring(basePath.length);

			/*
			 * Combine files in subdirectories
			 *   dir/foo.js -> dir
			 */
			const delimiterIndex = path.indexOf('/');
			if (delimiterIndex >= 0) {
				path = path.substring(0, delimiterIndex);
			}

			for (const status of statuses.values()) {
				if (delimiterIndex >= 0) {
					const key = `${status.order}-${path}`;
					if (dirs.has(key)) {
						const lastEntry = result.sections[status.order].entries.at(-1);
						if (lastEntry.char != status.char) {
							lastentry.char = UPDATED_DIRECTORY_MARK;
						}
						continue;
					}

					status.pathCount = 1;
					dirs.add(key);
				}

				result.sections[status.order].entries.push({...status, path});
			}
		}
		else if (mode == 0) {
			if (current + 3 <= buffer.length
			 && buffer.toString('utf8', current, current + 3) === '## ') {
				current += 3;

				let termIndex = buffer.indexOf(0, current);
				if (termIndex < 0) break loop;

				result.branchHeader = buffer.toString('utf8', current, termIndex);
				current = termIndex + 1;
			}
			mode = 1;
		}
		else {
			break loop;
		}
	}

	return result;
}

function isGitAvailable () {
	return fileWhich(GIT_EXECUTABLE);
}

function getRepositoryRootPath (path) {
	try {
		const result = child_process.execFileSync(
			GIT_EXECUTABLE,
			[
				'-C', path,
				'rev-parse',
				'--is-inside-work-tree',
				'--show-toplevel'
			],
			{
				stdio: ['pipe', 'pipe', 'ignore'],
				encoding: 'utf8'
			});

		if (/^true\n(.+)/.test(result)) {
			return RegExp.$1;
		}
		else {
			return null;
		}
	}
	catch {
		return null;
	}
}

function loadGitStatusSync (path, includeIgnoredFiles) {
	try {
		const args = [
			'-C', path,
			'status',
			'-z',
			'--branch',
			'--untracked-files=normal'
		];

		if (includeIgnoredFiles) {
			args.push('--ignored');
		}

		return child_process.execFileSync(
			GIT_EXECUTABLE,
			args,
			{
				stdio: ['pipe', 'pipe', 'ignore'],
				encoding: 'buffer'
			});
	}
	catch (err) {
		console.log(err.stack);
		return null;
	}
}

export const gitUtils = (() => {
	let initialized;
	let includeIgnoredFiles = false;
	let path;
	let gitStatus;
	let filterFunc;

	function init () {
		if (initialized !== undefined) {
			return initialized;
		}

		if (!isGitAvailable()) {
			return initialized = false;
		}

		return initialized = true;
	}

	function merge (/*FileInfo[]*/files) {
		if (!init()) {
			return null;
		}
		if (!gitStatus) {
			return null;
		}

		const result = structuredClone(gitStatus);
		const fileOrder = new Map(files.map((file, index) => [file.name.toString(), index]));
		const trackedFiles = new Map(fileOrder);

		for (let i = 0; i < result.sections.length; i++) {
			if (result.sections[i].entries.length) {
				result.sections[i].entries = result.sections[i].entries
					.sort((a, b) => {
						return (fileOrder.has(a.path) ? fileOrder.get(a.path) : 0x7fffffff) -
							   (fileOrder.has(b.path) ? fileOrder.get(b.path) : 0x7fffffff);
					})
					.map(e => {
						trackedFiles.delete(e.path);

						let file;
						if (fileOrder.has(e.path) && (file = files[fileOrder.get(e.path)])) {
							file = file.clone();
							file.git = [e.char, result.sections[i].index];
							return file;
						}
						else {
							return null;
						}
					})
					.filter(e => !!e);
			}

			if (!result.sections[i].entries.length) {
				result.sections.splice(i--, 1);
			}
		}

		if (trackedFiles.size) {
			const entries = [];
			trackedFiles.forEach((index, name) => {
				const file = files[index].clone();
				entries.push(file);
			});
			result.sections.push({
				index: OTHER_FILES_INDEX,
				label: OTHER_FILES_LABEL,
				entries
			});
		}

		/*
		 * result = {
		 *   branchHeader: 'main...origin/main',
		 *   sections: [
		 *     {
		 *       index: 0,
		 *       label: 'Changes to be committed',
		 *       entries: array of FileInfo [
		 *         {name: Buffer('src'), git: '+', ...},
		 *           :
		 *       ]
		 *     },
		 *     {
		 *       index: 1,
		 *       label: 'Changes not staged for commit',
		 *       entries: array of FileInfo [
		 *         {name: Buffer('src'), git: '+', ...},
		 *           :
		 *       ]
		 *     },
		 *     {
		 *       ...
		 *     },
		 *   ]
		 * }
		 */

		return result;
	}

	function print (st) {
		if (!st) {
			st = gitStatus;
		}
		if (!st) {
			console.log(`## merged status is unavailable`);
			return;
		}

		console.log(`## path: ${path}`);

		if (st.branchHeader) {
			console.log(`## branch ${st.branchHeader}`);
		}

		for (let i = 0; i < st.sections.length; i++) {
			const section = st.sections[i];
			if (section.entries.length == 0) continue;

			console.log(`\n${section.label}:`);

			for (const e of section.entries) {
				if (typeof section.index === 'number') {
					process.stdout.write(`\x1b[${SECTION_LABELS[section.index]?.color || ''}m`);
				}
				process.stdout.write('  ');
				if (Array.isArray(e.git) && typeof e.git[0] === 'string') {
					process.stdout.write(`${e.git[0]} `);
				}
				if ('name' in e) {
					console.log(e.name.toString());
				}
				if ('path' in e) {
					console.log(e.path);
				}
			}

			process.stdout.write('\x1b[m');
		}
	}

	return {
		merge, print,

		get includeIgnoredFiles () {
			return includeIgnoredFiles;
		},
		set includeIgnoredFiles (value) {
			includeIgnoredFiles = !!value;
		},

		get path () {
			return path;
		},
		set path (value) {
			if (!init()) {
				return;
			}
			if (Buffer.isBuffer(value)) {
				value = value.toString();
			}
			if (value === '') {
				value = '.';
			}
			if (path !== value) {
				path = value;
				gitStatus = null;

				const root = getRepositoryRootPath(path);
				if (!root) {
					return;
				}

				const rawGitStatus = loadGitStatusSync(path, includeIgnoredFiles);
				if (!rawGitStatus) {
					return;
				}

				gitStatus = parseGitStatus(rawGitStatus, root, path, filterFunc);
			}
		},

		get isValidPath () {
			return !!gitStatus;
		},

		get pathStatus () {
			if (!gitStatus) return '';
			if (gitStatus.sections[COMMITTED_INDEX].entries.length
			 || gitStatus.sections[UPDATED_WT_INDEX].entries.length) return '+';
			return ' ';
		},

		get maxColumns () {
			if (!gitStatus) return 0;
			return gitStatus.sections.reduce((result, section) => {
				const sectionMax = Math.max.apply(
					Math, section.entries.map(e => e.char.length));
				return Math.max(result, sectionMax);
			}, 0);
		},

		get filterFunc () {
			return filterFunc;
		},
		set filterFunc (fn) {
			filterFunc = fn;
		},

		get SECTION_LABELS () {
			return SECTION_LABELS;
		},
		get STATUS_CHAR_MAP () {
			return STATUS_CHAR_MAP;
		},
		get UNMERGED_MAP () {
			return UNMERGED_MAP;
		},

		COMMITTED_INDEX,
		UPDATED_WT_INDEX,
		UNMERGED_INDEX,
		UNTRACKED_INDEX,
		IGNORED_INDEX,
		OTHER_FILES_INDEX
	};
})();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker fmr=<<<,>>> :
