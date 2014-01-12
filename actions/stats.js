var _ = require("underscore"),
	Promise = require("bluebird");

module.exports = function(dict) {
	console.log();

	return Promise.bind(dict)
		.then(dict.length)
		.then(function(length) {
			console.log("Size: " + length.format() + " unique phrases");

			var used = parseInt(redis.server_info.used_memory, 10).bytes(),
				alloc = parseInt(redis.server_info.used_memory_rss, 10).bytes(),
				frag = parseFloat(redis.server_info.mem_fragmentation_ratio);
			console.log("Redis Memory Usage: " + used + " / " + alloc + " / " + frag);
		})
		.then(function() { return this.slice(-10); })
		.map(function(phrase) {
			var p = this.get(phrase);
			return p.then(function(freq) {
				return phrase + " (" + freq.format() + ")";
			});
		})
		.then(function(res) {
			res.reverse();
			console.log("Most Common: \n  " + res.join("\n  "));
		})
		.finally(function() {
			console.log();
		});
}