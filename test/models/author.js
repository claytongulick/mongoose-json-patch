let mongoose = require('mongoose');
let Schema = mongoose.Schema;
let json_patch_plugin = require('../../index');

let Author = new Schema({
    first_name: String,
    last_name: String,
    publisher: String,
    email_address: {
        type: String,
        default: null
    },
    best_sellers: [
        {
            type: Schema.Types.ObjectId,
            ref: "Book"
        }
    ],
    address: {
        city: String,
        state: String,
        zip: String,
        address_1: String,
        address_2: String
    },
    phone_numbers: [String]
}, {

});

Author.plugin(json_patch_plugin, {
    autosave: true,
    //blacklist rules, don't allow publisher to be modified
    rules: [
        { path: "/publisher", op: ['add','replace','copy','move','remove','test'] }
    ],
    rules_mode: 'blacklist'
});

module.exports = new mongoose.model('Author', Author);
