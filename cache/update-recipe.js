// cache/update-recipe.js

const _ = require('lodash')
const RedisPoco = require('redis-poco')
const RedisPhraseComplete = require('redis-phrase-complete')

module.exports = class UpdateRecipe
{
    constructor(whenIngredients)
    {        
        this.redisPoco = new RedisPoco({ namespace: 'recipe', itemKey: 'item', endpoint: process.env.CACHE_ENDPOINT, attributes: [ 'vegan', 'totalTimeInMinutes', 'approved', 'spiceLevel', 'region', 'cuisine', 'chefId', 'ingredientIds', 'overnightPreparation', 'accompanimentIds', 'collections' ]})
        this.whenIngredients = whenIngredients
        this.redisPhraseComplete = new RedisPhraseComplete({ namespace: 'recipe:autocomplete', client: this.redisPoco.client })
        _.bindAll(this, 'whenUpdateSearch', 'whenStore', 'whenRemove', 'whenQuit')
    }

    whenUpdateSearch(oldRecipe, newRecipe) 
    {
        oldRecipe = oldRecipe || { }
        newRecipe = newRecipe || { }

        const id = newRecipe ? newRecipe.id : oldRecipe.id

        let oldNames = oldRecipe.names || []
        let newNames = newRecipe.names || [] 
        
        if (!oldRecipe.approved) oldNames = []
        if (!newRecipe.approved) newNames = []

        const sentencesToRemove = _.without(oldNames, newNames)
        const sentencesToAdd = _.without(newNames, oldNames)

        return Promise.all(_.map(sentencesToRemove, sentence => this.redisPhraseComplete.whenRemove(sentence, id)))
                    .then(_.map(sentencesToAdd, sentence => this.redisPhraseComplete.whenAdd(sentence, id)))
    }

    whenStore(recipe)
    {
        return this.redisPoco.whenGet(recipe.id)
            .then(oldRecipe => this.whenUpdateSearch(oldRecipe, recipe))
            .then(() => {
                if (this.veganIngredientIds) return Promise.resolve(this.veganIngredientIds)
                return this.whenIngredients.then(ingredients => Promise.resolve(_.map(_.filter(ingredients, i => i.vegan), i => i.id)))
            })
            .then(veganIngredientIds => {
                this.veganIngredientIds = veganIngredientIds
                return Promise.resolve(recipe.ingredientIds.every(ingredientId => veganIngredientIds.includes(ingredientId)))
            })                    
            .then(vegan => {
                recipe.vegan = vegan
                return this.redisPoco.whenStore(recipe)
            })                    
    }

    whenRemove(id)
    {
        return this.redisPoco.whenGet(id)
            .then(oldRecipe => this.whenUpdateSearch(oldRecipe))
            .then(() => this.redisPoco.whenRemove(id))
    }

    whenQuit()
    {
        return this.redisPoco.whenQuit()
    }
}


