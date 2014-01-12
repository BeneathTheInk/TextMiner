var _ = require("underscore"),
	Promise = require("bluebird"),
	MemoryStore = require("../stores/memory");

var charRegex = /[a-z0-9](?:[a-z0-9\-\.\'\,]*[a-z0-9])?/ig,
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
		callback,
		self = this,
		promises = [];

	if (typeof _.last(args) === "function") {
		callback = args.pop();
	}

	_.chain(args)
		.filter(_.isString)
		.reduce(function(m, s) {
			if (m[s] == null) m[s] = 0;
			m[s]++;
			return m;
		}, {})
		.pairs()
		.each(function(g) {
			// prevent strange NaN error
			if (!_.isNumber(g[1]) || isNaN(g[1])) return;
			promises.push(self.store.add(g[0], g[1]));
		});

	return Promise.all(promises).nodeify(callback);
}

// Sort ngrams from least to most common
FrequencyDictionary.prototype.sort = function() {
	var args = _.flatten(_.toArray(arguments)),
		callback,
		promises = [],
		self = this;

	if (typeof _.last(args) === "function") {
		callback = args.pop();
	}

	_.unique(args).forEach(function(str) {
		var p = self.get(str);
		p.then(function(freq) { return [str, freq]; });
		promises.push(p);
	});

	return Promise.all(promises).then(function(grams) {
		return _.chain(grams).sortBy(1).pluck(0).value();
	}).nodeify(callback);
}

// Rest of the commands are proxied to the store
FrequencyDictionary.prototype.get = function(str, callback) {
	return this.store.get(str).nodeify(callback);
}

FrequencyDictionary.prototype.indexOf = function(str, callback) {
	return this.store.indexOf(str).nodeify(callback);
}

FrequencyDictionary.prototype.length = function(callback) {
	return this.store.length().nodeify(callback);
}

FrequencyDictionary.prototype.slice = function(start, end, callback) {
	if (_.isFunction(end) && callback == null) {
		callback = end;
		end = null;
	}

	return this.store.slice(start, end).nodeify(callback);
}

module.exports = FrequencyDictionary;