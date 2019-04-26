let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let Author = new Schema({
    first_name: String,
    last_name: String,
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

module.exports = new mongoose.model('Author', Author);
