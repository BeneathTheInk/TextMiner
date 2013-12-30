/**
 * Dependencies
 */

var _ = require("underscore"),
	http = require("http"),
	qs = require("querystring"),
	async = require("async"),
	dictionary = require("./dictionary");

/**
 * Base variables
 */

var whitespaceRegex = /\s+/g,
	trimRegex = /[^a-z0-9]/i,
	wikiUrl = "http://en.wikipedia.org/w/api.php?";

/**
 * Custom dictionary split in two parts.
 */

var contractions = [ "'tis", "'twas", "ain't", "aren't", "can't", "could've", "couldn't", "didn't", "doesn't", "don't", "hasn't", "he'd", "he'll", "he's", "how'd", "how'll", "how's", "i'd", "i'll", "i'm", "i've", "isn't", "it's", "might've", "mightn't", "must've", "mustn't", "shan't", "she'd", "she'll", "she's", "should've", "shouldn't", "that'll", "that's", "there's", "they'd", "they'll", "they're", "they've", "wasn't", "we'd", "we'll", "we're", "weren't", "what'd", "what's", "when", "when'd", "when'll", "when's", "where'd", "where'll", "where's", "who'd", "who'll", "who's", "why'd", "why'll", "why's", "won't", "would've", "wouldn't", "you'd", "you'll", "you're", "you've", "needn't", "haven't" ];

exports.common = dictionary.slice(0, 300).concat(contractions);
exports.dictionary = dictionary.slice(300);

/**
 * Turns a block of text into a list
 * of reduced words with original
 * start and end indices.
 */

exports.getWords  = function getWords(text) {
	var m, words = [], i = 0;

	while (m = whitespaceRegex.exec(text)) {
		// retrieve the next word
		var	word = text.substring(i, m.index);

		// always lowercase
		word = word.toLowerCase();

		// trim special chars
		while (trimRegex.test(word[0])) word = word.substr(1);
		while (trimRegex.test(word.substr(-1))) word = word.substr(0, word.length - 1);

		// special case
		word = word.replace(String.fromCharCode(8217), "'");
		if (word.substr(-2) == "'s") word = word.substr(0, word.length - 2);
		
		// not empty
		if (!word.length) continue;

		// add to the array and bump index
		words.push([word, i, m.index]);
		i = m.index + m[0].length;
	}

	return words;
}

/**
 * Combine all the words into phrases
 * of length 1 -> N.
 */

exports.getPhrases = function getPhrases(words, N) {
	if (!_.isNumber(N) || isNaN(N)) N = 1;

	var phrases = {}, i, next,
		raw, startIndex, endIndex,
		parts, phrase, data;

	for (var n = 1; n <= N; n++) {
		i = 0;

		while (true) {
			next = i + n;
			if (next > words.length) break;

			// get the words that make the phrase
			raw = words.slice(i, next);

			// reduce the indexes and get the phrase as text
			startIndex = _.first(raw)[1];
			endIndex = _.last(raw)[2];
			parts = _.pluck(raw, 0);
			phrase = parts.join(" ");

			// test if it exists and add
			if (!_.has(phrases, phrase)) {
				data = phrases[phrase] = {
					phrase: phrase,	// cache of phrase text
					words: parts,	// cached word array
					size: n,		// # of words in phrase
					freq: 0,		// # of times it appears in text
					at: [],			// original indexes it exists at
				};	
			}

			// add some data
			data.freq++;
			data.at.push([ startIndex, endIndex ]);

			// bump the index
			i++;
		}
	}

	return _.values(phrases);
}

/**
 * Tests if a word can be considered very common.
 */

exports.isCommon = function isCommon(word) {
	// if it has less than 2 letters it is bad
	if (word.length < 3) return true;

	// if it's part of the "common" dictionary, it's considered bad
	var cIndex = exports.common.indexOf(word);
	if (cIndex >= 0) return true;

	return false;
}

/**
 * Removes all phrases deemed too common.
 */

exports.dropByCommon = function dropCommonPhrases(phrases, dict, threshold) {
	var minIndex = Math.round(dict.length * threshold);

	return phrases.filter(function(data) {
		var words = data.words;

		// last word is common? toss it
		if (exports.isCommon(_.last(words)))
			return false;

		return _.some(data.words, function(word) {
			if (exports.isCommon(word)) return false;

			// get the index of the word in the dictionary
			var index = dict.indexOf(word);
			if (index < 0 || index > minIndex) return true;
		});
	});
}

/**
 * Gives each phrase a score.
 */

exports.score = function score(phrases, dict) {
	var max_score = dict.length + 1;

	phrases.forEach(function(data) {
		var score = 0;

		// base score is based on commonality of words in the phrase
		score += _.reduce(data.words, function(memo, word) {
			// extra common words get a score of 0
			if (exports.isCommon(word)) return memo;

			// everything else is index + 1
			var index = dict.indexOf(word);
			if (index >= 0) return memo + index + 1;
			else return memo + max_score;
		}, score);

		// it is adjusted by frequency in text
		var adj = 1 + Math.atan(data.freq / 20) * (2 / Math.PI) * 1;
		score = Math.round(adj * score);

		// save the score
		data.score = score;
	});

	return phrases;
}

/**
 * Simple http request helper
 */

exports.request = function request(url, cb) {
	if (!_.isFunction(cb)) cb = function(){};
	cb = _.once(cb);

	http.get(url, function(res) {
		var data = "";
		
		res.on("error", cb);

		res.on("data", function(chunk) {
			data += chunk.toString("utf-8");
		});

		res.on("end", function() {
			try { cb(null, JSON.parse(data)); }
			catch (e) { cb(e) }
		});
	}).on("error", cb);
}

/**
 * Runs a search on Wikipedia
 */

exports.wikiSearch = function wikiSearch(phrase, cb) {
	if (!_.isFunction(cb)) cb = function(){};

	// url for search first
	var searchUrl = wikiUrl + qs.stringify({ action: "opensearch", search: phrase, limit: 1, format: "json" });

	exports.request(searchUrl, function(err, body) {
		if (err != null) return cb(err);
		else if (_.isEmpty(body[1]) || !body[1].length) return cb();

		var title = body[1][0],
			pageUrl = wikiUrl + qs.stringify({ action: "query", prop: "info", titles: title, format: "json", redirects: true });

		exports.request(pageUrl, function(err, body) {
			if (err != null) return cb(err);
			
			if (_.isObject(body.query) && !_.isEmpty(body.query.pages))
				var page = _.values(body.query.pages)[0];

			if (page.missing != null) cb();
			else cb(null, page);
		});
	});
}

/**
 * Looks up the phrase on Wikipedia and
 * drops anything that doesn't exist.
 */

exports.dropByWiki = function dropByWiki(list, limit, cb) {
	if (!_.isFunction(cb)) cb = function(){};
	
	var phrases = [];

	async.eachLimit(list, limit, function(data, done) {
		exports.wikiSearch(data.phrase, function(err, page) {
			try {
				if (err != null) return done(err);
				if (page == null) return done();

				phrases.push(data);
				done();
			} catch(e) { done(e); }
		});
	}, function(err) {
		if (err != null) cb(err);
		else cb(null, phrases);
	});
}