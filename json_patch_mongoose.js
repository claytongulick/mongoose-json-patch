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
            await this.save();
    }

    async replace(item) {
        let {path, value} = item;
        path = this.jsonPointerToMongoosePath(path);
        this.setPath(path, value);
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
        let part = parts[parts.length -1];
        let parent = this.walkPath(path, -1);
        if(Array.isArray(parent)) {
            //this should always be true
            if(parent.isMongooseArray) {
                let array_schema = parent.$schema();
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
                    part = parseInt(index);
                    //this calls mongoose splice, which has proper change tracking
                    //rfc6902 says we don't spread aray values, we just add an array element
                    parent.splice(index,0,value);
                }
                catch(err) {
                    throw new Error("Invalid index value: " + index + " for array add");
                }
            }
        }
        else
            parent.set(part, value);
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

    /**
     * Mongoose "set" doesn't work with a populated path. This method walks a populated path and ensures 'set' is called on the leaf.
     * @param {*} path 
     * @param {*} value 
     */
    setPath(path, value) {
        if(!path.includes('.'))
            return this.document.set(path, value);

        let parent = this.walkPath(path,-1);
        let parts = path.split("."); //all this splitting is redundant, perhaps parts should be passed around instead of path strings
        let part = parts[parts.length - 1];

        parent.set(part, value);
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

    *iteratePath(path) {
        let parts = path.split(".");
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
            yield parent;
        }
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
        parts.shift(); //get rid of first ""
        let current_object = this.document;

        for (let part of parts) {
            //pointer to the end of an array gets skipped
            if(part == '-')
                break; //- must be the last item in a path
            
            let schema;

            //if the current object is an array, the part must be convertable to a integer index
            if(Array.isArray(current_object)) {
                part = parseInt(part);
                if(isNaN(part)) 
                    throw new Error("Invalid array index: " + part);
            }

            //if the child property is an array, and it's an array of refs, we need to populate it too
            if(Array.isArray(current_object[part])) {
                let array_schema = current_object[part].$schema();
                if(array_schema.options.type[0].ref)
                    if(!current_object.populated(part))
                        await current_object.populate(part).execPopulate();

                current_object = current_object[part];
                continue;
            }

            //if the current object is an array, and the current part is an index, just keep navigating
            if(Array.isArray(current_object)) {
                current_object = current_object[part]
                if(!(this.save_queue.includes(current_object)))
                    this.save_queue.push(current_object);
                continue;
            }

            //the current object isn't an array, so let's see if the child needs to be populated
            if(current_object.schema.obj[part].ref) {
                //this is a mongoose reference, populate it if needed
                if(!current_object.populated(part)) 
                    await current_object.populate(part).execPopulate();

                if(!(this.save_queue.includes(current_object[part])))
                    this.save_queue.push(current_object[part]);

                current_object = current_object[part];
            }
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