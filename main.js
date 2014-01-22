var program = require("commander"),
	context = require("./lib/context.js"),
	logger = require("./lib/logger.js"),
	path = require("path"),
	mode, from, dataPath, now, dateString, vhp,
	username, password,
	downloaderCtor, downloader, uploaderCtor, uploader, transcoder,
	runUpload,
	i;

runUpload = function () {
	vhp = program.vhp;
	if (!vhp) {
		logger.error("Must --vhp provide video host provider.");
		process.exit(1);
	}

	vhp = vhp.toLowerCase();

	uploaderCtor = require("./lib/" + vhp + "-uploader.js");

	if (!uploaderCtor) {
		logger.error("--vhp argument error, unsupported video host provider.");
		process.exit(1);
	}

	username = program["user"];
	password = program["pass"];

	if (!username || !password) {
		logger.error("Must provide username and password for video host provider.");
		process.exit(1);
	}

	uploader = new uploaderCtor.ctor(dataPath, dateString, username, password);
	uploader.work();
};

program
	.version('0.0.2')
	.option('-m, --mode <mode>', 'Program running mode, (U)pload or (D)ownload.')
	.option('-f, --from <from>', 'Video origin, should be (Daum) or (Naver).')
	.option('-v, --vhp <vhp>', 'Video host provider, (17173) or (QQ).')
	.option('--path <path>', 'Working path.')
	.option('-d, --date <date>', 'Speicify working date.')
	.option("--user <user>", "Specify video host proivder username.")
	.option("--pass <pass>", "Specify video host proivder password.")
	.parse(process.argv);

logger.log("SD VideoMover (Node.js version) Started!");

mode = program.mode;
if (mode !== "D" && mode !== "U" && mode !== "T") {
	logger.error("--mode must be D or U, exiting.");
	process.exit(1);
}

dataPath = program.path;
if (!dataPath) {
	// logger.error("Mode specify path.");
	// process.exit(1);
	dataPath = path.join(__dirname, "data");
}

dateString = program.date;
if (!dateString) {
	dateString = context.getDateString();
}
logger.info("Working date: " + dateString);


if (program.mode === "D") {
	logger.info("Download mode.");

	from = program.from;
	if (!from) {
		logger.error("Must --from provide video origin.");
		process.exit(1);
	}
	downloaderCtor = require("./lib/" + from + "-downloader.js");

	if (!downloaderCtor) {
		logger.error("--from argument error, unsupported video origin.");
		process.exit(1);
	}

	downloader = new downloaderCtor.ctor(dataPath, dateString);
	downloader.work();

} else if (program.mode === "U") {
	logger.info("Upload mode.");

	runUpload();

} else if (program.mode === "DU") {
	// logger.info("Download then Upload mode.");

	// from = program.from;
	// if (!from) {
	// 	logger.error("Must --from provide video origin.");
	// 	process.exit(1);
	// }

	// username = program["user"];
	// password = program["pass"];

	// if (!username || !password) {
	// 	logger.error("Must provide username and password for video host provider.");
	// 	process.exit(1);
	// }

	// from = from.split(',');

	// for (i = 0; i < from.length; i++) {
	// 	downloaderCtor = require("./lib/" + from[i] + "-downloader.js");
	// 	downloader = new downloaderCtor.ctor(dataPath, dateString);
	// 	downloader.work();
	// }
	// logger.info("Downloaders started!");

	// uploader = new (require("./lib/17173-uploader.js").ctor)(dataPath, dateString, username, password);
	// uploader.work();
	// logger.info("Uploaders started!");
} else if (program.mode === "C") {
	// check

} else if (program.mode === "T") {
	// transcode and upload
	transcoder = new (require("./lib/transcoder.js").ctor)(dataPath, dateString);
	transcoder.work();
} else {
	logger.error("Unsupported mode!");
}

process.on('uncaughtException', function(err) {
	logger.error((new Date()).toUTCString() + ' uncaughtException:', err.message);
	logger.error(err.stack);
	// process.exit(1);
});