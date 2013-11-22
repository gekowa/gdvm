var config = {
  levels: {
    silly: 0,
    verbose: 1,
    info: 2,
    data: 3,
    warn: 4,
    debug: 5,
    error: 6
  },
  colors: {
    silly: 'magenta',
    verbose: 'cyan',
    info: 'green',
    data: 'grey',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
  }
}, winston = require("winston"),
	logger = new (winston.Logger)({
		transports: [
			new (winston.transports.Console)({
				colorize: true
			}),
			new (winston.transports.File)({ filename: 'gdvm-' + new Date().toISOString().replace(/T[\w\W]+Z/, '').replace(/-/g, '') + '.log' })
		],
		levels: config.levels,
		colors: config.colors
	});

module.exports = logger;
