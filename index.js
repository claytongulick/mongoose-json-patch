const JSONPatchMongoose = require('./json_patch_mongoose');

/**
 * Plugin method def
 * @param {*} schema 
 * @param {*} options 
 */
async function plugin(schema, schema_level_options) {
    schema.methods.jsonPatch = async function(patch, options) {
        let document = this;
        let patcher = new JSONPatchMongoose(schema, options || schema_level_options);
        await patcher.apply(patch, document);
    }
}

module.exports = plugin;