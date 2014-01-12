/**
 * Dependencies
 */

var _ = require("underscore"),
	cheerio = require("cheerio"),
	http = require("http"),
	Promise = require("bluebird"),
	Dictionary = require("../lib/dictionary"),
	crypto = require("crypto");

/**
 * Important vars
 */

var wikiUrl = "http://en.wikipedia.org/w/api.php?",
	redis_key = "wiki_padeids",
	max_links = 100;

/**
 * Public API
 */

module.exports = function(startTitle, dict) {
	var cmd = this,
		links = [ startTitle ],
		isRunning = false,
		isForever = cmd.interval != null,
		timer = null,
		resolver = Promise.defer(),
		promise = resolver.promise,
		stats = { count: 0, avgtime: 0, phrases: 0 };

	// Cleans up and displays uages stats
	var finish = function() {
		clearInterval(timer);
		resolver.resolve();
	}

	// Run the whole thing once
	function run() {
		if (isRunning) return;
		isRunning = true;

		var time = new Date;
		console.log(time.format("[{Mon} {d} {HH}:{mm}]"));

		return parseWiki(links, dict, cmd.maxPhraseLength)
			.then(function(phrases) {
				var cnt = stats.count,
					ms = new Date - time;

				stats.phrases += phrases;
				stats.avgtime = (stats.avgtime * cnt + ms) / (cnt + 1);
				stats.count++;

				console.log("That took " + ms + "ms.");
				console.log();

				isRunning = false;
			})
			.catch(function(err) {
				console.log("An error occured:");
				console.error(err.stack);
				console.log();
				finish();
			});
	}

	// run once
	console.log();
	var firstrun = run();

	// detect SIGINT to close properly
	process.on('SIGINT', finish);

	// display stats when the main promise is resolved
	promise = promise.finally(function() {
		console.log("Stats:")
		console.log("  " + stats.count.format() + " entries parsed.");
		console.log("  " + stats.phrases.format() + " total phrases added.");
		console.log("  Average entry took " + stats.avgtime.round() + "ms.");
		console.log();

		// Randomly choose five links to display
		console.log("Potential starting entries:");
		for (var i = 0; i < 5; i++) {
			if (!links.length) break;
			var link = _.first(links.splice(rand(links.length), 1));
			console.log("  \"" + link + "\"");
		}
		console.log();
	});

	// setup forever or resolve immediately
	if (isForever) timer = setInterval(run, cmd.interval * 1000);
	else resolver.resolve(firstrun);

	return promise;
}

/**
 * Core
 */

function parseWiki(links, dict, maxLength) {
	var title, pageid, promise;

	// randomly remove links until size is equal or less than max_links
	while (links.length > max_links) {
		links.splice(rand(links.length), 1);
	}

	// randomly choose links until a valid one is found
	promise = promiseWhile(function() {
		return _.isEmpty(pageid) && links.length;
	}, function() {
		var _title = _.first(links.splice(rand(links.length), 1)),
			_id = null;
		
		return wikiId(_title)
			.then(function(id) {
				_id = id;
				return hasWikiId(id);
			})
			.then(function(result) {
				if (!result) {
					pageid = _id;
					title = _title;
				}
			});
	});

	// get wikipedia data
	promise = promise.then(function() {
		if (pageid == null) throw new Error("No valid link to search.");

		console.log("Parsing wikipedia entry \"" + title + "\"");
		return wikiData(pageid);
	});

	// parse and add phrases
	promise = promise.then(function(data) {
		// Randomly choose three links for later
		for (var i = 0; i < 3; i++) {
			if (!data.links.length) break;
			
			var index = rand(data.links.length),
				link = _.first(data.links.splice(index, 1));

			if (link != null) links.push(link);
		}

		// Parse and add phrases from html
		var $ = cheerio.load("<body>" + data.html + "</body>"),
			els = $("body").children("p, ul li, ol li, dl dt, dl dd"),
			promises = [], count = 0;

		console.log(els.length + " valid elements found.");
		els.each(function(i, el) {
			var $el = $(el);
			$el.find("sup").remove(); // removes all citations

			var words = Dictionary.getWords($el.text()),
				phrases = Dictionary.combineWords(words, maxLength);

			count += phrases.length;
			promises.push(dict.add(phrases));
		});

		return Promise.all(promises)
			.then(function() { return saveWikiId(pageid); })
			.then(function() {
				console.log(count.format() + " phrases parsed and added.");
				return count;
			});
	});

	return promise;
}

/**
 * Helper Functions
 */

Math.random = function() {
	var n = parseInt(crypto.randomBytes(4).toString("hex"), 16);
	return n / Math.pow(2, 4 * 8);
}

function rand(min, max) {
	if (_.isNumber(min) && max == null) {
		max = min;
		min = 0;
	}

	return Math.floor(Math.random() * (max - min) + min);
}

function promiseWhile(condition, action) {
	var resolver = Promise.defer();

	function loop() {
		if (!condition()) return resolver.resolve();
		return Promise.cast(action())
			.then(loop)
			.catch(resolver.reject);
	}

	_.defer(loop);

	return resolver.promise;
}

function JSONRequest(url, cb) {
	var resolver = Promise.defer(),
		promise = resolver.promise;

	http.get(url, function(res) {
		var data = "";
		
		res.on("error", function(err) { resolver.reject(err) });

		res.on("data", function(chunk) {
			data += chunk.toString("utf-8");
		});

		res.on("end", function() {
			try { resolver.resolve(JSON.parse(data)); }
			catch (e) { resolver.reject(e) }
		});
	}).on("error", function(err) { resolver.reject(err) });

	promise.nodeify(cb);
	return promise;
}

function wikiId(title, cb) {
	var url = wikiUrl + "action=query&titles=" + encodeURIComponent(title) + "&prop=info&format=json&redirects";

	return JSONRequest(url).then(function(res) {
		if (!_.isObject(res.query) || !_.isObject(res.query.pages))
			throw new Error("Invalid response.");
		
		return _.chain(res.query.pages).keys().first().value();
	}).nodeify(cb);
}

function wikiData(pageid, cb) {
	var url = wikiUrl + "action=parse&pageid=" + encodeURIComponent(pageid) + "&prop=text|links&format=json";

	return JSONRequest(url).then(function(res) {
		if (!_.isObject(res.parse)) throw new Error("Invalid response.");
		data = res.parse;
		var ret = { id: pageid };

		if (_.isEmpty(data.title))
			throw new Error("Missing title.");
		ret.title = data.title;

		if (!_.isObject(data.text) || _.isEmpty(data.text["*"]))
			throw new Error("Missing html content.");
		ret.html = data.text["*"];

		if (!_.isArray(data.links))
			throw new Error("Missing links.");
		ret.links = _.chain(data.links)
			.filter(function(link) {
				return link.ns === 0 && _.has(link, "exists");
			}).pluck("*").value();

		return ret;
	}).nodeify(cb);
}

function saveWikiId(id) {
	var resolver = Promise.defer();
	redis.sadd(redis_key, id, resolver.callback);
	return resolver.promise;
}

function hasWikiId(id) {
	var resolver = Promise.defer();
	redis.sismember(redis_key, id, function(err, result) {
		if (err != null) resolver.reject(err);
		else resolver.resolve(result === 1 ? true : false);
	});
	return resolver.promise;
}