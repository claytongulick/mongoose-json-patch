let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let Series = new Schema({
}, {
    name: String,
    books: [
        {
            type: Schema.Types.ObjectId,
            ref: "Book"
        }
    ]
});

module.exports = new mongoose.model('Series', Series);

