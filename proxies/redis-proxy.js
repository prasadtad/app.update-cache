// proxies/redis-proxy.js

const _ = require('underscore')

require('util.promisify/shim')()
const redis = require('redis-promisify')

class Client
{
    constructor() {
        this.client = redis.createClient(process.env.CACHE_ENDPOINT)
        this.seperator = ':'
        this.whenFlush = this.whenFlush.bind(this)
        this.whenQuit = this.whenQuit.bind(this)
        this.whenExists = this.whenExists.bind(this)
        this.whenGet = this.whenGet.bind(this)
        this.whenHscan = this.whenHscan.bind(this)
        this.whenHashScan = this.whenHashScan.bind(this)
        this.whenMembers = this.whenMembers.bind(this)
        this.whenStore = this.whenStore.bind(this)
    }

    whenFlush() { return this.client.flushdbAsync() }
   
    whenQuit() { return this.client.quitAsync() }

    whenExists(keys) { return this.client.existsAsync(...keys) }

    whenGet(setKey, hashField) { return this.client.hgetAsync(setKey, hashField) }
   
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
    
    whenMembers(setKey) { return this.client.smembersAsync(setKey) }

    whenStore(batch) {
        const setEntries = _.pick(batch, entry => entry instanceof SetEntry)
        const setPrefixes = _.keys(setEntries)
        const hashEntries = _.pick(batch, entry => entry instanceof HashEntry)
        const whenMembers = _.map(setPrefixes, this.whenMembers)
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
        return Promise.all(whenMembers).then(members => {    
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
                        setChanges.add(setPrefixes[i], setName)
                    }
                }
            }                        
            setChanges.update(transaction)
            return transaction.execAsync()           
                        .then(() => {
                            const promises = []      
                            transaction = this.client.multi()                      
                            for (let i = 0; i < setPrefixes.length; i++)
                            {
                                promises.push(..._.map(members[i], setName => 
                                    this.whenExists(setPrefixes[i] + this.seperator + setName)
                                        .then(exists => {
                                            if (!exists)
                                                transaction.srem(setPrefixes[i], setName)
                                            return Promise.resolve()
                                        })
                                ))                                
                            }
                            return Promise.all(promises)
                                          .then(() => 
                                          transaction.execAsync()
                                        )
                        })
        })               
    }
}

class SetChanges
{
    constructor() {
        this.changes = {}
        this.add = this.add.bind(this)
        this.remove = this.remove.bind(this)
        this.update = this.update.bind(this)
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
        Object.assign(this, _.object(hashFields, _.map(values, value => {
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