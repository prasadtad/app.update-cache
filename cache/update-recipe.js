// cache/update-recipe.js

const RecipeKeys = require('./recipe-keys')
const _ = require('lodash')
const RedisProxy = require('../proxies/redis-proxy')
const RedisPhraseComplete = require('redis-phrase-complete')

module.exports = class UpdateRecipe
{
    constructor(whenIngredients)
    {        
        this.redisProxyClient = new RedisProxy.Client()
        this.whenVeganIngredientIds = whenIngredients.then(ingredients => _.map(_.filter(ingredients, i => i.vegan), i => i.id))
        this.keys = new RecipeKeys(this.redisProxyClient.seperator)
        this.redisPhraseComplete = new RedisPhraseComplete({ client: this.redisProxyClient.client, namespace: this.keys.Autocomplete })
        _.bindAll(this, 'buildKey', 'whenUpdateSearch', 'whenStore', 'whenRemove', 'whenQuit')
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

    whenUpdateSearch(id, oldNames, newNames) 
    {
        oldNames = oldNames || []
        newNames = newNames || [] 
        
        const sentencesToRemove = _.without(oldNames, newNames)
        const sentencesToAdd = _.without(newNames, oldNames)

        return Promise.all(_.map(sentencesToRemove, sentence => this.redisPhraseComplete.whenRemove(sentence, id)))
                    .then(_.map(sentencesToAdd, sentence => this.redisPhraseComplete.whenAdd(sentence, id)))
    }

    whenStore(recipe)
    {
        return this.redisProxyClient.whenGet(this.keys.Names, recipe.id)
            .then(oldNames => this.whenUpdateSearch(recipe.id, oldNames ? oldNames.split('\n') : oldNames, recipe.names))
            .then(this.whenVeganIngredientIds)
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
                return this.redisProxyClient.whenStore(batch);
            })                    
    }

    whenRemove(recipe)
    {
        return this.redisProxyClient.whenGet(this.keys.Names, recipe.id)
            .then(oldNames => this.whenUpdateSearch(recipe.id, oldNames ? oldNames.split('\n') : oldNames))
            .then(() => {
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
                return this.redisProxyClient.whenStore(batch);
            })
    }

    whenQuit()
    {
        return this.redisProxyClient.whenQuit()
    }
}


