// cache/update-recipe.js

const _ = require('lodash')
const RedisPoco = require('redis-poco')
const RedisPhraseComplete = require('redis-phrase-complete')

module.exports = class UpdateRecipe
{
    constructor(whenIngredients)
    {        
        this.redisPoco = new RedisPoco({ namespace: 'recipe', itemKey: 'item', endpoint: process.env.CACHE_ENDPOINT, attributes: [ 'vegan', 'totalTimeInMinutes', 'approved', 'spiceLevel', 'region', 'cuisine', 'chefId', 'ingredientIds', 'overnightPreparation', 'accompanimentIds', 'collections' ]})
        this.whenVeganIngredientIds = whenIngredients.then(ingredients => _.map(_.filter(ingredients, i => i.vegan), i => i.id))
        this.redisPhraseComplete = new RedisPhraseComplete({ namespace: 'recipe:autocomplete', client: this.redisPoco.client })
        _.bindAll(this, 'whenUpdateSearch', 'whenStore', 'whenRemove', 'whenQuit')
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
        return this.redisPoco.whenGet(recipe.id)
            .then(oldRecipe => this.whenUpdateSearch(recipe.id, oldRecipe ? oldRecipe.names : null, recipe.names))
            .then(this.whenVeganIngredientIds)
            .then(veganIngredientIds => recipe.ingredientIds.every(ingredientId => veganIngredientIds.includes(ingredientId)))                    
            .then(vegan => {
                recipe.vegan = vegan
                return this.redisPoco.whenStore(recipe)
            })                    
    }

    whenRemove(id)
    {
        return this.redisPoco.whenGet(id)
            .then(oldRecipe => this.whenUpdateSearch(id, oldRecipe.names))
            .then(() => this.redisPoco.whenRemove(id))
    }

    whenQuit()
    {
        return this.redisPoco.whenQuit()
    }
}


