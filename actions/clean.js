var _ = require("underscore");

module.exports = function(dict) {
	if (!_.isFunction(dict.store.clean))
		throw new Error("Store doesn't support cleaning.");

	var time = new Date;
	console.log();
	console.log("Cleaning...");
	return dict.store.clean().then(function(count) {
		console.log("Dropped " + count.format() + " uncommon phrases in " + (new Date - time) + "ms.");
		console.log();
	});
}