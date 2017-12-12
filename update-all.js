const fs = require('fs')
const path = require('path')

const AWS = require('aws-sdk-mock')
const AWS_SDK = require('aws-sdk')
AWS.setSDKInstance(AWS_SDK)

AWS.mock('S3', 'getObject', function (params, callback) {
    const file = path.join('..', 'TestData', 'recipeshelf', params.Key)
    callback(null, { Body: fs.readFileSync(file) })
})

const index = require('./index')

function getPutEvent() {
    const event = { "Records": [] }
    const files = fs.readdirSync(path.join('..', 'TestData', 'recipeshelf', 'recipes'))
    for (const file of files)
    {
        event.Records.push({
            "eventName": "ObjectCreated:Put",
            "s3": {
                "bucket": {
                    "name": "recipeshelf"
                },
                "object": {
                    "key": "recipes/" + file
                }
            }
        })
    }
    return event
}

index.whenHandler(getPutEvent())
    .then(() => console.info('done'))