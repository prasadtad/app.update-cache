// cache/update-recipe.js

const RecipeKeys = require('./recipe-keys')
const _ = require('underscore')
const RedisProxy = require('../proxies/redis-proxy')

module.exports = class UpdateRecipe
{
    constructor(whenIngredients)
    {        
        this.redisProxyClient = new RedisProxy.Client()
        this.whenVeganIngredientIds = whenIngredients.then(ingredients => _.map(_.where(ingredients, i => i.vegan), i => i.id))
        this.keys = new RecipeKeys(this.redisProxyClient.seperator)
        this.buildKey = this.buildKey.bind(this)
        this.whenMergeIds = this.whenMergeIds.bind(this)
        this.whenBuildSearchEntry = this.whenBuildSearchEntry.bind(this)
        this.whenStore = this.whenStore.bind(this)
        this.whenRemove = this.whenRemove.bind(this)
        this.whenDisconnect = this.whenDisconnect.bind(this)
    }
    
    buildKey(setPrefix, flag) 
    {
        return setPrefix + this.redisProxyClient.seperator + (flag ? 'True' : 'False')
    }

    getTotalTime(totalTimeInMinutes)
    {
        if (totalTimeInMinutes <= 30) return 'Quick';
        if (totalTimeInMinutes <= 60) return 'Regular';
        return 'Slow';
    }

    getPhrases(value)
    {
        if (!value) return []
        const sentences = Array.isArray(value) ? value : [ value ]
        const sentencePhrases = _.map(sentences, sentence => {
            const phrases = sentence.toLowerCase().split(/[(),-\s]+/g)
            for (let j = phrases.length - 2; j >= 0; j--)
                phrases[j] = (phrases[j] + " " + phrases[j + 1]).trim()
            return phrases
        })
        return _.union(_.flatten(sentencePhrases))
    }
   
    whenMergeIds(phrase, id, add)
    {
        return this.redisProxyClient.whenGet(this.keys.SearchWords, phrase)
            .then(idsJoined => {
                const ids = idsJoined ? idsJoined.split(',') : []
                if (add) {
                    if (!ids.includes(id)) ids.push(id)
                } else {
                    const index = ids.indexOf(id)                                
                    if (index >= 0) ids.splice(index, 1)
                }
                return Promise.resolve(ids.join(','));
            })
    }

    whenBuildSearchEntry(id, oldNames, newNames) 
    {
        const phrases = _.flatten(this.getPhrases(newNames))
        const oldPhrases = _.difference(_.flatten(this.getPhrases(oldNames)), phrases)
        const whenPhraseIds = _.map(phrases, p => this.whenMergeIds(p, id, true))
        const whenOldPhraseIds = _.map(oldPhrases, p => this.whenMergeIds(p, id, false))

        phrases.push(...oldPhrases)
        whenPhraseIds.push(...whenOldPhraseIds)

        return Promise.all(whenPhraseIds)
                    .then(phraseIds => 
                        new RedisProxy.HashEntry(phrases, phraseIds)
                    )
    }

    whenStore(recipe)
    {
        return this.redisProxyClient.whenGet(this.keys.Names, recipe.id)
            .then(oldNames => this.whenBuildSearchEntry(recipe.id, oldNames ? oldNames.split('\n') : oldNames, recipe.names))
            .then(searchEntry => {
                return this.whenVeganIngredientIds
                    .then(veganIngredientIds => recipe.ingredientIds.every(ingredientId => veganIngredientIds.includes(ingredientId)))                    
                    .then(vegan => {
                        const batch = {};
                        batch[this.keys.Names] = new RedisProxy.HashEntry(recipe.id, recipe.names.join('\n'))
                        batch[this.keys.Vegan] = new RedisProxy.SetEntry(recipe.id, vegan)
                        batch[this.keys.IngredientId] = new RedisProxy.SetEntry(recipe.id, recipe.ingredientIds)
                        batch[this.keys.OvernightPreparation] = new RedisProxy.SetEntry(recipe.id, recipe.overnightPreparation)
                        batch[this.keys.Region] = new RedisProxy.SetEntry(recipe.id, recipe.region)
                        batch[this.keys.Cuisine] = new RedisProxy.SetEntry(recipe.id, recipe.cuisine)
                        batch[this.keys.SpiceLevel] = new RedisProxy.SetEntry(recipe.id, recipe.spiceLevel)
                        batch[this.keys.TotalTime] = new RedisProxy.SetEntry(recipe.id, this.getTotalTime(recipe.totalTimeInMinutes))
                        batch[this.keys.Collection] = new RedisProxy.SetEntry(recipe.id, recipe.collections)
                        batch[this.keys.SearchWords] = searchEntry
                return this.redisProxyClient.whenStore(batch);
            })            
        })
    }

    whenRemove(recipe)
    {
        return this.redisProxyClient.whenGet(this.keys.Names, recipe.id)
            .then(oldNames => this.whenBuildSearchEntry(recipe.id, oldNames ? oldNames.split('\n') : oldNames))
            .then(searchEntry => {
                const batch = {};
                batch[this.keys.Names] = new RedisProxy.HashEntry(recipe.id)
                batch[this.keys.Vegan] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.IngredientId] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.OvernightPreparation] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.Region] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.Cuisine] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.SpiceLevel] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.TotalTime] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.Collection] = new RedisProxy.SetEntry(recipe.id)
                batch[this.keys.SearchWords] = searchEntry
                return this.redisProxyClient.whenStore(batch);
            })
    }

    whenDisconnect()
    {
        return this.redisProxyClient.whenQuit()
    }
}


