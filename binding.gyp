{
	"targets": [
		{
			"target_name": "lss",
			"sources": [
				"<!@(ls -1 addon/*.cc)"
			],
			"include_dirs": [
				"<!@(node -p \"require('node-addon-api').include\")"
			],
			"cflags!": [
				"-fno-exceptions"
			],
			"cflags_cc!": [
				"-fno-exceptions"
			],
			"libraries": [
				"-lcap",
				"-lmagic"
			]
		}
	]
}
