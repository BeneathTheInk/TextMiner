require("sugar");
var fs = require("fs"),
	async = require("async"),
	program = require('commander'),
	redis = require("redis").createClient(),
	RedisStore = require("./stores/redis"),
	ProgressBar = require('progress'),
	Dictionary = require("./dictionary");

var store = new RedisStore({ client: redis }),
	grams = new Dictionary({ store: store }),
	text, words, phrases, maxLength, timer, progress;

program
	.version('0.1.0')
	.usage('<file>')
	.option('-n, --max-phrase-length [int]', 'Maximum # of words in a phrase.', 3)
	.parse(process.argv);

console.log();
if (!program.args.length) throw new Error("Expecting a file.");

process.stdout.write("Loading text file...");
text = fs.readFileSync(program.args[0], { encoding: "utf-8" });
process.stdout.write(" " + text.length.bytes(2) + "\n");
text = text.stripTags().unescapeHTML(); // remove competing html

process.stdout.write("Extracting words...");
words = Dictionary.getWords(text);
process.stdout.write(" " + words.length.format() + " found\n");

maxLength = parseInt(program.maxPhraseLength, 10);
process.stdout.write("Creating phrases of max length " + maxLength + " from word list...");
phrases = Dictionary.combineWords(words, maxLength);
process.stdout.write(" " + phrases.length.format() + " phrases\n");

console.log("");
console.log("Writing phrases to storage. This may take a while.");
timer = new Date;
progress = new ProgressBar('[:bar] :percent', {
	total: phrases.length,
	width: 50,
	incomplete: " "
});

async.whilst(function() {
	return phrases.length;
}, function(cb) {
	grams.add(phrases.splice(0, 1000), function(err) {
		progress.tick(1000);
		cb(err);
	});
}, function(err) {
	if (err != null) return console.error(err);
	console.log("Done. That took " + ((new Date - timer) / 1000).round(2) + "s.")

	console.log();
	process.stdout.write("Cleaning storage...");
	store.clean(function(err, count) {
		if (err != null) return console.error(err);

		if (count > 0) process.stdout.write(" " + count.format() + " phrases removed for being too uncommon.");
		console.log();

		console.log();
		console.log("Dictionary Stats:");

		async.series([
			function(_cb) {
				grams.length(function(err, length) {
					if (err != null) return _cb(err);
					console.log("  Size: " + length.format() + " phrases");
					_cb();
				});
			},
			function(_cb) {
				grams.slice(-5, function(err, phrases) {
					if (err != null) return _cb(err);
					phrases.reverse();
					
					async.map(phrases, function(phrase, cb) {
						grams.get(phrase, function(err, freq) {
							cb(err, phrase + " (" + freq + ")");
						});
					}, function(err, res) {
						if (err != null) _cb(err);
						console.log("  Most Frequent: " + res.join(", "));
						_cb();
					});
				});
			}
		], function(err) {
			redis.quit();
			if (err != null) return console.error(err);
			console.log();
		});
	});

});