var _ = require("underscore"),
	Promise = require("bluebird");

function MemoryStore(opts) {
	opts = _.defaults(opts || {}, {
		default_score: 0
	});

	this.options = _.pick(opts, "default_score");
	this.scores = {};
	this.sorted = [];
}

MemoryStore.prototype.add = function(str, freq) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (self.scores[str] == null) self.scores[str] = 0;
		self.scores[str] += freq;

		var index = self.sorted.indexOf(str);
		if (index > -1) self.sorted.splice(index, 1);
		
		var newIndex = _.sortedIndex(self.sorted, str, function(s) {
			return self.scores[s];
		});
		self.sorted.splice(newIndex, 0, str);

		resolve();
	});
}

MemoryStore.prototype.get = function(str) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (self.scores[str] == null) resolve(this.options.default_score);
		else resolve(self.scores[str]);
	});
}

MemoryStore.prototype.indexOf = function(str) {
	var self = this;
	return new Promise(function(resolve, reject) {
		resolve(self.sorted.indexOf(str));
	});
}

MemoryStore.prototype.length = function() {
	var self = this;
	return new Promise(function(resolve, reject) {
		resolve(self.sorted.length);
	});
}

MemoryStore.prototype.slice = function(start, end) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (end == null) end = void(0);
		resolve(self.sorted.slice(start, end));
	});
}

module.exports = MemoryStore;