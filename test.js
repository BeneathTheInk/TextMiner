require("sugar");

var _ = require("underscore"),
	fs = require("fs"),
	miner = require("./miner"),
	program = require('commander');

program
	.version('0.1.0')
	.usage('<file>')
	.parse(process.argv);

if (!program.args.length) throw new Error("Expecting a file.");

var text = fs.readFileSync(program.args[0], { encoding: "utf-8" });
text = text.stripTags().unescapeHTML();

console.log("");

var dict = miner.dictionary;

var words = miner.getWords(text);
console.log(words.length + " words found.");

var phrases = miner.getPhrases(words, 3);
phrases = miner.dropByCommon(phrases, dict, 0.5);
console.log(phrases.length + " valid phrases found.");
console.log("");

miner.dropByWiki(phrases, 20, function(err, results) {
	if (err != null) return console.error(err);
	
	miner.score(results, dict);
	results = _.sortBy(results, "score");
	results.reverse();

	console.log("Results (" + results.length +"):\n");
	results.forEach(function(data) {
		console.log("  " + data.phrase);
	});
	console.log("");
});