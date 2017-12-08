// proxies/s3-proxy.js

const AWS = require('aws-sdk')
const S3 = AWS.S3()

module.exports = class S3Proxy
{
    constructor(bucket) {
        this.bucket = bucket
        this.whenGetObject = this.whenGetObject.bind(this)
    }

    whenGetObject(key) {
        return S3.getObject({Bucket: this.bucket, Key: key})
        .promise()
        .then(r => JSON.parse(r.Body))
    }
}