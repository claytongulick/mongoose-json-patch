const JSONPatchMongoose = require('./json_patch_mongoose');

/**
 * Plugin method def
 * @param {*} schema 
 * @param {*} options 
 */
async function plugin(schema, options) {
    schema.methods.patch = async function(patch) {
        let document = this;
        let patcher = new JSONPatchMongoose(schema, options);
        await patcher.apply(patch, document, options.rules);
    }
}

module.exports = plugin;