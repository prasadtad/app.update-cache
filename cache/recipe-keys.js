// cache/recipe-keys.js

module.exports = class RecipeKeys
{
    constructor(seperator)
    {
        this.seperator = seperator
        this.Names = this.buildKey('Names')
        this.ChefId = this.buildKey('ChefId')
        this.Collection = this.buildKey('Collection')
        this.Cuisine = this.buildKey('Cuisine')
        this.IngredientId = this.buildKey('IngredientId')
        this.OvernightPreparation = this.buildKey('OvernightPreparation')
        this.Region = this.buildKey('Region')
        this.SpiceLevel = this.buildKey('SpiceLevel')
        this.TotalTime = this.buildKey('TotalTime')
        this.Vegan = this.buildKey('Vegan')        

        this.SearchWords = this.buildKey('SearchWords')

        this.RecentSearches = this.buildKey('RecentSearches')

        this.Locks = this.buildKey('Locks')
    }

    buildKey(set)
    {
        return 'Recipe' + this.seperator + set;
    }
}