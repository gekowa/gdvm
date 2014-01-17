var logger = require("./logger.js")
	, request = require("request").defaults({jar: true, headers: {"AcceptEncoding": "deflate"}})
	, async = require("async")
	, cheerio = require("cheerio")
	, fs = require("fs")
	, _ = require("underscore")
	, xml2js = require("xml2js")
	, util = require("util")
	, path = require("path")
	, url = require("url")
	, querystring = require("querystring")

	, context = require("./context.js")
	, enums = require("./enums.js")

	, ctor

	// functions
	, processListPage

	, VIDEO_LIST_URL = "http://video.search.naver.com/search.naver?where=video&sort=&listmode=h&inplayableonly=&playtime=&period=1day&charge=&definition=&selected_cp=-2&ninth_cp=&query=sd%EA%B1%B4%EB%8B%B4&sm=tab_opt&ie=utf8&nso=so%3Ar%2Cp%3A1d&p_theme=&mson=0"
	, PLAYER_PAGE_URL = "http://blog.naver.com/MultimediaFLVPlayer.nhn?blogId=%s&logNo=%s&vid=%s&ispublic=true"
	, PLAYER_XML_URL = "http://serviceapi.nmv.naver.com/flash/play.nhn?vid=%s&inKey=%s"
	, PAGE_SIZE = 16
	, VIDEO_PROVIDER = "naver"
	;

ctor = function (dataPath, dateString) {
	this.dataPath = dataPath;
	this.dateString = dateString;
};

processListPage = function (listPageHtml, d, callback) {
	var $ = cheerio.load(listPageHtml),
		waterfallFuncs = [];
		// thumb120Links = ;

	$("ul#elVideoReportItems a.thmb120").each(function (index, element) {
		var videoLinkHref = element.attribs.href,
			videoLinkUrl = url.parse(videoLinkHref),
			ctx,
			blogId, qs, logNo, vid, taskPath;

		if (videoLinkUrl.host !== "blog.naver.com") {
			logger.warn("Non Naver blog posts, ignore.");
			return;
		}

		blogId = videoLinkUrl.pathname.replace(/^\//, "");
		qs = querystring.parse(videoLinkUrl.query);

		logNo = qs["logNo"];
		vid = qs["jumpingVid"];

		ctx = context.initTaskPath(d.dataPath, d.dateString, vid, VIDEO_PROVIDER);
		if (ctx.status &&
			(ctx.status === enums.TASK_STATUS.Downloaded ||
			 ctx.status === enums.TASK_STATUS.Uploading ||
			 ctx.status === enums.TASK_STATUS.Uploaded)) {
			logger.info("Already downloaded. ID=" + vid);
			return;
		}

		taskPath = context.getTaskPath(d.dataPath, d.dateString, vid, VIDEO_PROVIDER);

		// get player page
		waterfallFuncs.push(function (callbackInner) {
			var playerPageUrl = util.format(PLAYER_PAGE_URL, blogId, logNo, vid);
			request.get(playerPageUrl, function (error, response, body) {
				if (!error && response.statusCode === 200) {
					body.match(/qsParam\.inKey\s*=\s*'(\w+)';/);
					var inKey = RegExp.$1;

					callbackInner(null, inKey);
				}
			});
		});

		// get playxml
		waterfallFuncs.push(function (inKey, callbackInner) {
			var playXmlUrl = util.format(PLAYER_XML_URL, vid, inKey);
			request.get(playXmlUrl, function (error, response, body) {
				if (!error && response.statusCode === 200) {
					var xmlParser = new xml2js.Parser(),
						flvUrl;
					xmlParser.parseString(body, function (err, result) {
						var videoUrl = result.Result.FlvUrl[0];
						callbackInner(null, videoUrl);
					});
				}
			});
		});

		// download
		waterfallFuncs.push(function (videoUrl, callbackInner) {
			logger.info("Begin download...");

			var taskPath = context.getTaskPath(d.dataPath, d.dateString, vid, VIDEO_PROVIDER),
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
					"additionalTitleInfo": blogId,
					"videoFileName": videoFileName
				});

				context.saveContext(taskPath, ctx);

				callbackInner(null);
				logger.info("Download finished.");
			});
		});

		// transcode
		waterfallFuncs.push(
			function (callbackInner) {
				var taskPath = context.getTaskPath(d.dataPath, d.dateString, vid, VIDEO_PROVIDER),
					ctx = context.loadContext(taskPath),
					videoFileName = ctx.videoFileName,
					videoFilePath = path.join(taskPath, videoFileName);

				ctx.status = enums.TASK_STATUS.Transcoding;
				context.saveContext(taskPath, ctx);

				logger.info("Transcoding...[" + videoFilePath + "]");
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
					logger.info("Transcode finished.[" + videoFilePath + "]");
				});
			}
		);

		waterfallFuncs.push(
			function (callbackInner) {
				var taskPath = context.getTaskPath(d.dataPath, d.dateString, vid, VIDEO_PROVIDER),
					ctx = context.loadContext(taskPath);

				ctx.status = enums.TASK_STATUS.PendingUpload;

				context.saveContext(taskPath, ctx);
				callbackInner(null);
			}
		);
	});

	async.waterfall(waterfallFuncs, function () {
		// all done;
		if (callback && typeof callback === "function") {
			callback.call();
		}
	});
};

ctor.prototype.work = function () {
	var self = this,
		waterfallFuncsByPage = [];
	async.waterfall([
		function (callback) {
			request.get(VIDEO_LIST_URL, function (error, response, body) {
				if (!error && response.statusCode === 200) {
					callback(null, body);
				}
			});
		},
		// first page
		function (listPageHtml, callback) {
			logger.info("Page 1");
			processListPage(listPageHtml, self, function () {
				callback(null, listPageHtml);
			});

		},
		// other pages
		function (listPageHtml, callback) {
			// by page
			var $ = cheerio.load(listPageHtml),
				pagingLinks = $("div.paging a"), i, element,
				pagingText, pagingHref, videoListUrl;

			for (i = 0; i < pagingLinks.length; i++) {
				element = pagingLinks[i];
				pagingText = element.children[0].data;
				pagingHref = element.attribs.href;
				videoListUrl = url.parse(VIDEO_LIST_URL);

				if (/\d+$/.test(pagingText)) {
					(function () {
						var _pagingText = pagingText,
							_videoListUrl = videoListUrl,
							_pagingHref = pagingHref;

						waterfallFuncsByPage.push(function (callbackInner) {
							logger.info("Page " + _pagingText);

							_videoListUrl = url.format({
								"protocol": "http",
								"host": _videoListUrl.host,
								"pathname": _videoListUrl.pathname,
								"search": pagingHref
							});

							request.get(_videoListUrl, function (error, response, body){
								processListPage(body, self, function () {
									callbackInner(null);
								});
							});
						});
					}());
				}
			}

			callback(null);
		}
	], function () {
		// when all done
		async.waterfall(waterfallFuncsByPage);
	});
};

exports.ctor = ctor;