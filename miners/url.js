var _ = require("underscore"),
	cheerio = require("cheerio"),
	readability = require('readability-api'),
	Promise = require("bluebird");

readability.configure({
    consumer_key: 'MrGalaxy',
    consumer_secret: 'wZTsRuqtNHWM7y5X7U4gDm8AA9gapeUy',
    parser_token: 'b2d83e6faab44ec9ca4f33a2c9eae90baac1232d'
});

var parser = new readability.parser(),
	parse = Promise.promisify(parser.parse, parser);

module.exports = function(url, dict) {
	if (!_.isString(url) || url === "")
		throw new Error("Expecting url to parse.");

	return parse(url).then(function(parsed) {
		var $ = cheerio.load(parsed.content),
			els = $('p, h1, h2, h3, h4, h5, h6, ul li, ol li, dl dt, dl dd');

		els.each(function() {
			console.log($(this).text());
		});
	});
}