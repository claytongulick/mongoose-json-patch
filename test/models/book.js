let mongoose = require('mongoose');
let Schema = mongoose.Schema;
let json_patch_plugin = require('../../index');

let Book = new Schema({
    name: String,
    author: {
        type: Schema.Types.ObjectId,
        ref: "Author"
    },
    publisher: String
}, {

});

Book.plugin(json_patch_plugin, {
    autosave: true,
    //blacklist rules, don't allow publisher to be modified
    rules: [
        { path: "/publisher", op: ['add','replace','copy','move','remove','test'] }
    ],
    rules_mode: 'blacklist'
});

module.exports = new mongoose.model('Book', Book);
