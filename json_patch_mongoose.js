const mongoose = require('mongoose');
const assert = require('assert');
const patch_schema = require('./schema.json');
const Ajv = require('ajv');

let ajv = new Ajv();
let validate = ajv.compile(patch_schema); //run sync at startup time

/**
 * Utility class for applying a RFC6902 compliant json-patch transformation to a mongoose model.
 */
class JSONPatchMongoose {
    constructor(options) {
        this.schema = schema;
        this.options = Object.assign({
            autopopulate: true,
            autosave: false
        },options);
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
    async apply(patch, document, rules) {
        //first, verify the patch is a valid RFC6902 json-patch document
        if(!this.validate(patch))
            throw new Error(this.errors);

        this.schema = document.schema;
        this.save_queue = [document];
        this.document = document;
        for (const item of patch) {
            let {op, path} = item;
            if(rules) {
                if(!rules.op)
                    throw new Error("No rule for patch operation: " + op);

                let rule = rules.op.find(
                    (rule) => {
                        if(typeof rule == 'string')
                            return rule == path;
                        return rule.path == path;
                    }
                );
                if(!rule)
                    throw new Error(`No rule for ${op} on ${path}`);

                if(rule.invoke)
                    if(rule.invoke in document)
                        return await document[rule.invoke]();

                await this.populatePath(path);

                await this[op](item);

            }
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
        if(index == '-')
            current_value = this.document.get(
                parts.splice(parts.length - 1).join('.')
            );
        else
            current_value = this.document.get(path).parent();
        if(Array.isArray(current_value)) {
            if(index == '-') {
                return parent.push(value);
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

    async populatePath(path) {
        let parts = path.split('/');
        let current_object = this.document;

        parts.forEach(part => {
            if(current_object.schema.obj[part].ref) {
                //this is a mongoose reference, populate it if needed
                if(!current_object.populated(part)) 
                    await current_object.execPopulate(part);

                this.save_queue.push(current_object);

                current_object = current_object[part];
            }
        });
    }

    async save() {

    }
} 


module.exports = JSONPatchMongoose;