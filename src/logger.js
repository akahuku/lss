/**
 * logger -- post a log message to external log server
 *
 * @author akahuku@gmail.com
 */

import fs from 'node:fs';

const LOG_PATH = process.env.LSS_LOG_PATH;

let logCount = 0;
let lastMarkedTime = 0;

function escapeControls (s, escapeAllControls) {
	// replace DCS sequences
	s = s.replace(
		/(\u001bP.+?(?:\u0007|\u001b\\))/g,
		'<<<DCS>>>');

	// replace control characters, except tab and new line
	if (escapeAllControls) {
		s = s.replace(/[\u0000-\u001f]/g,
			 $0 => '^' + String.fromCodePoint(64 + $0.codePointAt(0)));
	}
	else {
		s = s.replace(/[\u0000-\u0008\u000b-\u001f]/g,
			 $0 => '^' + String.fromCodePoint(64 + $0.codePointAt(0)));
	}

	return s;
}

function getLogLine (s, escapeAllControls) {
	const now = new Date;
	const counter =
		`...${++logCount}`.substr(-3);
	const time =
		`00${now.getMinutes()}`.substr(-2) + ':' +
		`00${now.getSeconds()}`.substr(-2) + '.' +
		`000${now.getMilliseconds()}`.substr(-3);

	s = s.replace(/\n+$/, '');
	s = escapeControls(s, escapeAllControls);

	return `${counter} ${time} ${s}\n`;
}

export function log (message, mark, escapeAllControls) {
	message = getLogLine(message, escapeAllControls);
	if (mark) {
		const now = Date.now();
		if (lastMarkedTime) {
			message = message.replace(
				/\n$/,
				` \x1b[1;32m(${((now - lastMarkedTime) / 1000).toFixed(3)} secs)\x1b[m\n`);
		}
		lastMarkedTime = now;
	}
	if (LOG_PATH) {
		try {
			fs.appendFileSync(LOG_PATH, message);
		}
		catch {
			process.stdout.write(message);
		}
	}
}

Object.defineProperties(log, {
	escape: {
		value: escapeControls
	}
});
