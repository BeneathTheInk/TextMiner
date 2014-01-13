var _ = require("underscore"),
	cheerio = require("cheerio"),
	https = require("https"),
	readability = require('readability-api'),
	Promise = require("bluebird");

var mediumURL = "https://medium.com/",
	redis_key = "medium_articles";

readability.configure({
    consumer_key: 'MrGalaxy',
    consumer_secret: 'wZTsRuqtNHWM7y5X7U4gDm8AA9gapeUy',
    parser_token: 'b2d83e6faab44ec9ca4f33a2c9eae90baac1232d'
});

var parser = new readability.parser(),
	parse = Promise.promisify(parser.parse, parser);

module.exports = function(name, dict) {
	var cmd = this,
		isRunning = false,
		running = null,
		isForever = cmd.interval != null,
		timer = null,
		resolver = Promise.defer(),
		promise = resolver.promise,
		stats = { count: 0, phrases: [ 0, 0 ] };

	// Cleans up
	var finish = _.once(function() {
		clearInterval(timer);
		if (isRunning) running.cancel().finally(function() { resolver.resolve(); });
		else resolver.resolve();
	});

	// Run the whole thing once
	function run() {
		if (isRunning) return;
		isRunning = true;

		running = Promise.resolve(name)
			.cancellable()
			.then(collect)
			.filter(filterNewArticles)
			.then(function(articles) {
				if (articles.length)
					console.log(articles.length + " new articles detected in \"" + name + "\" collection.\n");
				
				return articles;
			})
			.then(eachSeries(function(article, i, len) {
				var time = new Date;
				console.log("[ " + (i + 1) + " / " + len + " ] - " + time.format("{Mon} {d}, {HH}:{mm}:{ss}"));
				console.log("Parsing article \"" + article.title + "\"");
				stats.count++;

				return parseArticle(article.id, name, dict, cmd.maxPhraseLength)
					.then(function(s) {
						console.log(s[0].format() + " phrases parsed and added. " + unique(s) + "% unique.");
						console.log("That took " + (new Date - time) + "ms.");
						console.log();

						stats.phrases = reduceStats(stats.phrases, s);
					})
					.catch(function(err) {
						console.log("Error while parsing article \"" + article.title + "\"");
						console.error(err.stack);
						console.log();
					})
					.delay(5000); // Force a 5 second wait
			}))
			.then(function() {
				isRunning = false;
				running = null;
			})
			.catch(function(err) {
				if (!(err instanceof Promise.CancellationError)) {
					console.log("An error occured:");
					console.error(err.stack);
					console.log();
				}

				finish();
			});
	}

	// run once
	console.log();
	run();

	// Detect ctrl-c signal
	process.once('SIGINT', finish);

	// display stats when the main promise is resolved
	promise = promise.finally(function() {
		console.log();
		console.log("Stats:");
		console.log("  " + stats.count.format() + " articles parsed.");
		console.log("  " + stats.phrases[0].format() + " total phrases added. " + unique(stats.phrases) + "% unique.");
		console.log();
	});

	// setup forever or resolve immediately
	if (isForever) timer = setInterval(run, cmd.interval * 60 * 1000);
	else running.then(finish);

	return promise;
}

function parseArticle(id, name, dict, maxLength) {
	return saveArticle(id)
		.then(function() { return extractText(id, name); })
		.map(function(val) { return dict.parse(val, maxLength); })
		.reduce(reduceStats, [ 0, 0 ]);
}

function collect(name) {
	var url = mediumURL + "feed/" + name;
	return XMLRequest(url).then(function(data) {
		var $ = cheerio.load(data),
			articles = [];

		$("rss channel item").each(function() {
			var el = $(this), m, id, title;

			// Get the id
			var link = el.find("guid").text().trim();
			m = link.match(/[a-f0-9]+$/i);
			if (m == null) throw new Error("Invalid URL: " + link);
			id = m[0];

			// Get the title
			var cdata = el.find("title").html().trim(), title;
			m = cdata.match(/^\<\!\-\-\[CDATA\[(.*?)\]\]\-\-\>$/)
			if (m == null) title = cdata;
			else title = m[1];

			articles.push({ id: id, title: title });
		});

		return articles;
	});
}

function extractText(id, col) {
	var url = mediumURL + col + "/" + id;
	return parse(url).then(function(data) {
		var parts = [];

		parts.push(data.title);
		if (!_.isEmpty(data.dek)) parts.push(data.dek) 

		var $ = cheerio.load(data.content),
			els = $("p, ul li, ol li, dl dd");
		
		els.each(function() {
			parts.push($(this).text());
		});

		return parts;
	});
}

// Returns *true* for articles which are *not* in the redis set
function filterNewArticles(a, i) {
	if (_.isEmpty(a)) throw new Error("Invalid article.");

	var resolver = Promise.defer();
	redis.sismember(redis_key, a.id, function(err, result) {
		if (err != null) resolver.reject(err);
		else resolver.resolve(result === 1 ? false : true);
	});
	return resolver.promise;
}

function saveArticle(id) {
	var resolver = Promise.defer();
	redis.sadd(redis_key, id, resolver.callback);
	return resolver.promise;
}

function reduceStats(memo, n) {
	memo[0] += n[0];
	memo[1] += n[1];
	return memo;
}

function XMLRequest(url, cb) {
	var resolver = Promise.defer(),
		promise = resolver.promise;

	https.get(url, function(res) {
		var data = "";
		
		res.on("error", function(err) { resolver.reject(err) });

		res.on("data", function(chunk) {
			data += chunk.toString("utf-8");
		});

		res.on("end", function() {
			try { resolver.resolve(data); }
			catch (e) { resolver.reject(e) }
		});
	}).on("error", function(err) { resolver.reject(err) });

	promise.nodeify(cb);
	return promise;
}

function eachSeries(fn) {
	var arr, i = 0;

	function loop() {
		if (i >= arr.length) return Promise.resolve(arr);
		var val = arr[i];

		return Promise
			.try(function() { return fn.call(this, val, i++, arr.length); })
			.cancellable()
			.then(loop);
	}

	return function(res) {
		arr = res;
		return loop();
	}
}

function mapSeries(fn) {
	var values = [];

	var loop = eachSeries(function(v, i) {
		var p = fn.apply(this, arguments);
		p = p.then(function(val) { values[i] = val; });
		return p;
	});

	return function() {
		return loop.apply(this, arguments).return(values);
	}
}

function unique(stats) {
	return stats[0] !== 0 ? Math.round((stats[1] / stats[0]) * 100) : 0;
}