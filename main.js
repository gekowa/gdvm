var program = require("commander"),
	logger = require("./logger.js"),
	path = require("path"),
	mode, from, dataPath, now, dateString,
	username, password,
	downloaderCtor, downloader, uploader,
	i;

program
	.version('0.0.1')
	.option('-m, --mode <mode>', 'Program running mode, (U)pload or (D)ownload.')
	.option('-f, --from <from>', 'Video origin, should be (Daum) or (Naver).')
	.option('--path <path>', 'Working path.')
	.option('-d, --date <date>', 'Speicify working date.')
	.option("--17173user <17173user>", "Specify 17173 username.")
	.option("--17173pass <17173pass>", "Specify 17173 password.")
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

	username = program["17173user"];
	password = program["17173pass"];

	if (!username || !password) {
		logger.error("Must provide 17173 username and password.");
		process.exit(1);
	}

	uploader = new (require("./17173-uploader.js").ctor)(dataPath, dateString, username, password);
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
