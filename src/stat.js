/**
 * statUtils -- stat utilities
 *
 * @author akahuku@gmail.com
 */

export const statUtils = (() => {
	const modeCache = new Map;

	const  S_IFMT = 0o170000,
		 S_IFSOCK = 0o140000,
		  S_IFLNK = 0o120000,
		  S_IFREG = 0o100000,
		  S_IFBLK = 0o060000,
		  S_IFDIR = 0o040000,
		  S_IFCHR = 0o020000,
		  S_IFIFO = 0o010000,
		  S_ISUID = 0o004000,
		  S_ISGID = 0o002000,
		  S_ISVTX = 0o001000,

		  S_IRWXU = 0o000700,
		  S_IRUSR = 0o000400,
		  S_IWUSR = 0o000200,
		  S_IXUSR = 0o000100,

		  S_IRWXG = 0o000070,
		  S_IRGRP = 0o000040,
		  S_IWGRP = 0o000020,
		  S_IXGRP = 0o000010,

		  S_IRWXO = 0o000007,
		  S_IROTH = 0o000004,
		  S_IWOTH = 0o000002,
		  S_IXOTH = 0o000001,

		  S_IFMPB = 0o070000,
		  S_IFMPC = 0o030000,
		  S_IFNWK = 0o010000,

		  S_IFNAM = 0o050000,
		  S_INSEM = 0o000001,
		  S_INSHD = 0o000002;

	const bits = {
		S_IFMT, S_IFSOCK, S_IFLNK, S_IFREG, S_IFBLK, S_IFDIR, S_IFCHR,
		S_IFIFO, S_ISUID, S_ISGID, S_ISVTX,
		S_IRWXU, S_IRUSR, S_IWUSR, S_IXUSR,
		S_IRWXG, S_IRGRP, S_IWGRP, S_IXGRP,
		S_IRWXO, S_IROTH, S_IWOTH, S_IXOTH,
		S_IFMPB, S_IFMPC, S_IFNWK,
		S_IFNAM, S_INSEM, S_INSHD,

		S_IRWXUGO: S_IRWXU | S_IRWXG | S_IRWXO,
		S_IALLUGO: S_ISUID | S_ISGID | S_ISVTX | S_IRWXU | S_IRWXG | S_IRWXO,
		S_IRUGO: S_IRUSR | S_IRGRP | S_IROTH,
		S_IWUGO: S_IWUSR | S_IWGRP | S_IWOTH,
		S_IXUGO: S_IXUSR | S_IXGRP | S_IXOTH
	};

	function S_ISLNK (m)  {return (m & S_IFMT) == S_IFLNK}
	function S_ISREG (m)  {return (m & S_IFMT) == S_IFREG}
	function S_ISDIR (m)  {return (m & S_IFMT) == S_IFDIR}
	function S_ISCHR (m)  {return (m & S_IFMT) == S_IFCHR}
	function S_ISBLK (m)  {return (m & S_IFMT) == S_IFBLK}
	function S_ISFIFO (m) {return (m & S_IFMT) == S_IFIFO}
	function S_ISSOCK (m) {return (m & S_IFMT) == S_IFSOCK}

	function S_ISCTG (m)  {return false}
	function S_ISDOOR (m) {return false}
	function S_ISMPB (m)  {return (m & S_IFMT) == S_IFMPB}
	function S_ISMPC (m)  {return (m & S_IFMT) == S_IFMPC}
	function S_ISMPX (m)  {return false}
	function S_ISNWK (m)  {return (m & S_IFMT) == S_IFNWK}
	function S_ISPORT (m) {return false}
	function S_ISWHT (m)  {return false}
	function S_ISNAM (m)  {return (m & S_IFMT) == S_IFNAM}

	function S_TYPEISSEM (p) {return S_ISNAM(p.mode) && p.rdev == S_INSEM}
	function S_TYPEISMQ (p)  {return false}
	function S_TYPEISTMO (p) {return false}
	function S_TYPEISSHM (p) {return S_ISNAM(p.mode) && p.rdev == S_INSHD}

	function ST_NBLOCKS (stat) {
		return stat.blocks ? Math.ceil(stat.size / stat.blksize) : 0;
	}

	/*
	 * Return a character indicating the type of file described by
	 * file mode BITS:
	 *   '-' regular file
	 *   'b' block special file
	 *   'c' character special file
	 *   'C' high performance ("contiguous data") file
	 *   'd' directory
	 *   'D' door
	 *   'l' symbolic link
	 *   'm' multiplexed file (7th edition Unix; obsolete)
	 *   'n' network special file (HP-UX)
	 *   'p' fifo (named pipe)
	 *   'P' port
	 *   's' socket
	 *   'w' whiteout (4.4BSD)
	 *   '?' some other file type
	 */

	function getFileTypelet (bits) {
		/* These are the most common, so test for them first.  */
		if (S_ISREG(bits))
			return '-';
		if (S_ISDIR(bits))
			return 'd';

		/* Other letters standardized by POSIX 1003.1-2004.  */
		if (S_ISBLK(bits))
			return 'b';
		if (S_ISCHR(bits))
			return 'c';
		if (S_ISLNK(bits))
			return 'l';
		if (S_ISFIFO(bits))
			return 'p';

		/* Other file types (though not letters) standardized by POSIX.  */
		if (S_ISSOCK(bits))
			return 's';

		/* Nonstandard file types.  */
		if (S_ISCTG(bits))
			return 'C';
		if (S_ISDOOR(bits))
			return 'D';
		if (S_ISMPB(bits) || S_ISMPC(bits) || S_ISMPX(bits))
			return 'm';
		if (S_ISNWK(bits))
			return 'n';
		if (S_ISPORT(bits))
			return 'P';
		if (S_ISWHT(bits))
			return 'w';

		return '?';
	}

	/*
	 * Like getFileModeString, but rely only on MODE.
	 */

	function getStrMode (mode) {
		const str = new Array(10);

		str[0] = getFileTypelet(mode);
		str[1] = mode & S_IRUSR ? 'r' : '-';
		str[2] = mode & S_IWUSR ? 'w' : '-';
		str[3] = (mode & S_ISUID
			? (mode & S_IXUSR ? 's' : 'S')
			: (mode & S_IXUSR ? 'x' : '-'));
		str[4] = mode & S_IRGRP ? 'r' : '-';
		str[5] = mode & S_IWGRP ? 'w' : '-';
		str[6] = (mode & S_ISGID
			? (mode & S_IXGRP ? 's' : 'S')
			: (mode & S_IXGRP ? 'x' : '-'));
		str[7] = mode & S_IROTH ? 'r' : '-';
		str[8] = mode & S_IWOTH ? 'w' : '-';
		str[9] = (mode & S_ISVTX
			? (mode & S_IXOTH ? 't' : 'T')
			: (mode & S_IXOTH ? 'x' : '-'));

		return str;
	}

	/*
	 * getFileModeString - fill in string STR with an ls-style ASCII
	 *   representation of the st_mode field of file stats block STATP.
	 *   12 characters are stored in STR.
	 *   The characters stored in STR are:
	 *
	 *   0    File type, as in ftypelet above, except that other letters are used
	 *   for files whose type cannot be determined solely from st_mode:
	 *
	 *   'F' semaphore
	 *   'Q' message queue
	 *   'S' shared memory object
	 *   'T' typed memory object
	 *
	 *   1    'r' if the owner may read, '-' otherwise.
	 *
	 *   2    'w' if the owner may write, '-' otherwise.
	 *
	 *   3    'x' if the owner may execute, 's' if the file is
	 *        set-user-id, '-' otherwise.
	 *        'S' if the file is set-user-id, but the execute
	 *        bit isn't set.
	 *
	 *   4    'r' if group members may read, '-' otherwise.
	 *
	 *   5    'w' if group members may write, '-' otherwise.
	 *
	 *   6    'x' if group members may execute, 's' if the file is
	 *        set-group-id, '-' otherwise.
	 *        'S' if it is set-group-id but not executable.
	 *
	 *   7    'r' if any user may read, '-' otherwise.
	 *
	 *   8    'w' if any user may write, '-' otherwise.
	 *
	 *   9    'x' if any user may execute, 't' if the file is "sticky"
	 *        (will be retained in swap space after execution), '-'
	 *        otherwise.
	 *        'T' if the file is sticky but not executable.
	 *
	 *   10   ' ' for compatibility with 4.4BSD strmode,
	 *        since this interface does not support ACLs.
	 */

	function getFileModeString (stat) {
		const key = stat.mode << 32 | stat.rdev;
		let result = modeCache.get(key);

		if (result === undefined) {
			const str = getStrMode(stat.mode);

			if (S_TYPEISSEM(stat))
				str[0] = 'F';
			else if (S_TYPEISMQ(stat))
				str[0] = 'Q';
			else if (S_TYPEISSHM(stat))
				str[0] = 'S';
			else if (S_TYPEISTMO(stat))
				str[0] = 'T';

			modeCache.set(key, result = str.join(''));
		}

		return result;
	}

	function wrap (stat) {
		return {
			dev: Number(stat.dev),
			mode: Number(stat.mode),
			nlink: Number(stat.nlink),
			uid: Number(stat.uid),
			gid: Number(stat.gid),
			author: Number(stat.uid),
			rdev: Number(stat.rdev),
			blksize: Number(stat.blksize),
			ino: Number(stat.ino),
			size: Number(stat.size),
			blocks: Number(stat.blocks),
			atimeNs: stat.atimeNs,
			mtimeNs: stat.mtimeNs,
			ctimeNs: stat.ctimeNs,
			birthtimeNs: stat.birthtimeNs,
		};
	}

	return {
		S_ISLNK, S_ISREG, S_ISDIR, S_ISCHR, S_ISBLK, S_ISFIFO, S_ISSOCK,
		S_ISCTG, S_ISDOOR, S_ISMPB, S_ISMPC, S_ISMPX, S_ISNWK, S_ISPORT,
		S_ISWHT, S_ISNAM,
		S_TYPEISSEM, S_TYPEISMQ, S_TYPEISTMO, S_TYPEISSHM,

		ST_NBLOCKS,

		getFileModeString, wrap,
		get bits () {return bits}
	};
})();
