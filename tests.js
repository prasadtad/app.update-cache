// tests.js

var _ = require('underscore')
var assert = require('assert')

const fs = require('fs')
const path = require('path')

const AWS = require('aws-sdk-mock')
const AWS_SDK = require('aws-sdk')
AWS.setSDKInstance(AWS_SDK)

AWS.mock('S3', 'getObject', function (params, callback) {
    const file = path.join(__dirname, "testfiles", params.Key)
    callback(null, { Body: fs.readFileSync(file) })
})

const RedisProxy = require('./proxies/redis-proxy')
      
const UpdateRecipe = require('./cache/update-recipe')

const index = require('./index')

const putEvent = {
    "Records": [
        {
            "eventName": "ObjectCreated:Put",
            "s3": {
                "bucket": {
                    "name": "recipeshelf"
                },
                "object": {
                    "key": "recipes/NXkkUWRu.json"
                }
            }
        },
        {
            "eventName": "ObjectCreated:Put",
            "s3": {
                "bucket": {
                    "name": "recipeshelf"
                },
                "object": {
                    "key": "recipes/3uDSc4Vg.json"
                }
            }
        }
    ]
}

const deleteEvent = {
    "Records": [
        {
            "eventName": "ObjectRemoved:Delete",
            "s3": {
                "bucket": {
                    "name": "recipeshelf"
                },
                "object": {
                    "key": "recipes/3uDSc4Vg.json"
                }
            }
        },
        {
            "eventName": "ObjectRemoved:Delete",
            "s3": {
                "bucket": {
                    "name": "recipeshelf"
                },
                "object": {
                    "key": "recipes/NXkkUWRu.json"
                }
            }
        }
    ]
}

const redisProxyClient = new RedisProxy.Client()
const recipe1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'testfiles/recipes/3uDSc4Vg.json')))
const recipe2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'testfiles/recipes/NXkkUWRu.json')))

const whenAssertSet = (setPrefix, expected1, expected2) => {
    const getExpected = (expected) => {
        if (expected == null || expected == undefined) expected = []
        if (!Array.isArray(expected)) expected = [ expected ]
        expected = _.map(expected, e => typeof(e) === 'boolean' ? (e ? 'True' : 'False') : e)
        return expected
    }
    expected1 = getExpected(expected1)
    expected2 = getExpected(expected2)
    let expected = []
    expected.push(...expected1)
    expected.push(...expected2)
    expected = Array.from(new Set(expected)).sort()
    return redisProxyClient.whenMembers(setPrefix)
                .then(members => {
                    members = members.sort()
                    assert.deepEqual(members, expected)
                    return Promise.all(_.map(members, member => redisProxyClient.whenMembers(setPrefix + redisProxyClient.seperator + member)))
                            .then((setsMembers) => {
                                for (let i = 0; i < setsMembers.length; i++)
                                {
                                    const member = members[i];
                                    const setMembers = setsMembers[i];
                                    if (expected1.includes(member))
                                        assert.ok(setMembers.includes(recipe1.id))
                                    if (expected2.includes(member))
                                        assert.ok(setMembers.includes(recipe2.id))
                                    if (!expected.includes(member))
                                        assert.fail(member + ' should have been in [' + expected.join(',') + ']')
                                }
                                return Promise.resolve()
                            })
                })
}

const whenAssertNames = (id, names) => {
    return redisProxyClient.whenGet('Recipe:Names', id)
                            .then(actual => {
                                assert.equal(actual, names ? names.join('\n') : null)
                                return Promise.resolve();
                            })
}

const whenAssertSearchWords = () => {
    return redisProxyClient.whenHashScan('Recipe:SearchWords')
            .then(entries => {
                for (const recipe of [recipe1, recipe2]) {
                    for (const name of recipe.names)
                    {
                        for (const phrase of UpdateRecipe.prototype.getPhrases(name))
                            assert.ok(entries[phrase].indexOf(recipe.id) >= 0)
                    }
                }
                return Promise.resolve();
            })
}

const whenAssertRecipesAdded = () => {
    return whenAssertSet('Recipe:Collection', recipe1.collections, recipe2.collections)
            .then(() => whenAssertSet('Recipe:Cuisine', recipe1.cuisine, recipe2.cuisine))                    
            .then(() => whenAssertSet('Recipe:IngredientId', recipe1.ingredientIds, recipe2.ingredientIds))                    
            .then(() => whenAssertSet('Recipe:OvernightPreparation', recipe1.overnightPreparation, recipe2.overnightPreparation))                    
            .then(() => whenAssertSet('Recipe:Region', recipe1.region, recipe2.region))                    
            .then(() => whenAssertSet('Recipe:SpiceLevel', recipe1.spiceLevel, recipe2.spiceLevel))  
            .then(() => whenAssertSet('Recipe:Vegan', true, true))
            .then(() => whenAssertSet('Recipe:TotalTime', 'Slow', 'Regular'))
            .then(() => whenAssertNames(recipe1.id, recipe1.names))
            .then(() => whenAssertNames(recipe2.id, recipe2.names))
            .then(() => whenAssertSearchWords())
}

const whenAssertRecipesRemoved = () => {
    return whenAssertSet('Recipe:Collection')
    .then(() => whenAssertSet('Recipe:Cuisine'))                    
    .then(() => whenAssertSet('Recipe:IngredientId'))                    
    .then(() => whenAssertSet('Recipe:OvernightPreparation'))                    
    .then(() => whenAssertSet('Recipe:Region'))                    
    .then(() => whenAssertSet('Recipe:SpiceLevel'))  
    .then(() => whenAssertSet('Recipe:Vegan'))
    .then(() => whenAssertSet('Recipe:TotalTime'))
    .then(() => whenAssertNames(recipe1.id))
    .then(() => whenAssertNames(recipe2.id))
    .then(() => redisProxyClient.whenHashScan('Recipe:SearchWords')
                    .then(entries => {
                        assert.deepEqual(entries, {})
                        return Promise.resolve()
                    }))
}

let testMessages = [], tests = []
  
tests.push(index.whenHandler({blah: true})
            .catch(err => {
                testMessages.push('Errors are bubbled up')
                assert.equal(err.message, 'Invalid event - {"blah":true}')
                return Promise.resolve()
            }))

tests.push(redisProxyClient.whenFlush()
                .then(() => index.whenHandler(putEvent))
                .then(() => {
                    testMessages.push('Add recipes')
                    return whenAssertRecipesAdded()
                })         
                .then(() => index.whenHandler(deleteEvent))
                .then(() => {
                    testMessages.push('Remove recipes')
                    return whenAssertRecipesRemoved()
                })
                .then()
            )            

Promise.all(tests)
        .then(redisProxyClient.whenQuit)
        .then(() => {
            console.info(_.map(testMessages, m => m + ' - passed').join('\n'))
            process.exit()
        })


