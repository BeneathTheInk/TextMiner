var _ = require("underscore");

function MemoryStore(opts) {
	opts = _.defaults(opts || {}, {
		default_score: 0
	});

	this.options = _.pick(opts, "default_score");
	this.scores = {};
	this.sorted = [];
}

MemoryStore.prototype.add = function(str, freq, done) {
	var self = this;

	_.defer(function() {
		if (self.scores[str] == null) self.scores[str] = 0;
		self.scores[str] += freq;

		var index = self.sorted.indexOf(str);
		if (index > -1) self.sorted.splice(index, 1);
		
		var newIndex = _.sortedIndex(self.sorted, str, function(s) {
			return self.scores[s];
		});
		self.sorted.splice(newIndex, 0, str);

		done();
	});

	return this;
}

MemoryStore.prototype.get = function(str, done) {
	var self = this;

	_.defer(function() {
		if (self.scores[str] == null) done(null, this.options.default_score);
		else done(null, self.scores[str]);
	});

	return this;
}

MemoryStore.prototype.indexOf = function(str, done) {
	var self = this;

	_.defer(function() {
		done(null, self.sorted.indexOf(str));
	});
	
	return this;
}

module.exports = MemoryStore;