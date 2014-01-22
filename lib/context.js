var path = require("path"),
	fs = require("fs"),
	os = require("os"),
	_ = require("underscore"),
	mkdirp = require("mkdirp"),
	url = require("url"),
	spawn = require('child_process').spawn,
	util = require("util"),

	enums = require("./enums.js"),

	// functions
	getPathOfDate,
	getTaskPath,
	initTaskPath,

	existsContext,
	loadContext,
	saveContext,

	downloadFile,
	transcodeVideo,

	getExtFromUrl,

	platform = os.platform(),

	// constants
	CONTEXT_FILENAME = "context.json",
	CONTEXT_TEMPLATE = {
		"status": "0",
		"videoFilePath": "",
		"videoFileName": "",
		"videoId": "",
		"downloadStarted": "",
		"downloadFinished": "",
		"uploadStarted": "",
		"uploadFinished": "",
		"additionalTitleInfo": ""
	};

getDateString = function () {
	var dateString = "", now, year, month, day;
	now = new Date();
	year = now.getFullYear();
	month = 1 + now.getMonth() + "";
	if (month.length === 1) {
		month = "0" + month;
	}
	day = now.getDate() + "";
	if (day.length === 1) {
		day = "0" + day;
	}
	return year + month + day;
};

getPathOfDate = function (dataPath, dateString) {
	return path.join(dataPath, dateString);
};

existsContext = function (taskPath) {
	return fs.existsSync(path.join(taskPath, CONTEXT_FILENAME));
};

loadContext = function (taskPath) {
	var contextFile = path.join(taskPath, CONTEXT_FILENAME),
		fileContent;
	if (fs.existsSync(contextFile)) {
		fileContent = fs.readFileSync(contextFile, {
			"endoding": "utf-8"
		});

		return eval("(" + fileContent + ")");
	}
	return null;
};

saveContext = function (taskPath, context) {
	var contextFile = path.join(taskPath, CONTEXT_FILENAME);
	fs.writeFileSync(contextFile, JSON.stringify(context), {
		"encoding": "utf-8"
	});
};

getTaskPath = function (dataPath, dateString, vid, videoProvider)  {
	var shorterVid = vid.substr(vid.length - Math.min(7, vid.length), Math.min(6, vid.length)),
		taskPath = path.join(getPathOfDate(dataPath, dateString), videoProvider + "_" + shorterVid);
	return taskPath;
};

initTaskPath = function (dataPath, dateString, vid, videoProvider) {
	var taskPath = getTaskPath(dataPath, dateString, vid, videoProvider),
		context;

	if (!fs.existsSync(taskPath)) {
		mkdirp.sync(taskPath);
	}

	if (existsContext(taskPath)) {
		context = loadContext(taskPath);
		return context;
	} else {
		context = _.extend(CONTEXT_TEMPLATE, {
			"videoId": vid,
			"status": enums.TASK_STATUS.Downloading,
			"downloadStarted": new Date()
		});
		saveContext(taskPath, context);
		return context;
	}
};

getExtFromUrl = function (urlString) {
	var u = url.parse(urlString);
	return u.pathname.match(/\.[^\.]+?$/);
};

downloadFile = function (url, filePath, callback) {
	var aria2c,
		executable,
		dirname = path.dirname(filePath),
		filename = path.basename(filePath);

	if (platform === "win32") {
		executable = "aria2c.exe";
	} else if(platform === "linux") {
		executable = "aria2c";
	}

	aria2c = spawn(path.join(__dirname, "/../bin/", executable),
		[url, "-d " + dirname,  "-o " + filename, "-s 4", "--max-connection-per-server=4", "--file-allocation=none ", "--allow-overwrite=true ", "--summary-interval=0"],
		// util.format("\"%s\" -d \"%s\" -o \"%s\" -s 4 --max-connection-per-server=4 --file-allocation=none --allow-overwrite=true --summary-interval=0", url, dirname, filename),
		{ stdio: ['pipe', process.stdout, process.stderr] });

	aria2c.on("error", function (err) {
		console.log(err);
	});
	aria2c.on("close", function () {
		if (callback && typeof callback === "function") {
			callback.call();
		}
	});
};

transcodeVideo = function (videoFilePath, bitrate, callback) {
	var ffmpeg,
		executable,
		dirname = path.dirname(videoFilePath),
		filename = path.basename(videoFilePath),
		tempFilePath = path.join(dirname, "video-" + Math.random().toString().substr(2, 8) + ".mp4");

	if (platform === "win32") {
		executable = "ffmpeg.exe";
	} else if (platform === "linux") {
		executable = "ffmpeg";
	}
	console.log(videoFilePath);

	ffmpeg = spawn(path.join(__dirname, "/../bin/", executable),
		['-y', '-i', videoFilePath, '-b:v', bitrate + 'k', /*'-minrate', bitrate + 'k', '-maxrate', bitrate + 'k',*/
		'-vcodec', 'libx264', '-preset', 'medium', '-vf', 'scale=max(960\\,iw):trunc(ow/a/2)*2',
		/*'-bufsize', '2000k',*/ '-f', 'mp4', '-acodec', 'libmp3lame', '-b:a', '128k', tempFilePath],
		{ stdio: ['pipe', process.stdout, process.stderr] });

	ffmpeg.on("error", function (err) {
		console.log(err);
	});

	ffmpeg.on("close", function () {
		if (callback && typeof callback === "function") {
			callback.call(undefined, tempFilePath);
		}
	});
};

exports.getDateString = getDateString
exports.getPathOfDate = getPathOfDate;
exports.initTaskPath= initTaskPath;
exports.getTaskPath = getTaskPath;

exports.existsContext = existsContext;
exports.loadContext= loadContext;
exports.saveContext= saveContext;

exports.getExtFromUrl = getExtFromUrl;
exports.downloadFile = downloadFile;
exports.transcodeVideo = transcodeVideo;