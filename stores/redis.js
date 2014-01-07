var redis = require("redis"),
	_ = require("underscore");

function RedisStore(opts) {
	opts = _.defaults(opts || {}, {
		client: null,
		key: "ngrams_frequency",
		default_score: 0,
		host: "127.0.0.1",
		port: 6379,
		options: {}
	});

	this.options = _.pick(opts, "default_score");
	this.key = opts.key;
	this.client = opts.client || redis.createClient(opts.port, opts.host, opts.options);
}

RedisStore.prototype.add = function(str, freq, done) {
	this.client.zincrby(this.key, freq, str, function(err) { done(err); });
	return this;
}

RedisStore.prototype.get = function(str, done) {
	var self = this;

	this.client.zscore(this.key, str, function(err, score) {
		if (err == null && score == null) score = self.options.default_score;
		if (score) score = parseInt(score, 10);
		done(null, score);
	});
	
	return this;
}

RedisStore.prototype.indexOf = function(str, done) {
	this.client.zrank(this.key, str, function(err, index) {
		if (err == null && index == null) index = -1;
		done(err, index);
	});

	return this;
}

RedisStore.prototype.length = function(done) {
	this.client.zcard(this.key, done);
	return this;
}

RedisStore.prototype.slice = function(start, end, done) {
	// adjust end index because js slice is different from redis range
	if (!_.isNumber(end) || isNaN(end)) end = -1;
	else end -= 1;

	this.client.zrange(this.key, start, end, done);
	return this;
}

// Special method that removes all phrases with one or less frequency
RedisStore.prototype.clean = function(done) {
	this.client.zremrangebyscore(this.key, "-inf", 1, done);
	return this;
}

module.exports = RedisStore;