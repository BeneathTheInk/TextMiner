var redis = require("redis"),
	_ = require("underscore"),
	Promise = require("bluebird");

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

RedisStore.prototype.add = function(str, freq) {
	var resolver = Promise.defer();
	
	this.client.zincrby(this.key, freq, str, function(err) {
		if (err != null) resolver.reject(err);
		else resolver.resolve();
	});
	
	return resolver.promise;
}

RedisStore.prototype.get = function(str) {
	var resolver = Promise.defer();
		self = this;

	this.client.zscore(this.key, str, function(err, score) {
		if (err != null) return resolver.reject(err);
		
		if (score == null) score = self.options.default_score;
		resolver.resolve(_.isString(score) ? parseInt(score, 10) : score);
	});
	
	return resolver.promise;
}

RedisStore.prototype.indexOf = function(str) {
	var resolver = Promise.defer();

	this.client.zrank(this.key, str, function(err, index) {
		if (err != null) return resolver.reject(err);
		resolver.resolve(index != null ? index : -1);
	});

	return resolver.promise;
}

RedisStore.prototype.length = function() {
	var resolver = Promise.defer();
	this.client.zcard(this.key, resolver.callback);
	return resolver.promise;
}

RedisStore.prototype.slice = function(start, end) {
	var resolver = Promise.defer();

	// adjust end index because js slice is different from redis range
	if (!_.isNumber(end) || isNaN(end)) end = -1;
	else end -= 1;

	this.client.zrange(this.key, start, end, resolver.callback);
	return resolver.promise;
}

// Special method that removes all phrases with one or less frequency
RedisStore.prototype.clean = function() {
	var resolver = Promise.defer();
	this.client.zremrangebyscore(this.key, "-inf", 1, resolver.callback);
	return resolver.promise;
}

module.exports = RedisStore;