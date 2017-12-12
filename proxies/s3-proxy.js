// proxies/s3-proxy.js

const AWS = require('aws-sdk')
const S3 = new AWS.S3()
const _ = require('lodash')

module.exports = class S3Proxy
{
    constructor(bucket) {
        this.bucket = bucket
        _.bindAll(this, 'whenGetObject')
    }

    whenGetObject(key) {
        return S3.getObject({Bucket: this.bucket, Key: key})
        .promise()
        .then(r => JSON.parse(r.Body))
    }
}