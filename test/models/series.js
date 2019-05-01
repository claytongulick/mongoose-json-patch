let mongoose = require('mongoose');
let Schema = mongoose.Schema;
let json_patch_plugin = require('../../index');

let Series = new Schema({
    name: String,
    books: [
        {
            type: Schema.Types.ObjectId,
            ref: "Book"
        }
    ]
}, {
});

Series.plugin(json_patch_plugin, {
    autosave: true,
    //blacklist rules, allow anything to be modified on the series
    rules: [],
    rules_mode: 'blacklist'
});

module.exports = new mongoose.model('Series', Series);

