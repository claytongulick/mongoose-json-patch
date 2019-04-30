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
            autopopulate: true,
            autosave: false
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
            throw new Error(this.errors);

        //next, make sure it passes all rules
        if(!this.patch_rules.check(patch))
            throw new Error("Patch failed rule check");

        this.schema = document.schema;
        this.save_queue = [document];
        this.document = document;
        for (const item of patch) {
            let {op, path} = item;

            await this.populatePath(path);

            await this[op](item);
        }
        if(this.options.autosave)
            await Promise.all(this.save_queue.map(item => item.save()));
    }

    async replace(item) {
        let {path, value} = item;
        path = this.jsonPointerToMongoosePath(path);
        this.document.set(path, value);
    }

    async remove(item) {
        let {path} = item;
        //if the path is an array, remove the element, otherwise set to null
        path = this.jsonPointerToMongoosePath(path);
        let current_value = this.document.get(path);
        if(Array.isArray(current_value.parent()))
            return current_value.remove();
        this.document.set(path, null);
    }

    async add(item) {
        let {path, value} = item;
        path = this.jsonPointerToMongoosePath(path);
        let parts = path.split('.');
        let index = parts[parts.length -1];
        let current_value;
        let parent_array = this.parentArray(path);
        if(parent_array) {
            if(index == '-') {
                return parent_array.push(value);
            }
            else {
                try {
                    index = parseInt(index);
                    //this calls mongoose splice, which has proper change tracking
                    //rfc6902 says we don't spread aray values, we just add an array element
                    current_value.splice(index,0,value);
                }
                catch(err) {
                    throw new Error("Invalid index value: " + index + " for array add");
                }
            }
        }
        else
            this.document.set(path, value);
    }

    async copy(item) {
        let {from, path} = item;
        from = this.jsonPointerToMongoosePath(from);
        path = this.jsonPointerToMongoosePath(path);
        let value = this.document.get(from);
        this.document.set(path, value);
    }

    async move(item) {
        let {from, path} = item;
        let {from, path} = item;
        from = this.jsonPointerToMongoosePath(from);
        path = this.jsonPointerToMongoosePath(path);
        let from_parts = from.split('.');
        let value = this.document.get(from);
        this.document.set(path, value);
        this.document.set(from, null);
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

    jsonPointerToMongoosePath(path) {
        path = path.substring(1);
        path = path.replace(/\//g,'.');
        return path;
    }

    parentArray(path) {
        let parts = path.split('.');
        let index = parts[parts.length - 1];
        if(index == '-') //pointer to uncreated element at the end of an array
            return true;
        let int_index;
        try {
            int_index = parseInt(index);
        }
        catch(err) {
            return false;
        }

        if(isNaN(int_index))
            return false;

        let value = this.document.get(path);
        let parent = value.parent();
        if(Array.isArray(parent))
            return parent;
        return false;
    }


    /**
     * Ensure that all refs in the path are populated
     * @param {String} path 
     */
    async populatePath(path) {
        let parts = path.split('/');
        parts.shift(); //get rid of first ""
        let current_object = this.document;

        for (let part of parts) {
            if(current_object.schema.obj[part].ref) {
                //this is a mongoose reference, populate it if needed
                if(!current_object.populated(part)) 
                    await current_object.execPopulate(part);

                this.save_queue.push(current_object);

                current_object = current_object[part];
            }
        };
    }

    async save() {

    }
} 


module.exports = JSONPatchMongoose;