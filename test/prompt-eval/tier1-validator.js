/**
 * Tier 1 Deterministic Prompt Evaluation Validator
 * 
 * Executes offline, fast (<1ms/recipe) rule-based assertions over
 * structured LLM outputs to guard against safety regressions,
 * schema drift, and constraint violations.
 */

class Tier1PromptValidator {
  /**
   * @param {Object} allergenDict - Dictionary mapping allergy keys to keyword arrays
   * @param {Object} [schemaDef] - Optional JSON schema reference
   */
  constructor(allergenDict, schemaDef = null) {
    this.allergenDict = allergenDict || {};
    this.schemaDef = schemaDef;
  }

  /**
   * Evaluates a full generated plan or single recipe against scenario constraints.
   * @param {Object|Array} output - Either a { recipes: [...] } object or an array of recipes
   * @param {Object} scenario - Test scenario parameter definition
   * @returns {Object} Evaluation report with pass/fail and diagnostics
   */
  evaluatePlan(output, scenario) {
    const recipes = Array.isArray(output) ? output : (output && output.recipes ? output.recipes : []);
    const report = {
      scenarioId: scenario.id || 'ANONYMOUS',
      category: scenario.category || 'General',
      title: scenario.title || 'Untitled Test Case',
      pass: true,
      totalRecipes: recipes.length,
      violations: [],
      metrics: {
        schemaValidCount: 0,
        allergenCleanCount: 0,
        avoidedCuisineCleanCount: 0,
        quickTimeCompliantCount: 0,
        pantryItemsDetected: []
      }
    };

    if (!recipes || recipes.length === 0) {
      report.pass = false;
      report.violations.push("Empty Plan Error: No recipes found in generated payload");
      return report;
    }

    // Expected meal count check
    if (scenario.params && scenario.params.mealCount && recipes.length !== scenario.params.mealCount) {
      report.violations.push(`Count Mismatch: Expected ${scenario.params.mealCount} recipes, got ${recipes.length}`);
    }

    const allPantryMatches = new Set();

    recipes.forEach((recipe, idx) => {
      const recipeEval = this.evaluateSingleRecipe(recipe, scenario.params || scenario, idx);
      if (!recipeEval.pass) {
        report.pass = false;
        report.violations.push(...recipeEval.violations);
      }
      if (recipeEval.schemaValid) report.metrics.schemaValidCount++;
      if (recipeEval.allergenClean) report.metrics.allergenCleanCount++;
      if (recipeEval.avoidedCuisineClean) report.metrics.avoidedCuisineCleanCount++;
      if (recipeEval.quickTimeCompliant) report.metrics.quickTimeCompliantCount++;
      if (recipeEval.pantryMatches) {
        recipeEval.pantryMatches.forEach(item => allPantryMatches.add(item));
      }
    });

    report.metrics.pantryItemsDetected = Array.from(allPantryMatches);
    if (report.violations.length > 0) {
      report.pass = false;
    }

    return report;
  }

  /**
   * Evaluates an individual recipe against constraints.
   */
  evaluateSingleRecipe(recipe, params, index = 0) {
    const result = {
      index,
      name: recipe ? recipe.name : `Recipe #${index + 1}`,
      pass: true,
      schemaValid: false,
      allergenClean: true,
      avoidedCuisineClean: true,
      quickTimeCompliant: true,
      pantryMatches: [],
      violations: []
    };

    if (!recipe || typeof recipe !== 'object') {
      result.pass = false;
      result.violations.push(`Recipe #${index + 1}: Invalid recipe object format`);
      return result;
    }

    // 1. JSON Schema & Required Field Assertions
    const requiredFields = ['name', 'description', 'prepTime', 'cookTime', 'ingredients', 'instructions'];
    const missing = requiredFields.filter(f => !recipe[f]);
    if (missing.length > 0) {
      result.violations.push(`Schema Error in '${result.name}': Missing required fields [${missing.join(', ')}]`);
    } else {
      if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
        result.violations.push(`Schema Error in '${result.name}': 'ingredients' must be a non-empty array`);
      } else {
        // Validate individual ingredient structure
        recipe.ingredients.forEach((ing, i) => {
          if (!ing.name || typeof ing.amount !== 'number' || typeof ing.unit !== 'string') {
            result.violations.push(`Schema Error in '${result.name}': Ingredient #${i + 1} must contain name, numeric amount, and unit string`);
          }
        });
      }

      if (!Array.isArray(recipe.instructions) || recipe.instructions.length === 0) {
        result.violations.push(`Schema Error in '${result.name}': 'instructions' must be a non-empty array`);
      } else {
        recipe.instructions.forEach((step, s) => {
          if (typeof step !== 'string' || step.trim().length === 0) {
            result.violations.push(`Schema Error in '${result.name}': Instruction step #${s + 1} must be a non-empty string`);
          }
        });
      }
    }

    if (result.violations.length === 0) {
      result.schemaValid = true;
    }

    const fullRecipeText = [
      recipe.name || '',
      recipe.description || '',
      ...(Array.isArray(recipe.ingredients) ? recipe.ingredients.map(i => `${i.amount} ${i.unit} ${i.name}`) : []),
      ...(Array.isArray(recipe.instructions) ? recipe.instructions : [])
    ].join(' ').toLowerCase();

    // 2. Allergen Hard Scan (P0 Zero-Tolerance Gate)
    const allergies = params.allergies || [];
    allergies.forEach(allergyKey => {
      const normalizedKey = allergyKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const terms = this.allergenDict[normalizedKey] || this.allergenDict[allergyKey.toLowerCase()] || [allergyKey.toLowerCase()];
      terms.forEach(term => {
        // Word boundary regex
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(fullRecipeText)) {
          result.allergenClean = false;
          result.violations.push(`P0 Allergen Violation: Detected allergen term '${term}' for active allergy '${allergyKey}' in '${result.name}'`);
        }
      });
    });

    // 3. Avoided Cuisine Absence Check (P0 Hard Negative)
    const avoidedCuisines = params.avoidedCuisines || [];
    avoidedCuisines.forEach(cuisine => {
      const escaped = cuisine.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(fullRecipeText) || (recipe.name && new RegExp(`\\b${escaped}\\b`, 'i').test(recipe.name))) {
        result.avoidedCuisineClean = false;
        result.violations.push(`P0 Cuisine Violation: Detected avoided cuisine indicator '${cuisine}' in '${result.name}'`);
      }
    });

    // 4. Time Bound Constraint (Quick Tag <= 30 mins)
    const tags = params.tags || [];
    if (tags.includes('quick')) {
      const parseMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const match = String(timeStr).match(/(\d+)\s*(?:min|m)/i);
        return match ? parseInt(match[1], 10) : 0;
      };
      const prep = parseMinutes(recipe.prepTime);
      const cook = parseMinutes(recipe.cookTime);
      const totalTime = prep + cook;
      if (totalTime > 30) {
        result.quickTimeCompliant = false;
        result.violations.push(`P1 Time Violation: Total time ${totalTime}m (${prep}m prep + ${cook}m cook) exceeds 30m maximum for 'quick' tag in '${result.name}'`);
      }
    }

    // 5. Pantry Ingredient Token Stemming & Detection
    const pantryItems = params.pantryIngredients || [];
    if (pantryItems.length > 0 && Array.isArray(recipe.ingredients)) {
      const ingredientNames = recipe.ingredients.map(i => (i.name || '').toLowerCase()).join(' ');
      pantryItems.forEach(item => {
        const tokens = item.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const match = tokens.some(t => ingredientNames.includes(t));
        if (match) {
          result.pantryMatches.push(item);
        }
      });
    }

    // 6. Avoid / Duplicate Collision Detection
    const avoidList = params.avoidList || params.reusedRecipeNames || [];
    if (avoidList.length > 0 && recipe.name) {
      const nameLower = recipe.name.toLowerCase();
      avoidList.forEach(avoidItem => {
        if (nameLower === avoidItem.toLowerCase() || nameLower.includes(avoidItem.toLowerCase())) {
          result.violations.push(`P1 Collision Violation: Generated recipe '${recipe.name}' collides with avoid list item '${avoidItem}'`);
        }
      });
    }

    if (result.violations.length > 0) {
      result.pass = false;
    }

    return result;
  }
}

module.exports = Tier1PromptValidator;
