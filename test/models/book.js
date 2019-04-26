let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let Book = new Schema({
    name: String,
    author: {
        type: Schema.Types.ObjectId,
        ref: "Author"
    }
}, {

});

module.exports = new mongoose.model('Book', Book);
