// index.js

const _ = require('underscore')

const S3Proxy = require('./proxies/s3-proxy'),
    s3Proxy = new S3Proxy('recipeshelf')

const whenIngredients = s3Proxy.whenGetObject('ingredients.json')

const UpdateRecipe = require('./cache/update-recipe')

const whenDisconnect = (updateRecipe, err) => updateRecipe.whenDisconnect().then(() => Promise.reject(err))

exports.whenHandler = (event) => {
    const updateRecipe = new UpdateRecipe(whenIngredients)
    try
    {
        if (!event || !event.Records) return Promise.reject(new Error('Invalid event - ' + JSON.stringify(event)))
        return Promise.all(_.map(event.Records, record => {
            const whenRecipe = s3Proxy.whenGetObject(record.s3.object.key)
            if (record.eventName.startsWith('ObjectCreated:'))
                return whenRecipe.then(updateRecipe.whenStore)
            else if (record.eventName.startsWith('ObjectRemoved:'))
                return whenRecipe.then(updateRecipe.whenRemove)
            else
                return Promise.reject('Unkown record type - ' + record.eventName)
        }))
        .then(updateRecipe.whenDisconnect)
        .catch(err => whenDisconnect(updateRecipe, err))
    }
    catch (err)
    {
        return whenDisconnect(updateRecipe, err)
    }
}

exports.handler = (event, context, callback) => {
    exports.whenHandler(event)
            .then(result => callback(null, result))
            .catch(err => callback(err))    
}