/**
 * lss.cc -- native addon provides functionality that is needed for lss
 *           but Node.js does not have by default
 *
 * @author akahuku@gmail.com
 */

#include <sys/types.h>
#include <errno.h>
#include <stdio.h>
#include <memory>

#include <pwd.h>
#include <grp.h>
#include <sys/capability.h>
#include <sys/xattr.h>
#include <magic.h>

#include "lss.hh"

using namespace Napi;
using namespace lss;

static magic_t magicCookie;
static bool magicInitialized = false;

String lss::getUserName (const CallbackInfo &info) {
	auto env = info.Env();

	if (info.Length() < 1) {
		throw TypeError::New(env, "uid is mandatory argument");
	}

	if (!info[0].IsNumber()) {
		throw TypeError::New(env, "uid must be a number");
	}

	auto user = getpwuid(info[0].As<Number>().Int32Value());

	if (user) {
		return String::New(env, user->pw_name);
	}
	else {
		return String::New(env, "");
	}
}

String lss::getGroupName (const CallbackInfo &info) {
	auto env = info.Env();

	if (info.Length() < 1) {
		throw TypeError::New(env, "gid is mandatory argument");
	}

	if (!info[0].IsNumber()) {
		throw TypeError::New(env, "gid must be a number");
	}

	auto group = getgrgid(info[0].As<Number>().Int32Value());

	if (group) {
		return String::New(env, group->gr_name);
	}
	else {
		return String::New(env, "");
	}
}

String lss::getCapability (const CallbackInfo &info) {
	auto env = info.Env();

	if (info.Length() < 1) {
		throw TypeError::New(env, "path is mandatory argument");
	}

	if (!info[0].IsString()) {
		throw TypeError::New(env, "path must be a string");
	}

	char buf[BUFSIZ];
	cap_t cap_d = cap_get_file(info[0].As<String>().Utf8Value().c_str());
	if (!cap_d) {
		if (errno == ENODATA) {
			return String::New(env, "0 ");
		}
		else {
			snprintf(buf, sizeof buf, "%d ", errno);
			return String::New(env, buf);
		}
	}

	char *result = cap_to_text(cap_d, NULL);
	if (!result) {
		snprintf(buf, sizeof buf, "%d ", errno);
		String returnVar = String::New(env, buf);
		cap_free(cap_d);
		return returnVar;
	}

	snprintf(buf, sizeof buf, "0 %s", result);
	String returnVar = String::New(env, buf);
	cap_free(cap_d);
	cap_free(result);
	return returnVar;
}

String lss::getMagic (const CallbackInfo &info) {
	auto env = info.Env();

	if (info.Length() < 1) {
		throw TypeError::New(env, "path is mandatory argument");
	}

	if (!info[0].IsString()) {
		throw TypeError::New(env, "path must be a string");
	}

	if (magicInitialized) {
		if (!magicCookie) {
			throw Error::New(env, "magic library is invalid state");
		}
	}
	else {
		magicCookie = magic_open(
				MAGIC_SYMLINK
				| MAGIC_MIME_TYPE
				| MAGIC_ERROR);
		if (magicCookie) {
			if (magic_load(magicCookie, NULL) == 0) {
				// initialization ok
			}
			else {
				magic_close(magicCookie);
				magicCookie = NULL;
			}
		}
		else {
			magicCookie = NULL;
		}

		magicInitialized = true;
		if (!magicCookie) {
			throw Error::New(env, "failed to initialize magic library");
		}
	}

	auto mime = magic_file(magicCookie, info[0].As<String>().Utf8Value().c_str());

	if (mime) {
		return String::New(env, mime);
	}
	else {
		throw Error::New(env, "failed to retrieve mime type");
	}
}

Boolean lss::closeMagic (const CallbackInfo &info) {
	auto env = info.Env();

	if (magicCookie) {
		magic_close(magicCookie);
		magicCookie = NULL;
		magicInitialized = false;
		return Boolean::New(env, true);
	}
	else {
		magicInitialized = false;
		return Boolean::New(env, false);
	}
}

Object lss::getExtendAttribute (const CallbackInfo &info) {
	const ssize_t buffer_size_max = 0x10000;
	auto env = info.Env();

	if (info.Length() < 1) {
		throw TypeError::New(env, "path is mandatory argument");
	}

	if (!info[0].IsString()) {
		throw TypeError::New(env, "path must be a string");
	}

	auto pathString = info[0].As<String>().Utf8Value();
	auto path = pathString.c_str();

	/*
	 * calculate buffer size
	 */

	auto length = listxattr(path, NULL, 0);
	// The name must not be an empty string.
	// Therefore, treat return value 0 as an error.
	if (length <= 0) {
		throw Error::New(env, "failed to calculate buffer size");
	}
	if (length > buffer_size_max) {
		throw Error::New(env, "calculated buffer size is too large");
	}

	/*
	 * allocate buffer and fill content
	 */

	std::unique_ptr<char[]> list(new char[length]);
	length = listxattr(path, list.get(), length);
	if (length < 0) {
		throw Error::New(env, "failed to retrieve attribute list");
	}

	/*
	 * build result object
	 */

	const char * p = list.get();
	const char * const goal = p + length;
	Object result = Object::New(env);
	for (;p != goal; p = strchr(p, '\0') + 1) {
		if (*p == '\0') continue;

		auto valueLength = getxattr(path, p, NULL, 0);
		if (valueLength < 0) {
			throw Error::New(env, "failed to calculate value buffer size");
		}
		if (valueLength > buffer_size_max) {
			throw Error::New(env, "calculated value buffer size is too large");
		}

		std::unique_ptr<char[]> value(new char[valueLength]);
		valueLength = getxattr(path, p, value.get(), valueLength);
		if (valueLength < 0) {
			throw Error::New(env, "failed to retrieve attribute value");
		}

		result[p] = String::New(env, value.get());
	}

	return result;
}

Boolean lss::setExtendAttribute (const CallbackInfo &info) {
	auto env = info.Env();

	if (info.Length() < 2) {
		throw TypeError::New(env, "path and attributes are mandatory arguments");
	}

	if (!info[0].IsString()) {
		throw TypeError::New(env, "path must be a string");
	}

	if (!info[1].IsObject()) {
		throw TypeError::New(env, "attributes must be an object");
	}

	auto pathString = info[0].As<String>().Utf8Value();
	auto path = pathString.c_str();
	auto attributes = info[1].As<Object>();
	auto attrNames = attributes.GetPropertyNames();
	for (int i = 0, goal = attrNames.Length(); i < goal; i++) {
		auto propNameString = attrNames.Get(i).ToString().Utf8Value();

		if (!attributes.Get(propNameString).IsString()) {
			throw Error::New(env, "attributes contains non-string value");
		}

		auto propValueString = attributes.Get(propNameString).ToString().Utf8Value();
		auto result = setxattr(
			path,
			propNameString.c_str(),
			propValueString.c_str(), propValueString.length() + 1,
			0);
		if (result < 0) {
			throw Error::New(env, "failed to set attribute");
		}
	}

	return Boolean::New(env, true);
}

Object Init (Env env, Object exports) {
	exports["getUserName"] = Function::New(env, &getUserName);
	exports["getGroupName"] = Function::New(env, &getGroupName);
	exports["getCapability"] = Function::New(env, &getCapability);
	exports["getMagic"] = Function::New(env, &getMagic);
	exports["closeMagic"] = Function::New(env, &closeMagic);
	exports["getExtendAttribute"] = Function::New(env, &getExtendAttribute);
	exports["setExtendAttribute"] = Function::New(env, &setExtendAttribute);

	/*
	 * TODO: implement
	 *   getSecurityContext
	 */

	return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init);
