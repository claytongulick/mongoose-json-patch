const mms = require("mongodb-memory-server");
const mongoose = require("mongoose");
const expect = require("chai").expect;
const assert = require("assert");

const Book =  require('./models/book');
const Author = require('./models/author');
const Series = require('./models/series');

let mongod;
let author_id, series_id, book_id;

before(async () => {

    mongod = new mms.MongoMemoryServer();
    let connection_string = await mongod.getConnectionString();
    await mongoose.connect(connection_string, {useNewUrlParser: true});

});

after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

describe("Transform", () => {

});

describe("Revert Patch", () => {

});

describe("Revert Transformation", () => {

});

describe("Patch", () => {

    beforeEach("init documents", async () => {
        await Author.remove({});
        await Series.remove({});
        await Book.remove({});

        let author = new Author(
            {
                first_name: "JRR", 
                last_name: "Tolkien", 
                address: {city: "NoWhere", state:"TX", zip: "12345", address_1: "123 anywhere dr"},
                phone_numbers: ["111-111-1111", "222-222-2222"]
            });
        await author.save();
        author_id = author._id;
        
        let series = new Series({name: "Lord of the Rings", books: []});
        await series.save();
        series_id = series._id;

        let book = new Book({name: "The Hobbit", author: author});
        await book.save();
        book_id = book._id;

        series.books.push(book);
        await series.save();

    });

    describe("add", () => {
        it("should set a value", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/first_name', op: 'add', value: 'Jimmy'}
            ];
            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.equal(author.first_name, 'Jimmy');

        });

        it("should set a value on a populated path", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/author/first_name', op: 'add', value: 'Jimmy'}
            ];
            await book.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.equal(author.first_name, 'Jimmy');

        });
    });
    
    describe("move", () => {
        it("should set new path and set old path to null", async () => {

        });
    });

    describe("replace", () => {
        it("should set the new value", async () => {

        });

    });

    describe("delete", () => {
        it("should set the path to null", async () => {

        });

    });

});