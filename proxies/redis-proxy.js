// proxies/redis-proxy.js

const _ = require('lodash')

require('util.promisify/shim')()
const redis = require('redis-promisify')

class Client
{
    constructor() {
        this.client = redis.createClient(process.env.CACHE_ENDPOINT)
        this.seperator = ':'
        _.bindAll(this, 'whenFlush', 'whenQuit', 'whenKeys', 'whenPrefixMembers',
            'whenExists', 'whenGetString', 'whenSetString', 
            'whenCount', 'whenGet', 'whenGetFlag', 'whenHashFields',
            'whenHscan', 'whenHashScan', 'whenIsMember', 'whenMembers',
            'whenSetOr', 'whenSetsAnd', 'whenStore')
    }

    whenFlush() { return this.client.flushdbAsync() }
    
    whenQuit() { return this.client.quitAsync() }

    whenPrefixMembers(prefix) {
        return this.whenKeys(prefix + '*')
                    .then(keys => _.map(keys, k => k.substring(prefix.length+1)))
    }

    whenKeys(pattern) { return this.client.keysAsync(pattern) }

    whenExists(keys) { return this.client.existsAsync(...keys) }

    whenGetString(setKey) { return this.client.getAsync(setKey) }

    whenSetString(setKey, value, expiryMilliseconds) { return this.client.setAsync(setKey, value, 'PX', expiryMilliseconds) }

    whenCount(setKey) { return this.client.scardAsync(setKey) }

    whenGet(setKey, hashField) { return this.client.hgetAsync(setKey, hashField) }

    whenGetFlag(setKey, hashField) { return this.whenGet(setKey, hashField).then(r => r === 'True' )}

    whenHashFields(setKey) { return this.client.hkeysAsync(setKey) }

    whenHscan(cursor, results, setKey, hashFieldPattern) { 
        const args = [setKey, cursor]
        if (hashFieldPattern) {
            args.push('MATCH')
            args.push(hashFieldPattern)
        }
        args.push('COUNT')
        args.push(100)
        return this.client.hscanAsync(args)
                    .then(r => {
                        for (var i=0; i<r[1].length;i+=2)
                            results[r[1][i]] = r[1][i+1]
                        if (r[0] === '0') return Promise.resolve(results)                        
                        return this.whenHscan(r[0], results, setKey, hashFieldPattern)
                    })
    }

    whenHashScan(setKey, hashFieldPattern) {
        return this.whenHscan('0', {}, setKey, hashFieldPattern)
    }

    whenIsMember(setKey, value) { return this.client.sismemberAsync(setKey, value) }
    
    whenMembers(setKey) { return this.client.smembersAsync(setKey) }

    whenSetOr(setPrefix, setNames) {
        const setKeys = _.map(setNames, setName => setPrefix + this.seperator + setName)
        const destination = setKeys.join('|')
        return this.client.sunionstoreAsync(destination, setKeys)
                    .then(() => this.client.expireAsync(destination, process.env.OPERATING_SETS_EXPIRE_SECONDS))
                    .then(() => destination)
    }

    whenSetsAnd(setKeys) {
        const destination = setKeys.join('&')
        return this.client.sinterstoreAsync(destination, setKeys)
                    .then(() => this.client.expireAsync(destination, process.env.OPERATING_SETS_EXPIRE_SECONDS))
                    .then(() => destination)
    }

    whenStore(batch) {
        const setEntries = _.pickBy(batch, entry => entry instanceof SetEntry)
        const setPrefixes = _.keys(setEntries)
        const hashEntries = _.pickBy(batch, entry => entry instanceof HashEntry)
        const whenPrefixMembers = _.map(setPrefixes, this.whenPrefixMembers)
        let transaction = this.client.multi()
        for (const setKey of _.keys(hashEntries))
        {
            const hashEntry = hashEntries[setKey]
            for (const hashField of _.keys(hashEntry))
            {
                const hashValue = hashEntry[hashField]
                if (hashValue)
                    transaction.hset(setKey, hashField, hashValue)
                else
                    transaction.hdel(setKey, hashField)
            }
        }
        return Promise.all(whenPrefixMembers).then(members => {    
            const setChanges = new SetChanges()                    
            for (let i = 0; i < setPrefixes.length; i++)
            {
                const setEntry = setEntries[setPrefixes[i]]
                for (const setName of members[i])
                {
                    // Remove existing entries which are not needed
                    if (setEntry.setNames == null || !setEntry.setNames.includes(setName))
                        setChanges.remove(setPrefixes[i] + this.seperator + setName, setEntry.value)
                }   
                if (setEntry.setNames != null)
                {
                    for (const setName of setEntry.setNames)
                    {
                        if (!setName) continue;
                        // Add new entries
                        setChanges.add(setPrefixes[i] + this.seperator + setName, setEntry.value)                   
                    }
                }
            }                        
            setChanges.update(transaction)
            return transaction.execAsync()
        })               
    }
}

class SetChanges
{
    constructor() {
        this.changes = {}
        _.bindAll(this, 'add', 'remove', 'update')
    }

    add(key, value) {        
        if (!this.changes.hasOwnProperty(key)) this.changes[key] = {}
        this.changes[key][value] = true 
    }

    remove(key, value) {
        if (!this.changes.hasOwnProperty(key)) this.changes[key] = {}
        this.changes[key][value] = false
    }

    update(transaction) {
        for (const key of _.keys(this.changes))
        {
            for (const value of _.keys(this.changes[key]))
            {
                if (this.changes[key][value])
                    transaction.sadd(key, value)
                else
                    transaction.srem(key, value)
            }
        }
    }
}

class SetEntry
{
    constructor(value, setNames) {
        this.value = value
        if (setNames == null || setNames == undefined)
            this.setNames = null;
        else if (Array.isArray(setNames))
            this.setNames = setNames
        else if (typeof(setNames) === 'string')
            this.setNames = [ setNames ];
        else if (typeof(setNames) === 'boolean')
            this.setNames = [ setNames ? 'True' : 'False' ]
        else
            throw new Error('Couldn\'t add set entries for ' + setNames)
    }            
}

class HashEntry
{
    constructor(hashFields, values) {
        if (!Array.isArray(hashFields)) hashFields = [ hashFields ]
        if (!Array.isArray(values)) values = [ values ]
        Object.assign(this, _.zipObject(hashFields, _.map(values, value => {
            if (value == null || value == undefined)
                return null;
            else if (typeof(value) === 'string')
                return value;
            else if (typeof(value) === 'boolean')
                return value ? 'True' : 'False'        
            else
                throw new Error('Couldn\'t add hash entry for ' + value)        
        })))
    }
}

module.exports = {
    Client: Client,
    SetEntry: SetEntry,
    HashEntry: HashEntry
}