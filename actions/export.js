var _ = require("underscore"),
	Promise = require("bluebird"),
	fs = require("fs");

module.exports = function(dict) {
	var cmd = this,
		promise = dict.slice(-1 * cmd.limit);

	promise = promise.call("reverse");

	if (cmd.pretty) {
		promise = promise.map(function(phrase, i, list) {
			return dict.get(phrase).then(function(freq) {
				return [phrase, freq];
			});
		}).map(function(phrase, i, len) {
			var out = "\t\"" + phrase[0] + "\"";
			if (i != len - 1) out += ",";
			out += " // #" + i + ", " + phrase[1] + "\n";
			return out;
		}).then(function(phrases) {
			return "[\n" + phrases.join("") + "]"
		});
	} else {
		promise = promise.then(JSON.stringify);
	}

	return promise.then(function(phrases) {
			var resolver = Promise.defer(),
				str = "module.exports = " + phrases + ";",
				flag = cmd.force ? "w" : "wx";
			
			require("fs").writeFile(cmd.output, str, { flag: flag, mode: 0777 }, resolver.callback);
			
			return resolver.promise;
		})
		.then(function() {
			console.log("Saved " + cmd.limit + " entries to \"" + cmd.output + "\"");
		})
		.catch(function(err) {
			if (err.cause != null && err.cause.code == "EEXIST")
				console.log("The file \"" + cmd.output + "\" already exists. Delete first or try with '--force'.");
			else throw err;
		});
		
}