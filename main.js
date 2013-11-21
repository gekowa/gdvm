var program = require("commander"),
	logger = require("./logger.js"),
	path = require("path"),
	mode, from, dataPath, now, dateString, vhp,
	username, password,
	downloaderCtor, downloader, uploaderCtor, uploader,
	i;

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
if (mode !== "D" && mode !== "U") {
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
	now = new Date();
	dateString = now.toISOString().replace(/T[\w\W]+Z/, '').replace(/-/g, '');
}
logger.info("Working date: " + dateString);


if (program.mode === "D") {
	logger.info("Download mode.");

	from = program.from;
	if (!from) {
		logger.error("Must --from provide video origin.");
		process.exit(1);
	}
	downloaderCtor = require("./" + from + "-downloader.js");

	if (!downloaderCtor) {
		logger.error("--from argument error, unsupported video origin.");
		process.exit(1);
	}

	downloader = new downloaderCtor.ctor(dataPath, dateString);
	downloader.work();

} else if (program.mode === "U") {
	logger.info("Upload mode.");

	vhp = program.vhp;
	if (!vhp) {
		logger.error("Must --vhp provide video host provider.");
		process.exit(1);
	}

	vhp = vhp.toLowerCase();

	uploaderCtor = require("./" + vhp + "-uploader.js");

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
} else if (program.mode === "DU") {
	logger.info("Download then Upload mode.");

	from = program.from;
	if (!from) {
		logger.error("Must --from provide video origin.");
		process.exit(1);
	}

	username = program["17173user"];
	password = program["17173pass"];

	if (!username || !password) {
		logger.error("Must provide 17173 username and password.");
		process.exit(1);
	}

	from = from.split(',');

	for (i = 0; i < from.length; i++) {
		downloaderCtor = require("./" + from[i] + "-downloader.js");
		downloader = new downloaderCtor.ctor(dataPath, dateString);
		downloader.work();
	}
	logger.info("Downloaders started!");

	uploader = new (require("./17173-uploader.js").ctor)(dataPath, dateString, username, password);
	uploader.work();
	logger.info("Uploaders started!");
}