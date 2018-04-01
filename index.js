// index.js

const _ = require('lodash')

const S3Proxy = require('./proxies/s3-proxy'),
    s3Proxy = new S3Proxy('recipeshelf')

const UpdateRecipe = require('./cache/update-recipe')

const whenQuit = (updateRecipe, err) => updateRecipe.whenQuit().then(() => Promise.reject(err))

exports.whenHandler = (event) => {
    if (!event || !event.Records) return Promise.reject(new Error('Invalid event - ' + JSON.stringify(event)))
    console.info(JSON.stringify(event))
    const updateRecipe = new UpdateRecipe()
    try
    {        
        return Promise.all(_.map(event.Records, record => {
            if (record.eventName.startsWith('ObjectCreated:'))
                return s3Proxy.whenGetObject(record.s3.object.key).then(updateRecipe.whenStore)
            else if (record.eventName.startsWith('ObjectRemoved:'))
                return updateRecipe.whenRemove(record.s3.object.key.split('/')[1].split('.')[0])
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