# mongoose-json-patch
A utility for applying [RFC6902 JSONPatch](https://tools.ietf.org/html/rfc6902) operations to mongoose models.

This library supports deep autopopulation of related models. Patch operations will be queued and applied to all populated models.

Additionally, rules can be applied to the patch for authorization checks and validation. The rules engine is [json-patch-rules](https://github.com/claytongulick/json-patch-rules).


# Installation
npm install --save mongoose-patcher

# Usage
## As a mongoose plugin
```javascript
const json_patch_plugin = require('mongoose-patcher');
const options = {
    autosave: true, //should the model be automatically saved when the patch is applied?
    rules: [...], //JSON Patch Rules
    rules_mode: 'whitelist', //how should rules be applied, as a blacklist or whitelist? more info below

};
SomeModel.plugin(json_patch_plugin, options); //options can be applied at the schema level, or when the patch is applied

let model_instance = await SomeModel.findOne({...});

await model_instance.jsonPatch(patch); //patches are applied asyncronously
//model_instance will now have the patch applied
```

Options can also be applied at the time of patching, or when the patch is applied. This can be useful for cases where rules may differ based on the authenticated user, for example:

```javascript
let options;
if(req.user.role='admin')
    options = {
        rules: [], //allow admin to do everything
        rules_mode: 'blacklist'
    }
if(req.user.role='restricted')
    options = {
        rules: [
            {path: '/something/limited', op: 'replace'}
        ],
        rules_mode: 'whitelist'
    }

model_instance.jsonPatch(patch, options);
```

## rules_mode
This controls how rules will be applied, in either 'blacklist' or 'whitelist' mode.

In 'blacklist' mode, all operations in the patch will be applied, *except* those that meet the rules critera.

In 'whitelist' mode, no operations will be applied unless they match the rules criteria.

For example, if you have a simple object like a movie, perhaps all of the fields on the object should be modifiable via
json patch, except for the id, and the reference to the producer. This would be a good use for a blacklist:

```javascript
[
    {path: '/id'},
    {path: '/publisher'}
]
```

Alternately, in the case of a User object, perhaps there are only a small number of paths that should be allowed to be modified - in this case, all paths will be rejected except for those explicitly allowed:

```javascript
[
    {path: '/password', op: 'replace', value: '/...some regex.../'},
    {path: '/email', op: 'replace'}
    ...
]
```

For more information on defining rules see: [json-patch-rules](https://github.com/claytongulick/json-patch-rules).




