// index.js

const _ = require('lodash')

const S3Proxy = require('./proxies/s3-proxy'),
    s3Proxy = new S3Proxy('recipeshelf')

const whenIngredients = s3Proxy.whenGetObject('ingredients.json')

const UpdateRecipe = require('./cache/update-recipe')

const whenQuit = (updateRecipe, err) => updateRecipe.whenQuit().then(() => Promise.reject(err))

exports.whenHandler = (event) => {
    if (!event || !event.Records) return Promise.reject(new Error('Invalid event - ' + JSON.stringify(event)))
    console.info(JSON.stringify(event))
    const updateRecipe = new UpdateRecipe(whenIngredients)
    try
    {        
        return Promise.all(_.map(event.Records, record => {
            const whenRecipe = s3Proxy.whenGetObject(record.s3.object.key)
            if (record.eventName.startsWith('ObjectCreated:'))
                return whenRecipe.then(updateRecipe.whenStore)
            else if (record.eventName.startsWith('ObjectRemoved:'))
                return whenRecipe.then(updateRecipe.whenRemove)
            else
                return Promise.reject('Unkown record type - ' + record.eventName)
        }))
        .then(updateRecipe.whenQuit)
        .catch(err => whenQuit(updateRecipe, err))
    }
    catch (err)
    {
        return whenQuit(updateRecipe, err)
    }
}

exports.handler = (event, context, callback) => {
    exports.whenHandler(event)
            .then(result => callback(null, result))
            .catch(err => callback(err))    
}