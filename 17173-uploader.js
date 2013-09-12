/* 17173 uploader */

var ctor
	, async = require("async")
	, cheerio = require("cheerio")
	, crypto = require('crypto')
	, fork = require('child_process').fork
	, fs = require("fs")
	, iconv = require('iconv-lite')
	, logger = require("./logger.js")
	, path = require("path")
	, request = require("request")
	, url = require("url")
	, util = require("util")
	, http = require("http")
	, clc = require('cli-color')

	, context = require("./context.js")
	, enums = require("./enums.js")

	, md5
	, randomString

	, doUpload
	, postMultipart
	, uploadFile
	, formatBytes
	, formatSeconds

	, uploadingVids = []
	, uploadProgress = {}

	// constants
	, LOGIN_URL = "http://passport.sohu.com/sso/login.jsp?userid=%s&password=%s&appid=1029&persistentcookie=0&s=1377093296152&b=7&w=1920&pwdtype=1&v=26"
	, PLOGIN_URL = "http://17173.tv.sohu.com/plogin.php"
	, CONTROL_PAGE_URL = "http://17173.tv.sohu.com/control/"
	, UPLOAD_PAGE_URL = "http://17173.tv.sohu.com/control/upload.php"

	, lastInitUpload = new Date()

	, HEART_BEAR_INT = 30000
	, FOLDER_LOOP_INT = 10000
	, MAX_UPLOAD_SESSIONS = 3;

md5 = function (str) {
	var md5sum = crypto.createHash('md5');
	md5sum.update(str);
	str = md5sum.digest('hex');
	return str;
};

randomString = function (size) {
	size = size || 6;
	var code_string = 'ABCDEFabcdef0123456789';
	var max_num = code_string.length + 1;
	var new_pass = '';
	while (size > 0) {
		new_pass += code_string.charAt(Math.floor(Math.random() * max_num));
		size--;
	}
	return new_pass;
};

ctor = function (dataPath, dateString, username, password) {
	this.dataPath = dataPath;
	this.dateString = dateString;
	this.username = username;
	this.password = password;

	console.log(clc.reset);
};

ctor.prototype.work = function () {
	var self = this;

	this.jar = request.jar();
	request = request.defaults({jar: this.jar, encoding: null});

	async.waterfall([
		// login
		function (callback) {
			logger.info(util.format("Logging in 17173 [%s]...", self.username));

			var passwordMd5 = md5(self.password);

			request.get(util.format(LOGIN_URL, self.username, passwordMd5), function (error, response, body) {
				if (!error && response.statusCode === 200) {
					var decoded = iconv.decode(body, "gb2312");
					if (decoded.indexOf("login_status='success'") > 0) {
						logger.info("Login success!");

						request.get(PLOGIN_URL, function (error, response) {
							// var cookies = response.headers["Set-Cookie"];
							callback(null);
						});
					} else {
						logger.error("Login failed!");
						callback("LOGIN_FALIED");
					}
				}
			});
		},
		function (callback) {
			// setup hearbeat
			setInterval(function () {
				request.get(CONTROL_PAGE_URL);
			}, HEART_BEAR_INT);

			var folderLoop = function () {
				var pathOfDate = context.getPathOfDate(self.dataPath, self.dateString),
					paths = fs.readdirSync(pathOfDate),
					taskPath, i, s, ctx;

				for (i = 0; i < paths.length; i++) {
					taskPath = path.join(pathOfDate, paths[i]);
					s = fs.statSync(taskPath);
					if (s.isDirectory() && context.existsContext(taskPath)) {
						ctx = context.loadContext(taskPath);
						if (ctx &&
							(ctx.status === enums.TASK_STATUS.Downloaded ||
							(ctx.status === enums.TASK_STATUS.Uploading && uploadingVids.indexOf(ctx.videoId) < 0)) &&
							uploadingVids.length < MAX_UPLOAD_SESSIONS) {

							self.initUpload(taskPath, ctx);

							lastInitUpload = new Date();
						}
					}
				}

				if (new Date() - lastInitUpload > 10 * 60 * 1000 /* 10 min */) {
					process.exit();
				}
			};

			folderLoop();

			// setup folder loop
			setInterval(folderLoop, FOLDER_LOOP_INT);

			// setup status display
			setInterval(function () {
				var vid, p, disp, rate, eta, i, bars, lines = 0,
					cols = process.stdout.columns;
				for (vid in uploadProgress) {
					bars = "";
					p = uploadProgress[vid];
					if (typeof p === "string") {
						disp = p;
					} else if (typeof p === "object") {
						rate = p.elapsed === 0 ? 0 : p.transfered / p.elapsed,
						eta = rate > 0 ?
							(p.totalFileSize - p.transfered) / (p.transfered / p.elapsed) : 0;
						disp = util.format("U:%s/%s (%s) UL:%s/s ETA:%s",
							formatBytes(p.transfered), formatBytes(p.totalFileSize),
							Math.round(100 * p.transfered / p.totalFileSize, 2) + "%",
							formatBytes(rate),
							formatSeconds(eta));
						disp = util.format(" ID: %s %s", vid.substr(0, 6), disp);
					}

					for (i = 0; i < cols - disp.length - 1; i++) {
						bars += " ";
					}

					console.log(disp + bars);

					lines++;
				}
				process.stdout.write(clc.move(0, -lines));
			}, 1000);

			callback(null);
		}
	]);
};

ctor.prototype.initUpload = function (taskPath, ctx) {
	var basename = path.basename(taskPath),
		myusername, myuserpass,
		i, uctx, cookie;

	for(i = 0; i < this.jar.cookies.length; i++) {
		cookie = this.jar.cookies[i];
		if (cookie.name === "my_username") {
			myusername = cookie.value;
			continue;
		}

		if (cookie.name === "my_userpass") {
			myuserpass = cookie.value;
			continue;
		}
	}

	uctx = {
		"title": util.format("[大挪移]漫猫SD敢达 作战视频 %s %s %s", this.dateString, basename, ctx.additionalTitleInfo),
		"videoFilePath": path.join(taskPath, ctx.videoFileName),
		"myusername": myusername,
		"myuserpass": myuserpass,
		"videoId": ctx.videoId,
		"taskPath": taskPath
	};

	uploadingVids.push(ctx.videoId);

	ctx.status = enums.TASK_STATUS.Uploading;
	ctx.uploadStarted = new Date();

	context.saveContext(taskPath, ctx);

	doUpload(uctx);
};

doUpload = function (uctx) {
	async.waterfall([
		// access upload page, get real ip
		function (callback) {
			request.get(UPLOAD_PAGE_URL, function (error, res, body) {
				if (error) {
					callback("GET Real IP Failed: " + error);
				} else if (res.statusCode === 200) {
					var decoded = iconv.decode(body, "gb2312"),
						realUploadPageUrl, realUploadServerHost;
					decoded.match(/'(http[\w\W]+?)'/);
					realUploadPageUrl = RegExp.$1;
					realUploadPageUrl = url.parse(realUploadPageUrl);

					realUploadServerHost = realUploadPageUrl.host;

					callback(null, realUploadServerHost);
				}
			});
		},
		// upload_2
		function (uploadServerHost, callback) {
			// var upload2Url = url.parse("http://" + uploadServerHost + "/upload_2.php");
			// upload2Url.query = util.format("user=%s&pass=%s&ismp3=0", uctx.myusername, uctx.myuserpass);

			var upload2UrlString = url.format({
				"protocol": "http",
				"host": uploadServerHost,
				"pathname": "/upload_2.php",
				"search": util.format("user=%s&pass=%s&ismp3=0", uctx.myusername, uctx.myuserpass)
			});

			postMultipart(upload2UrlString, {
				"txtTitle": uctx.title,
				"txtbclass": "1",
				"txtGame1": "10278",
				"txtgamename1": "SD",
				"h_selectnum1": "492",
				"h_selectnum3": "0",
				"h_selectnum2": "0",
				"h_selectnum4": "0",
				"txtGame12": "0",
				"txtTag1": "SD",
				"txtTag2": "",
				"txtTag3": "",
				"txtTag4": "",
				"txtTag5": "",
				"txtComment": uctx.title,
				"txtComefrom": "1"
			}, "gb2312", function (res, body) {
				if (res.statusCode === 200) {
					body.match(/FlashVars=\"([^\"]+)\"/);
					var flashVars = RegExp.$1;
					// console.log(flashVars);
					callback(null, uploadServerHost, flashVars);
				}
			});

		},
		// upload_init
		function (uploadServerHost, uploadInitParameters, callback) {
			var extname = path.extname(uctx.videoFilePath).replace(/^\./, ""),
				basename = path.basename(uctx.videoFilePath),
				uploadInitUrl = url.format({
					"protocol": "http",
					"host": uploadServerHost,
					"pathname": "/uploadinit.php",
					"search": uploadInitParameters + "&extendname=" + extname
				});

			uploadFile(uploadInitUrl, uctx.videoFilePath, "Filedata", "application/octet-stream",
			{
				"Filename": basename,
				"Upload": "Submit Query"
			}, "gb2312",
			/* progress */
			function (progress) {
				uploadProgress[uctx.videoId] = progress;
			},
			/* finished*/
			function (res, body) {
				if (res.statusCode === 200) {
					// console.log(body);
					callback(null, uploadServerHost, uploadInitParameters);
				} else {
					// failed?
					callback("UPLOAD_FAILED");
				}
			},
			/* error */
			function (err) {
				uploadProgress[uctx.videoId] = "Error occurred, retry in 5s...";
				setTimeout(function () {
					var ctx = context.loadContext(uctx.taskPath);
					ctx.status = enums.TASK_STATUS.Downloaded;
					context.saveContext(uctx.taskPath, ctx);

					uploadingVids.splice(uploadingVids.indexOf(uctx.videoId), 1);
				}, 5000);
			});

		},
		// uploaded
		function (uploadServerHost, uploadInitParameters, callback) {
			var extname = path.extname(uctx.videoFilePath).replace(/^\./, ""),
				size = fs.statSync(uctx.videoFilePath).size,
				uploadedUrl = url.format({
					"protocol": "http",
					"host": uploadServerHost,
					"pathname": "/uploaded.php",
					"search": uploadInitParameters + "&size=" + size + "&extendname=" + extname
				}), ctx;
			request.get(uploadedUrl, function (error, res, body) {
				if (!error && res.statusCode === 200) {
					var decoded = body + ""; // iconv.decode(body, "gb2312");
					if (decoded.indexOf("flag=1") >= 0) {
						uploadProgress[uctx.videoId] = "Upload success!";
					} else if (decoded.indexOf("flag=2") >= 0) {
						uploadProgress[uctx.videoId] = "Upload success, no need to encode!";
					} else if (decoded.indexOf("flag=3") >= 0) {
						uploadProgress[uctx.videoId] = "Upload success, duplicated!";
					} else {
						uploadProgress[uctx.videoId] = decoded;
					}

					// upload context
					ctx = context.loadContext(uctx.taskPath);
					ctx.status = enums.TASK_STATUS.Uploaded;
					ctx.uploadFinished = new Date();
					context.saveContext(uctx.taskPath, ctx);

					uploadingVids.splice(uploadingVids.indexOf(uctx.videoId), 1);
				}
			});
		}
	]);
};


postMultipart = function (urlstring, form, encoding, callback) {
	var boundary = "---------------------------" + randomString(7),
		boundaryBuffer = new Buffer("\r\n--" + boundary + "\r\n"),
		trailerBuffer = new Buffer("\r\n--" + boundary + "--\r\n"),
		formdataTemplate = "Content-Disposition: form-data; name=\"%s\"\r\n\r\n%s",
		theUrl = url.parse(urlstring),
		contentLength = 0, sendingBuffer, arrayOfBuffers = [],
		client, k, fi, buf;

	for (k in form) {
		arrayOfBuffers.push(boundaryBuffer);
		fi = util.format(formdataTemplate, k, form[k]);
		arrayOfBuffers.push(iconv.encode(fi, encoding));
	}
	arrayOfBuffers.push(boundaryBuffer);
	arrayOfBuffers.push(trailerBuffer);

	sendingBuffer = Buffer.concat(arrayOfBuffers);

	client = http.request({
		host: theUrl.host,
		method: "POST",
		path: theUrl.path,
		headers: {
			"Content-Type": "multipart/form-data; boundary=" + boundary,
			// "Referer": referer,
			"User-Agent": "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.57 Safari/537.36",
			"Content-Length": sendingBuffer.length
		}
	});

	client.write(sendingBuffer);

	client.on("response", function(res) {
		var arrayOfBuffers = [];

		res.on("data", function (chunk) {
			arrayOfBuffers.push(chunk);
		});

		res.on("end", function () {
			var buffer = Buffer.concat(arrayOfBuffers);
			if (callback && typeof callback === "function") {
				callback(res, iconv.decode(buffer, encoding));
			}
		});
	});

	client.on('error', function(e) {
		console.log('problem with request: ' + e.message);
	});

	client.end();
};

uploadFile = function (urlstring, filePath, paramName, contentType, form, encoding, progressCallback, finishCallback, errorCallback) {
	var boundary = "---------------------------" + randomString(7),
		boundaryBuffer = new Buffer("\r\n--" + boundary + "\r\n"),
		trailerBuffer = new Buffer("\r\n--" + boundary + "--\r\n"),
		formdataTemplate = "Content-Disposition: form-data; name=\"%s\"\r\n\r\n%s",
		fileHeaderTemplate = "Content-Disposition: form-data; name=\"%s\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n",
		theUrl = url.parse(urlstring),
		contentLength = 0,
		bufferArrayBeforeFile = [], bufferBeforeFile,
		filename, filestat, filesize, client, k, fi, buf, started, transfered = 0;

	for (k in form) {
		bufferArrayBeforeFile.push(boundaryBuffer);
		fi = util.format(formdataTemplate, k, form[k]);
		bufferArrayBeforeFile.push(iconv.encode(fi, encoding));
	}
	bufferArrayBeforeFile.push(boundaryBuffer);

	filename = path.basename(filePath);
	fi = util.format(fileHeaderTemplate, paramName, filename, contentType);
	bufferArrayBeforeFile.push(iconv.encode(fi, encoding));

	bufferBeforeFile = Buffer.concat(bufferArrayBeforeFile);

	filestat = fs.statSync(filePath);
	filesize = filestat.size;

	contentLength = filesize + bufferBeforeFile.length + trailerBuffer.length;

	started = new Date();

	client = http.request({
		host: theUrl.host,
		method: "POST",
		path: theUrl.path,
		headers: {
			"Connection": "close",
			"Content-Length": contentLength,
			"Content-Type": "multipart/form-data; boundary=" + boundary,
			"User-Agent": "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.57 Safari/537.36"
		}
	});

	client.write(bufferBeforeFile);

	fs.createReadStream(filePath, {bufferSize: 4096})
	.on("data", function (chunk) {
		transfered += chunk.length;
		if (progressCallback && typeof progressCallback === "function") {
			progressCallback({
				"totalFileSize": filesize,
				"transfered": transfered,
				"elapsed": (new Date() - started) / 1000
			});
		}
	})
	.on("end", function () {
		client.end(trailerBuffer);
	})
	.on("error", function (err) {
		// console.log("Upload File Error: " + err);
		if (errorCallback && typeof errorCallback === "function") {
			errorCallback(err);
		}
	})
	.pipe(client, {end: false});

	client.on("response", function(res) {
		if (res.statusCode === 200) {
			var arrayOfBuffers = [];

			res.on("data", function (chunk) {
				arrayOfBuffers.push(chunk);
			});

			res.on("end", function () {
				var buffer = Buffer.concat(arrayOfBuffers);
				if (finishCallback && typeof finishCallback === "function") {
					finishCallback(res, iconv.decode(buffer, encoding));
				}
			});
		} else {
			if (errorCallback && typeof errorCallback === "function") {
				errorCallback("Status Code: " + res.statusCode);
			}
		}
	});
};

formatBytes = function (num) {
	var suffix, size = num,
		oneKiloByte = 1024,
		oneMegeByte = oneKiloByte * oneKiloByte,
		oneGigaByte = oneMegeByte * oneKiloByte;

	if (num > oneGigaByte) {
		size /= oneGigaByte;
		suffix = "GB";
	} else if (num > oneMegeByte) {
		size /= oneMegeByte;
		suffix = "MB";
	} else if (num > oneKiloByte) {
		size /= oneKiloByte;
		suffix = "KB";
	} else {
		suffix = "B";
	}

	return Math.round(size, 2) + suffix;
};

formatSeconds = function (num) {
	var min = 60, hour = 60 * min,
		day = 24 * hour,
		days, hours, mins, secs, left = num;

	days = parseInt(left / day, 10);
	left = left % day;

	hours = parseInt(left / hour, 10);
	left = left % hour;

	mins = parseInt(left / min, 10);
	left = left % min;

	secs = parseInt(left, 10);

	if (days) {
		return util.format("%sd %s:%s:%s", days, hours, mins, secs);
	} else {
		return util.format("%s:%s:%s", hours, mins, secs);
	}
};

exports.ctor = ctor;

/**
E:\Workspace\GD6\GDSite\GD.VideoMover2
node main --mode U --path d:\temp --17173user comicatas@17173.com --17173pass 222222

*/