/*
 *   Copyright (c) 2020 Ratio Software, LLC 
 *   All rights reserved.
 *   @author Clayton Gulick <clay@ratiosoftware.com>
 */
const mms = require("mongodb-memory-server");
const mongoose = require("mongoose");
const expect = require("chai").expect;
const assert = require("assert");

const Book =  require('./models/book');
const Author = require('./models/author');
const Series = require('./models/series');

let mongod;
let author_id, coauthor_id, collaborator_id, series_id, book_id;

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
        await Author.deleteMany({});
        await Series.deleteMany({});
        await Book.deleteMany({});

        let author = new Author(
            {
                first_name: "JRR", 
                last_name: "Tolkien", 
                address: {city: "NoWhere", state:"TX", zip: "12345", address_1: "123 anywhere dr"},
                phone_numbers: ["111-111-1111", "222-222-2222"]
            });
        await author.save();
        author_id = author._id;

        let coauthor = new Author(
            {
                first_name: "Clay", 
                last_name: "Gulick", 
                address: {city: "NoWhere", state:"TX", zip: "12345", address_1: "123 anywhere dr"},
                phone_numbers: ["111-111-1111", "222-222-2222"]
            });
        await coauthor.save();
        coauthor_id = coauthor._id;

        let collaborator = new Author(
            {
                first_name: "Zaphod", 
                last_name: "Beeblebrox", 
                address: {city: "NoWhere", state:"TX", zip: "12345", address_1: "123 anywhere dr"},
                phone_numbers: ["111-111-1111", "222-222-2222"]
            });
        await collaborator.save();
        collaborator_id = collaborator._id;
        
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


        it("should add a value to the end of an array", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                {op: "add", path: "/phone_numbers/-", value: "333-333-3333"},
                {op: "add", path: "/phone_numbers/-", value: "444-444-4444"}
            ];

            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            //these already existed
            assert.equal(author.phone_numbers[0], "111-111-1111");
            assert.equal(author.phone_numbers[1], "222-222-2222");
            //new ones
            assert.equal(author.phone_numbers[2], "333-333-3333");
            assert.equal(author.phone_numbers[3], "444-444-4444");

        });

        it("should add a value to a new array index", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                {op: "add", path: "/phone_numbers/2", value: "333-333-3333"},
                {op: "add", path: "/phone_numbers/3", value: "444-444-4444"}
            ];

            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            //these already existed
            assert.equal(author.phone_numbers[0], "111-111-1111");
            assert.equal(author.phone_numbers[1], "222-222-2222");
            //new ones
            assert.equal(author.phone_numbers[2], "333-333-3333");
            assert.equal(author.phone_numbers[3], "444-444-4444");

        });

        it("should add a new object to a populated array", async () => {
            let series = await Series.findOne({_id: series_id});
            let patch = [
                {op: "add", path: "/books/-", value: {name: "Fellowship Of The Ring", author: author_id}},
                {op: "add", path: "/books/-", value: {name: "The Two Towers", author: author_id}}
            ];
            await series.jsonPatch(patch);
            let book = await Book.findOne({name: "The Two Towers"});
            assert.equal(book.name, "The Two Towers");

            series = null;
            series = await Series.findOne({_id: series_id});
            await series.populate("books");
            assert.equal(series.books[1].name, "Fellowship Of The Ring");
            assert.equal(series.books[2].name, "The Two Towers");

        });

        it("should set a value at an array path", async () => {
            let series = await Series.findOne({_id: series_id});
            let patch = [
                {op: "add", path: "/books/-", value: book_id},
                {op: "add", path: "/books/-", value: {name: "Fellowship Of The Ring", author: author_id}},
                {op: "add", path: "/books/-", value: {name: "The Two Towers", author: author_id}},
                { op: "replace", path: "/books/0/name", value: "Return Of The King" }
            ]

            await series.jsonPatch(patch);
            series = await Series.findOne({_id: series_id});
            await series.populate("books");
            assert.equal(series.books[0].name, "Return Of The King");
            //this should have been changed by the "replace" patch operation on item 0
            let book = await Book.findOne({_id: book_id});
            assert.equal(book.name, "Return Of The King");

        });
    });

    describe("move", () => {
        it("should set new path and set old path to null", async () => {

        });

        it("should move an array element to a new position", async () => {

        });
    });

    describe("replace", () => {
        it("should replace a value", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/email_address', op: 'replace', value: 'thedude@lebowski.com'}
            ];
            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.equal(author.email_address, 'thedude@lebowski.com');

        });
        it("should set a value on a subdoc", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/address/city', op: 'replace', value: 'New York'}
            ];
            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.equal(author.address.city, 'New York');

        });

        it("should set a value on a populated path", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/author/first_name', op: 'replace', value: 'James'}
            ];
            await book.jsonPatch(patch);
            book = null;
            book = await Book.findOne({_id: book_id});
            await book.populate("author");
            assert.equal(book.author.first_name, 'James');
        });

        it("should set a reference in a subdoc", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/coauthor/author', op: 'replace', value: coauthor_id}
            ];
            await book.jsonPatch(patch);
            book = null;
            book = await Book.findOne({_id: book_id});
            await book.populate("coauthor.author");
            assert.equal(book.coauthor.author.first_name, 'Clay');
        });

        it("should set a objectId value that's not a ref, and is unset", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/reference_id', op: 'replace', value: coauthor_id}
            ];
            await book.jsonPatch(patch);
            book = null;
            book = await Book.findOne({_id: book_id});
            assert.equal(book.reference_id.toString(), coauthor_id.toString());

        });

        it("should set a objectId value that's not a ref, and is already set", async () => {
            let book = await Book.findOne({_id: book_id});
            book.reference_id = author_id;
            await book.save();
            let patch = [
                { path: '/reference_id', op: 'replace', value: coauthor_id}
            ];
            await book.jsonPatch(patch);
            book = null;
            book = await Book.findOne({_id: book_id});
            assert.equal(book.reference_id.toString(), coauthor_id.toString());

        });

        it("should set a value on a populated path in a subdoc", async () => {
            let book = await Book.findOne({_id: book_id});
            book.coauthor.author = coauthor_id;
            await book.save();
            let patch = [
                { path: '/coauthor/author/first_name', op: 'replace', value: 'Clayton'}
            ];
            await book.jsonPatch(patch);
            book = null;
            book = await Book.findOne({_id: book_id});
            await book.populate("coauthor.author");
            assert.equal(book.coauthor.author.first_name, 'Clayton');
            let coauthor = await Author.findOne({_id: coauthor_id});
            assert.equal(coauthor.first_name, "Clayton");
        });

        it("should fail to set a value on a blacklisted path", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/publisher', op: 'replace', value: 'Random House'}
            ];

            let errored = false;
            try {
                await book.jsonPatch(patch);
            }
            catch(err) {
                errored = true;
            }
            assert.equal(errored, true);

        });

    });

    describe("remove", () => {
        it("should set the path to null", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/first_name', op: 'remove'}
            ];
            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.strictEqual(author.first_name, undefined);

        });

        it("should remove an array element", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                {op: "remove", path: "/phone_numbers/0"},
            ];

            await author.jsonPatch(patch);
            author = null;
            author = await Author.findOne({_id: author_id});
            //these already existed
            //assert.equal(author.phone_numbers[0], "111-111-1111"); -- this was the previous 0 element
            assert.equal(author.phone_numbers[0], "222-222-2222");

        });

    });

    describe("middleware", () => {
        it("should execute matching middleware properly", async ()=> {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/first_name', op: 'add', value: 'Jimmy'}
            ];
            let options = {
                autosave: true,
                middleware: [
                    {op: 'add', path: '/first_name', handler: 
                        async (document, item, next) => {
                            item.value = "Jimmie";
                            await next(item);
                        }
                    }
                ]
            }
            await author.jsonPatch(patch, options);
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.equal(author.first_name, 'Jimmie');

        });

        it("should execute matching middleware on a virtual path", async ()=> {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/payment_methods/-', op: 'add', value: '4242424242424242'}
            ];
            let processed;
            let options = {
                autosave: true,
                middleware: [
                    {op: 'add', path: '/payment_methods/-', handler: 
                        async (document, item, next) => {
                            processed = item.value;
                            //await next(item);
                        }
                    }
                ]
            }
            await author.jsonPatch(patch, options);
            assert.equal(processed, '4242424242424242');

        });
    });

    describe("embedded arrays", () => {
        it("should add to embedded array doc refs", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/collaborators/-', op: 'add', value: { gets_credit: true, author: collaborator_id }}
            ];
            let b = await book.jsonPatch(patch);
            book = await Book.findOne({ _id: book_id });
            assert.equal(book.collaborators[0].author.toString(), collaborator_id.toString());

        });

        it("should patch array doc refs", async () => {
            let book = await Book.findOne({_id: book_id});
            let patch = [
                { path: '/collaborators/-', op: 'add', value: { gets_credit: true, author: collaborator_id }}
            ];
            await book.jsonPatch(patch);
            patch = [
                { path: '/collaborators/0/author/first_name', op: 'replace', value: "superman"}
            ];
            let book1 = await Book.findOne({_id: book_id});
            let promise = book1.jsonPatch(patch);
            await promise;
            let changed_collaborator = await Author.findOne({ _id: collaborator_id});
            assert.equal(changed_collaborator.first_name, 'superman');
        });

        it("should delete array element with refs", async () => {

        });
    });

    describe("working without autopopulate", () => {
        it("should perform basic operations without autopopulate", async () => {
            let author = await Author.findOne({_id: author_id});
            let patch = [
                { path: '/address/city', op: 'replace', value: 'New York'}
            ];
            await author.jsonPatch(patch, {autopopulate: false, autosave: true} );
            author = null;
            author = await Author.findOne({_id: author_id});
            assert.equal(author.address.city, 'New York');

        })
    })

    /*
    describe("testing mongoose api", () => {
        it("should iterate child schemas", async () => {
            let book_schema = Book.schema;
            for(let child_schema of book_schema.childSchemas) {
                console.log(child_schema);
            }

        });
    })*/
    

});