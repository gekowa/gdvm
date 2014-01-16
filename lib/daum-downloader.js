/* daum downloader*/


var logger = require("./logger.js")
	, request = require("request").defaults({jar: true})
	, async = require("async")
	, cheerio = require("cheerio")
	, fs = require("fs")
	, _ = require("underscore")
	, xml2js = require("xml2js")
	, util = require("util")
	, path = require("path")

	, context = require("./context.js")
	, enums = require("./enums.js")

	, ctor

	// functions
	, processPage
	, processClipIds

	/* constants*/
	,VIDEO_LIST_URL = "http://tvpot.daum.net/search/json/SearchResultJSON.do?service=clip&q=sd%EA%B1%B4%EB%8B%B4&dateterm=day&size=30"
	, MOVIE_LOCATION = "http://videofarm.daum.net/controller/api/open/v1_2/MovieLocation.apixml?vid=%s&profile=HIGH&play_loc=tvpot"
	, VIDEO_PROVIDER = "daum"
	;

// profile MAIN 360+ BASE 360 HIGH 720(HD) LOW 240

ctor = function (dataPath, dateString) {
	this.dataPath = dataPath;
	this.dateString = dateString;
};

processPage = function (pageIndex, callback) {
	console.log("Processing page " + (pageIndex));
	request.get(VIDEO_LIST_URL + "&page=" + pageIndex, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			// console.log(jquery);
			var returnObj = eval("(" + body + ")"),
				contents = returnObj.contents,
				clipIds = [],
				$ = cheerio.load(contents);

			$("dl").each(function (index, element) {
				void(index);
				clipIds.push(element.attribs.id);
			});

			logger.info("Found %s video(s).", clipIds.length);



			if (clipIds.length === 30) {
				callback(null, clipIds);
				processPage(pageIndex + 1, callback);
			} else {
				callback(null, clipIds, true);
			}
		} else {
			callback(error);
		}
	});
};

processClipIds = function (self, clipIds) {
	if(clipIds.length === 0) {
		return;
	}

	var xmlParser = new xml2js.Parser(),
		waterfallFuncs = [];

	_.each(clipIds, function (clipId, i) {
		var clipIdParts, realId, friendlyId, ctx;

		logger.info("Prepare video No.%s", i + 1);

		clipIdParts = clipId.split("|");
		if(clipIdParts.length < 3) {
			// logger.error("ClipId parse error: not < 3");
			return;
		}

		realId = clipIdParts[1].replace(/_$/, '');
		friendlyId = clipIdParts[2].replace(/_$/, '');

		ctx = context.initTaskPath(self.dataPath, self.dateString, friendlyId, VIDEO_PROVIDER);
		if (ctx.status &&
			(ctx.status === enums.TASK_STATUS.Downloaded ||
			 ctx.status === enums.TASK_STATUS.Uploading ||
			 ctx.status === enums.TASK_STATUS.Uploaded)) {
			logger.info("Already downloaded. ID=" + friendlyId);
			return;
		}

		waterfallFuncs.push(
			function (callbackInner) {
				logger.info("Getting video url. ID=" + friendlyId);

				request.get(util.format(MOVIE_LOCATION, realId), function (error, response, body) {
					if (!error && response.statusCode === 200) {
						xmlParser.parseString(body, function (err, result) {
							var status = result.videofarm.info[0].status[0].$.code,
								videoUrl = result.videofarm.result[0].url[0];

							if (!status || status !== "200" || !videoUrl) {
								callbackInner(null);
							}
							callbackInner(null, videoUrl);
						});
					}
				});
			}
		);

		// download
		waterfallFuncs.push(
			function (videoUrl, callbackInner) {
				if (!videoUrl) {
					callbackInner(null);
				}
				logger.info("Begin downloading...");

				var taskPath = context.getTaskPath(self.dataPath, self.dateString, friendlyId, VIDEO_PROVIDER),
					fileExt = context.getExtFromUrl(videoUrl),
					videoFileName = "video" + fileExt,
					videoFilePath = path.join(taskPath, videoFileName),
					ctx;

				logger.info("Downloading..."); //" [" + videoUrl + "] to [" + videoFilePath + "]");
				context.downloadFile(videoUrl, videoFilePath, function () {
					// update context
					ctx = context.loadContext(taskPath);
					ctx = _.extend(ctx, {
						"status": enums.TASK_STATUS.Downloaded,
						"downloadFinished": new Date(),
						"videoFileName": "video" + fileExt
					});

					context.saveContext(taskPath, ctx);

					callbackInner(null);
					logger.info("Download finished.");
				});
			}
		);

		// transcode
		waterfallFuncs.push(
			function (callbackInner) {
				logger.info("Begin transcoding...");

				var taskPath = context.getTaskPath(self.dataPath, self.dateString, friendlyId, VIDEO_PROVIDER),
					ctx = context.loadContext(taskPath),
					videoFileName = ctx.videoFileName,
					videoFilePath = path.join(taskPath, videoFileName);

				ctx.status = enums.TASK_STATUS.Transcoding;
				context.saveContext(taskPath, ctx);

				logger.info("Transcoding..."); //" [" + videoUrl + "] to [" + videoFilePath + "]");
				context.transcodeVideo(videoFilePath, "2500", function (newFilePath) {
					var staticVideoFilename = "video.mp4";
					// swap file
					fs.unlinkSync(videoFilePath);
					fs.renameSync(newFilePath, path.join(taskPath, staticVideoFilename));

					// update context
					ctx = context.loadContext(taskPath);
					ctx = _.extend(ctx, {
						"status": enums.TASK_STATUS.Transcoded,
						"transcoded": new Date(),
						"videoFileName": staticVideoFilename
					});

					context.saveContext(taskPath, ctx);

					callbackInner(null);
					logger.info("Transcode finished.");
				});
			}
		);

		waterfallFuncs.push(
			function (callbackInner) {
				var taskPath = context.getTaskPath(self.dataPath, self.dateString, friendlyId, VIDEO_PROVIDER),
					ctx = context.loadContext(taskPath);

				ctx.status = enums.TASK_STATUS.PendingUpload;

				context.saveContext(taskPath, ctx);
				callbackInner(null);
			}
		);
		// console.log("arranged " + i);
	});

	async.waterfall(waterfallFuncs);
};

ctor.prototype.work = function () {
	var self = this,
		allClipIds = [];

	async.waterfall([
		function (callback) {
			processPage(1, function (error, clipIds, done) {
				var i;
				if (!error) {
					for (i = 0; i < clipIds.length; i++) {
						allClipIds.push(clipIds[i]);
					}
				}

				if (done) {
					// console.log("Going next step!");
					callback(null);
				}
			});
		},
		// process all clip ids
		function (callback) {
			processClipIds(self, allClipIds);
			callback(null);
		}
	]);
};

exports.ctor = ctor;