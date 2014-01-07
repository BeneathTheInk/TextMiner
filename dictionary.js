var _ = require("underscore"),
	async = require("async"),
	MemoryStore = require("./stores/memory");

var noop = function(){},
	charRegex = /[a-z0-9](?:[a-z0-9\-\.\']*[a-z0-9])?/ig,
	replaceChars = { 8216: "'", 8217: "'", 8220: "\"", 8221: "\"" };

// Constructor
function FrequencyDictionary(options) {
	this.options = _.defaults(options || {}, {
		store: null
	});

	this.store = this.options.store || new MemoryStore();
}

FrequencyDictionary.getWords = function(text) {
	var m, words = [];

	// replace some misc higher order characters
	_.each(replaceChars, function(c, k) {
		text = text.replace(String.fromCharCode(k), c);
	});

	while (m = charRegex.exec(text)) {
		var word = m[0];

		// always lowercase
		word = word.toLowerCase();

		// trim possessive 's because they are useless
		if (word.substr(-2) == "'s") word = word.substr(0, word.length - 2);
		
		// not empty
		if (!word.length) continue;

		// add to the array
		words.push(word);
	}

	return words;
}

FrequencyDictionary.combineWords = function(words, N) {
	if (!_.isNumber(N) || isNaN(N) || N < 0) N = 1;

	var phrases = [],
		i, n, next;

	for (n = 1; n <= N; n++) {
		i = 0;

		while (true) {
			// get the end index
			next = i + n;
			if (next > words.length) break;

			// get the words, make the phrase and push
			phrases.push(words.slice(i, next).join(" "));

			// bump the index
			i++;
		}
	}

	return phrases;
}

FrequencyDictionary.prototype.parse = function(text, N, cb) {
	if (_.isFunction(N) && cb == null) {
		cb = N;
		N = null;
	}

	var words = FrequencyDictionary.getWords(text),
		phrases = FrequencyDictionary.combineWords(words, N);

	return this.add(phrases, cb);
}

// add a list of ngrams to the store
FrequencyDictionary.prototype.add = function() {
	var args = _.flatten(_.toArray(arguments)),
		callback = noop,
		self = this;

	if (typeof _.last(args) === "function") {
		callback = args.pop();
	}

	var grams = _.pairs(args.reduce(function(m, s) {
		if (m[s] == null) m[s] = 0;
		m[s]++;
		return m;
	}, {}));

	async.each(grams, function(g, done) {
		self.store.add(g[0], g[1], done);
	}, callback);

	return this;
}

// Sort ngrams from least to most common
FrequencyDictionary.prototype.sort = function() {
	var args = _.flatten(_.toArray(arguments)),
		callback = noop,
		grams = [],
		self = this;

	if (typeof _.last(args) === "function") {
		callback = args.pop();
	}

	async.each(_.unique(args), function(s, cb) {
		self.get(s, function(err, freq) {
			if (err != null) cb(err);
			grams.push([s, freq]);
			cb();
		});
	}, function(err) {
		if (err != null) return callback(err);

		var sorted = _.chain(grams).sortBy(1).pluck(0).value();
		callback(null, sorted);
	});

	return this;
}

// Rest of the commands are proxied to the store
FrequencyDictionary.prototype.get = function(str, callback) {
	if (!_.isFunction(callback)) callback = noop;
	this.store.get(str, callback);
	return this;
}

FrequencyDictionary.prototype.indexOf = function(str, callback) {
	if (!_.isFunction(callback)) callback = noop;
	this.store.indexOf(str, callback);
	return this;
}

FrequencyDictionary.prototype.length = function(callback) {
	if (!_.isFunction(callback)) callback = noop;
	this.store.length(callback);
	return this;
}

FrequencyDictionary.prototype.slice = function(start, end, callback) {
	if (_.isFunction(end) && callback == null) {
		callback = end;
		end = null;
	} else if (!_.isFunction(callback)) {
		callback = noop;
	}

	this.store.slice(start, end, callback);
	return this;
}

module.exports = FrequencyDictionary;