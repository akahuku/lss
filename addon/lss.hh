#include <napi.h>

namespace lss {
	using namespace Napi;
	/*
	 * methods that wrap functions in pwd.h, grp.h
	 */
	String getUserName (const CallbackInfo &info);
	String getGroupName (const CallbackInfo &info);

	/*
	 * methods that wrap functions in sys/capability.h (libcap.so)
	 */
	String getCapability (const CallbackInfo &info);

	/*
	 * methods that wrap functions in magic.h (libmagic.so)
	 */
	String getMagic (const CallbackInfo &info);
	Boolean closeMagic (const CallbackInfo &info);

	/*
	 * methods that wrap functions in sys/xattr.h (libattr.so)
	 */
	Object getExtendAttribute (const CallbackInfo &info);
	Boolean setExtendAttribute (const CallbackInfo &info);
} // namespace lss

