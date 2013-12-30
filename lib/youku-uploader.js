var ctor
	, async = require("async")
	// , cheerio = require("cheerio")
	, crypto = require('crypto')
	// , fork = require('child_process').fork
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

	, LOGIN_URL = "http://www.youku.com/index/mlogin"
	, USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25"
	;

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

	// login
	async.waterfall([
		// login
		function (callback) {
			request.post({
				url: LOGIN_URL,
				form: {
					"username": self.username,
					"password": self.password,
					"captcha": "",
					"callback": "login().subresult"
				},
				headers: {
					"User-Agent": USER_AGENT
				}
			}, function (error, res, body) {
				if (!error && res.statusCode === 200) {
					body = body.toString();
					if (body.indexOf("parent.login().subresult(1)") >= 0) {
						// login success
						logger.info("Loggin success!");
						callback(null);
					}
				} else {
					logger.error("Loggin success!");
					callback("Login failed.");
				}

			});
		},
		function (callback) {

		}
	]);
};

exports.ctor = ctor;