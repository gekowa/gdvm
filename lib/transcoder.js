// transcoder


var logger = require("./logger.js")
	, async = require("async")
	, context = require("./context.js")
	, enums = require("./enums.js")
	, fs = require("fs")
	, path = require("path")
	, _ = require("underscore")

	, ctor
	;

ctor = function (dataPath, dateString) {
	this.dataPath = dataPath;
	this.dateString = dateString;
};

ctor.prototype.work = function () {
	var pathOfDate = context.getPathOfDate(this.dataPath, this.dateString),
		paths = fs.readdirSync(pathOfDate),
		waterfallFuncs = [];

	_.each(paths, function (thePath, i) {
		var taskPath = path.join(pathOfDate, thePath),
			s = fs.statSync(taskPath),
			ctx;

        // if (!/daum/.test(thePath)) {
        // 	logger.info("Not Daum video, skip. path:" + thePath + "" );
        // 	return;
        // }

		if (s.isDirectory() && context.existsContext(taskPath)) {
			ctx = context.loadContext(taskPath);


			if (ctx) {
				waterfallFuncs.push(function (callback) {
					logger.info("Begin transcoding...");

					var videoFileName = ctx.videoFileName,
						videoFilePath = path.join(taskPath, videoFileName);

					if (!fs.existsSync(videoFilePath)) {
						logger.info("Video file doesn't exist. " + videoFilePath);
						return callback(null);
					}

					logger.info("Transcoding...[" + videoFilePath + "]");

					context.transcodeVideo(videoFilePath, "2500", function (newFilePath) {
						var staticVideoFilename = "video.mp4";
						// swap file
						fs.unlinkSync(videoFilePath);
						fs.renameSync(newFilePath, path.join(taskPath, staticVideoFilename));

						// update context
						ctx = context.loadContext(taskPath);
						ctx = _.extend(ctx, {
							"status": enums.TASK_STATUS.PendingUpload,
							// "downloadFinished": new Date(),
							"videoFileName": staticVideoFilename
						});

						context.saveContext(taskPath, ctx);

						logger.info("Transcode finished. [" + videoFilePath + "]");
						callback(null);
					});
				});
			}
		}
	});

	async.waterfall(waterfallFuncs);
};

exports.ctor = ctor;