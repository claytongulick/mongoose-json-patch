/*
 *   Copyright (c) 2020 Ratio Software, LLC 
 *   All rights reserved.
 *   @author Clayton Gulick <clay@ratiosoftware.com>
 */
const mongoose = require('mongoose');
const assert = require('assert');
const patch_schema = require('./schema.json');
const JSONPatchRules = require('json-patch-rules');
const Ajv = require('ajv');

let ajv = new Ajv();
let validate = ajv.compile(patch_schema); //run sync at startup time

/**
 * Utility class for applying a RFC6902 compliant json-patch transformation to a mongoose model.
 */
class JSONPatchMongoose {
    constructor(schema, options) {
        this.schema = schema;
        this.options = Object.assign({
            autosave: false,
            autopopulate: true
        },options);
        if(options.rules)
            this.patch_rules = new JSONPatchRules(options.rules, {mode: options.rules_mode});
        this.save_queue = [];
    }

    /**
     * Verify that the patch documents meets the RFC schema
     * @param {*} patch 
     */
    validate(patch) {
        let valid = validate(patch);
        if(!valid)
            this.errors = validate.errors;
        return valid;
    }

    /**
     * Apply a patch to a mongoose document, optionally with a set of rules that specify allowed fields.
     * @param {*} patch 
     * @param {*} document 
     * @param {*} rules 
     */
    async apply(patch, document) {
        //first, verify the patch is a valid RFC6902 json-patch document
        if(!this.validate(patch))
            throw new Error(JSON.stringify(this.errors));

        //next, make sure it passes all rules
        if(this.patch_rules)
            if(!this.patch_rules.check(patch))
                throw new Error("Patch failed rule check");

        this.schema = document.schema;
        this.save_queue = [document];
        this.document = document;
        for (const item of patch) {
            let {op, path} = item;

            let middleware_handler;
            let matches;

            //check to see if we have any middleware defined
            if(this.options.middleware)
                for(let middleware of this.options.middleware) {
                    let op_matches;
                    if(Array.isArray(middleware.op)) 
                        op_matches = middleware.op.includes(op);
                    else
                        op_matches = (middleware.op == op)
                    if(op_matches) {
                        if(!middleware.regex)
                            middleware.regex = new RegExp(middleware.path);
                        matches = middleware.regex.exec(path);
                        if(matches) {
                            middleware_handler = middleware.handler;
                            break;
                        }
                    }
                }

            let next = async () => {
                await this.populatePath(path);
                await this[op](item);
            }

            if(middleware_handler)
                await middleware_handler(document, item, next, matches);
            else
                await next();
        }
        if(this.options.autosave)
            await this.save();
    }

    async replace(item) {
        let {path, value} = item;
        path = this.jsonPointerToMongoosePath(path);
        this.setPath(path, value);
    }

    async remove(item) {
        let {path} = item;
        //if the path is an array, remove the element, otherwise set to undefined
        path = this.jsonPointerToMongoosePath(path);
        let current_value = this.document.get(path);
        let parent = this.walkPath(path, -1);
        if(Array.isArray(parent))
            return parent.pull(current_value);
        this.setPath(path, undefined);
    }

    async add(item) {
        let {path, value} = item;
        path = this.jsonPointerToMongoosePath(path);
        let parts = path.split('.');
        let part = parts[parts.length -1];
        let parent = this.walkPath(path, -1);
        if(Array.isArray(parent)) {
            //this should always be true
            if(parent.isMongooseArray) {
                let array_schema = parent.$schema ? parent.$schema() : parent._schema;
                //if it looks like this is an array of object refs
                if(array_schema.options &&  //just
                    array_schema.options.type &&  //being
                    array_schema.options.type.length &&  //really
                    array_schema.options.type[0].ref) { //safe
                    let model = mongoose.model(array_schema.options.type[0].ref);
                    //and the value is an object
                    if(value instanceof Object) {
                        //but it isn't an existing ObjectId
                        if(!(mongoose.Types.ObjectId.isValid(value))) {
                            //autosave must be true for this to work, because we have to save the instance before we can push it to the mongoose array
                            if(this.options.autosave == false)
                                throw new Error("Autosave must be turned on to add array elements to populated path");
                            //create a new model instance
                            value = new model(value);
                            await value.save();
                        }
                    }
                }
            }
            if(part == '-') {
                return parent.push(value);
            }
            else {
                try {
                    part = parseInt(part);
                    //this calls mongoose splice, which has proper change tracking
                    //rfc6902 says we don't spread aray values, we just add an array element
                    parent.splice(part,0,value);
                }
                catch(err) {
                    throw new Error("Invalid index value: " + part + " for array add");
                }
            }
        }
        else
            this.setPath(path, value);
    }

    async copy(item) {
        let {from, path} = item;
        from = this.jsonPointerToMongoosePath(from);
        path = this.jsonPointerToMongoosePath(path);
        let value = this.document.get(from);
        this.setPath(path, value);
    }

    async move(item) {
        let {from, path} = item;
        from = this.jsonPointerToMongoosePath(from);
        path = this.jsonPointerToMongoosePath(path);
        let from_parts = from.split('.');
        let value = this.document.get(from);
        this.setPath(path, value);
        this.setPath(from, null);
    }

    async test(item) {
        let {path, value} = item;
        let existing_value = this.document.get(path);

        try {
            assert.deepStrictEqual(existing_value, value);
            
        } catch (error) {
            return false;
        }
    }

    /**
     * Test for whether this object is a top level mongoose object or a subdoc
     * This is done by 
     * @param {*} object 
     */
    isSubDoc(object, root) {
        if(!root)
            root = this.document;
        return ((current_object != root) && (current_object.schema == root.schema)) 
    }

    /**
     * Mongoose "set" doesn't work with a populated path. This method walks a populated path and ensures 'set' is called on the leaf.
     * @param {*} path 
     * @param {*} value 
     */
    setPath(path, value) {
        let path_info = this.path_info[path];
        path_info.root.set(path_info.relative_path, value);
    }

    /**
     * Walk down a mongoose dotted path, dereferencing objects. Return the value at the 'index' position in the path, or if index isn't specified, the
     * 'leaf' pointed to by the entire path. A negative index will indicate an offset from the end of the path.
     * @param {*} path 
     * @param {*} index 
     */
    walkPath(path, index) {
        let parts = path.split(".");
        if(typeof index == 'undefined')
            index = parts.length;
        if(index < 0)
            index = parts.length + index;

        let parent = this.document;
        let part;
        for (let i=0; i<index; i++) {
            part = parts[i];

            if(Array.isArray(parent)) {
                part = parseInt(part);
                if(isNaN(part))
                    throw new Error("Invalid index on array: " + part);
            }

            if(i === (parts.length - 1))
                break;

            parent = parent[part];
        }

        return parent;
    }

    jsonPointerToMongoosePath(path) {
        path = path.substring(1);
        path = path.replace(/\//g,'.');
        return path;
    }

    /**
     * Ensure that all refs in the path are populated
     * @param {String} path 
     */
    async populatePath(path) {
        let parts = path.split('/');
        let part;
        parts.shift(); //get rid of first ""
        let relative_root = this.document;
        let relative_root_index = -1;
        let absolute_path = '';
        let relative_path = '';
        let current_object = relative_root;
        this.path_info = {};

        //for a path like '/something/0/foo/name' parts should now look like:
        //['something','0','foo','name]
        //so the job is to loop through this and figure out what's a populatable object, and populate it.
        //we need to keep track of a 'relative root', which is a reference to the most recent document in the hierarchy,
        //because the next populate call needs to come from that object
        //this also gets tricky when dealing with arrays, and subdocs in arrays, especially when there's an embedded object in
        //an array subdoc

        for (let i=0; i<=parts.length; i++) {
            if(i < parts.length)
                part = parts[i];

            //cache information about the path for later assignment (setPath)
            //the path_info structure isn't used in this function, we're just building up some information about
            //the whole graph, so that later it's a lot easier to figure out how to set properties

            //if we're on the root document
            if(current_object == this.document) {
                this.path_info[absolute_path] = {
                    absolute_path: '',
                    relative_path: '',
                    root: this.document,
                    document: this.document,
                    type: 'root'
                }
                if(!this.save_queue.includes(current_object))
                    this.save_queue.push(current_object);
            }
            //if the current object is null or undefined -
            //this can happen if we're setting a value in a subdoc or object ref that's new
            else if(!current_object) {
                //if this isn't the end of the path, there's a problem, the user needs to patch to create this first
                if(i != (parts.length) )
                    throw new Error("Attempt to operate on empty path - do you need to create the path first?");

                this.path_info[absolute_path] = {
                    absolute_path: absolute_path,
                    relative_path: relative_path,
                    root: relative_root,
                    document: current_object,
                    type: 'leaf'
                }

            }
            //If this is an ObjectId, it may or may not be a ref that needs to be populated
            else if(current_object instanceof mongoose.Types.ObjectId) {
                let schema_type = relative_root.schema.path(relative_path);
                //if this has a ref in the schema, it needs to be populated
                if( 
                    this.options.autopopulate && //if we're not populating, treat it as a leaf
                    schema_type &&
                    schema_type.options.ref) {
                    this.path_info[absolute_path] = {
                        absolute_path: absolute_path,
                        relative_path: relative_path,
                        root: relative_root,
                        document: current_object,
                        type: 'root'
                    }
                    await relative_root.populate(relative_path);
                    current_object = relative_root.get(relative_path);
                    relative_root = current_object;
                    relative_root_index = i-1;
                    if(!this.save_queue.includes(current_object))
                        this.save_queue.push(current_object);
                }
                //this is just an object id floating out there, it's a leaf
                else {
                    this.path_info[absolute_path] = {
                        absolute_path: absolute_path,
                        relative_path: relative_path,
                        root: relative_root,
                        document: current_object,
                        type: 'leaf'
                    }
                }
            }
            //if this is a non-array document, and is not a subdoc, but a ref'd model
            //else if(current_object && current_object.schema && (current_object.schema != relative_root.schema)) {
            else if(current_object instanceof mongoose.Model) {
                this.path_info[absolute_path] = {
                    absolute_path: absolute_path,
                    relative_path: relative_path,
                    root: relative_root,
                    document: current_object,
                    type: 'root'
                }
                relative_root = current_object;
                relative_root_index = i-1;
                if(!this.save_queue.includes(current_object))
                    this.save_queue.push(current_object);
            }
            //if this is an array
            else if(Array.isArray(current_object)) {
                let array_schema = current_object.$schema ? current_object.$schema() : current_object._schema;

                //if the current object is an array, the part must be convertable to a integer index
                if(i < parts.length) {
                    if(part != '-') {
                        part = parseInt(part);
                        if (isNaN(part))
                            throw new Error("Invalid array index: " + part);
                    }
                }

                //if it's an array of linked refs
                if(array_schema.options.type[0].ref) {
                    this.path_info[absolute_path] = {
                        absolute_path: absolute_path,
                        relative_path: relative_path,
                        root: relative_root,
                        document: current_object,
                        type: 'ref_array'
                    }
                    if(!relative_root.populated(relative_path))
                        await relative_root.populate(relative_path);
                }
                //if it's just an array of subdocs, no linked refs
                else {
                    this.path_info[absolute_path] = {
                        absolute_path: absolute_path,
                        relative_path: relative_path,
                        root: relative_root,
                        document: current_object,
                        type: 'array'
                    }

                }

            }
            //if this is a subdoc
            //else if(current_object.schema && (current_object.schema == relative_root.schema )) {
            else if(current_object instanceof mongoose.Types.Document) {
                this.path_info[absolute_path] = {
                    absolute_path: absolute_path,
                    relative_path: relative_path,
                    root: relative_root,
                    document: current_object,
                    type: 'subdoc'
                }
            }
            //by process of elimination, this must be a leaf value
            else {
                this.path_info[absolute_path] = {
                    absolute_path: absolute_path,
                    relative_path: relative_path,
                    root: relative_root,
                    document: current_object,
                    type: 'leaf'
                }
            }

            if(i==parts.length)
                break;
            if(part == '-')
                break;

            absolute_path = parts.slice(0,i+1).join('.');
            relative_path = parts.slice(relative_root_index + 1, i+1).join('.');

            current_object = current_object[part];
        };
    }

    async save() {
        await Promise.all(
            this.save_queue.map(
                item => item.save()
            )
        );
    }
} 


module.exports = JSONPatchMongoose;
