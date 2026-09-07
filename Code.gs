/**
 * Automated Meal Planning Assistant Backend
 * Deployed fully within Google Apps Script
 */

var DB_FILENAME = "Automated_Meal_Planner_DB.json";
var PARENT_FOLDER_NAME = "Meal Plan Recipes";
var SHOPPING_LISTS_FOLDER_NAME = "Shopping Lists";

/**
 * Serves the HTML web page.
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Automated Meal Planning Assistant')
    .setFaviconUrl('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f37d.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Gets or creates the primary JSON database file in Google Drive.
 */
function getDatabaseFile() {
  var files = DriveApp.getFilesByName(DB_FILENAME);
  if (files.hasNext()) {
    return files.next();
  } else {
    var defaultDb = {
      preferences: {
        allergies: "No eggs.",
        dietaryPreferences: "Strong preference for high protein and seasonal vegetables.",
        cuisinePreferences: {},
        dinersCount: 2,
        defaultMealTime: "06:00 PM",
        skipWelcomePage: false
      },
      mealPlan: null,
      lastUpdated: new Date().toISOString()
    };
    return DriveApp.createFile(DB_FILENAME, JSON.stringify(defaultDb, null, 2), MimeType.PLAIN_TEXT);
  }
}

/**
 * Loads the application state (database contents and API key status).
 */
function loadAppData() {
  try {
    var file = getDatabaseFile();
    var content = file.getBlob().getDataAsString();
    var db = JSON.parse(content);
    
    // Schema Migrations if older version DB file exists in user's Drive:
    var updated = false;
    if (!db.preferences) {
      db.preferences = {};
    }
    
    // Migrate 'restrictions' -> 'dietaryPreferences'
    if (db.preferences.restrictions !== undefined && db.preferences.dietaryPreferences === undefined) {
      db.preferences.dietaryPreferences = db.preferences.restrictions;
      delete db.preferences.restrictions;
      updated = true;
    }
    // Ensure cuisinePreferences exists
    if (db.preferences.cuisinePreferences === undefined) {
      db.preferences.cuisinePreferences = {};
      updated = true;
    }
    // Ensure dinersCount exists
    if (db.preferences.dinersCount === undefined) {
      db.preferences.dinersCount = 2;
      updated = true;
    }
    // Ensure defaultMealTime exists
    if (db.preferences.defaultMealTime === undefined) {
      db.preferences.defaultMealTime = "06:00 PM";
      updated = true;
    }
    // Ensure skipWelcomePage exists
    if (db.preferences.skipWelcomePage === undefined) {
      db.preferences.skipWelcomePage = false;
      updated = true;
    }
    // Ensure recipeRatings exists
    if (db.recipeRatings === undefined) {
      db.recipeRatings = {};
      updated = true;
    }
    // Ensure recipeLibrary exists
    if (db.recipeLibrary === undefined) {
      db.recipeLibrary = {};
      updated = true;
    }
    
    if (updated) {
      file.setContent(JSON.stringify(db, null, 2));
    }
    
    var effectiveKey = getEffectiveApiKey();
    var userProperties = PropertiesService.getUserProperties();
    var scriptProperties = PropertiesService.getScriptProperties();
    var personalKey = userProperties.getProperty('GEMINI_API_KEY');
    var sharedKey = scriptProperties.getProperty('SHARED_GEMINI_API_KEY') || scriptProperties.getProperty('GEMINI_API_KEY');
    
    return {
      db: db,
      hasApiKey: effectiveKey.keyType !== 'none',
      apiKeyStatus: {
        hasPersonalKey: !!(personalKey && personalKey.trim().length > 0),
        hasSharedKey: !!(sharedKey && sharedKey.trim().length > 0),
        activeKeyType: effectiveKey.keyType
      }
    };
  } catch (e) {
    Logger.log("Error loading app data: " + e.toString());
    throw new Error("Failed to load app data: " + e.message);
  }
}

/**
 * Resolves the effective Gemini API key using the Hybrid model.
 * Checks User Properties first (personal key). If absent, falls back to Script Properties (shared starter key).
 */
function getEffectiveApiKey() {
  var userProperties = PropertiesService.getUserProperties();
  var personalKey = userProperties.getProperty('GEMINI_API_KEY');
  if (personalKey && personalKey.trim().length > 0) {
    return {
      key: personalKey.trim(),
      keyType: 'personal'
    };
  }

  var scriptProperties = PropertiesService.getScriptProperties();
  var sharedKey = scriptProperties.getProperty('SHARED_GEMINI_API_KEY') || scriptProperties.getProperty('GEMINI_API_KEY');
  if (sharedKey && sharedKey.trim().length > 0) {
    return {
      key: sharedKey.trim(),
      keyType: 'shared'
    };
  }

  return {
    key: null,
    keyType: 'none'
  };
}

/**
 * Admin helper to set the shared starter API key in Script Properties.
 * Can be run from the Apps Script editor or called by project owner.
 */
function setSharedApiKey(apiKey) {
  try {
    var scriptProperties = PropertiesService.getScriptProperties();
    if (apiKey && apiKey.trim().length > 0) {
      scriptProperties.setProperty('SHARED_GEMINI_API_KEY', apiKey.trim());
    } else {
      scriptProperties.deleteProperty('SHARED_GEMINI_API_KEY');
    }
    return { success: true };
  } catch (e) {
    Logger.log("Error setting shared API Key: " + e.toString());
    throw new Error("Failed to set shared API Key: " + e.message);
  }
}

/**
 * Saves preferences to the Drive database.
 */
function savePreferences(preferences) {
  try {
    var file = getDatabaseFile();
    var content = file.getBlob().getDataAsString();
    var db = JSON.parse(content);
    
    db.preferences = {
      allergies: preferences.allergies || "",
      dietaryPreferences: preferences.dietaryPreferences || "",
      cuisinePreferences: (preferences.cuisinePreferences && typeof preferences.cuisinePreferences === 'object') ? preferences.cuisinePreferences : {},
      dinersCount: parseInt(preferences.dinersCount, 10) || 2,
      defaultMealTime: preferences.defaultMealTime || "06:00 PM",
      skipWelcomePage: !!preferences.skipWelcomePage
    };
    db.lastUpdated = new Date().toISOString();
    
    file.setContent(JSON.stringify(db, null, 2));
    return { success: true, db: db };
  } catch (e) {
    Logger.log("Error saving preferences: " + e.toString());
    throw new Error("Failed to save preferences: " + e.message);
  }
}

/**
 * Quick updates the skip welcome page preference.
 */
function setSkipWelcomePreference(skip) {
  try {
    var file = getDatabaseFile();
    var content = file.getBlob().getDataAsString();
    var db = JSON.parse(content);
    if (!db.preferences) db.preferences = {};
    db.preferences.skipWelcomePage = !!skip;
    db.lastUpdated = new Date().toISOString();
    
    file.setContent(JSON.stringify(db, null, 2));
    return { success: true, skipWelcomePage: db.preferences.skipWelcomePage };
  } catch (e) {
    Logger.log("Error saving skip welcome preference: " + e.toString());
    throw new Error("Failed to save skip welcome preference: " + e.message);
  }
}

/**
 * Saves the Gemini API key securely in User Properties.
 */
function saveApiKey(apiKey) {
  try {
    var userProperties = PropertiesService.getUserProperties();
    userProperties.setProperty('GEMINI_API_KEY', apiKey.trim());
    var effectiveKey = getEffectiveApiKey();
    return { 
      success: true,
      apiKeyStatus: {
        hasPersonalKey: true,
        hasSharedKey: effectiveKey.keyType === 'shared' || !!(PropertiesService.getScriptProperties().getProperty('SHARED_GEMINI_API_KEY') || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')),
        activeKeyType: 'personal'
      }
    };
  } catch (e) {
    Logger.log("Error saving API Key: " + e.toString());
    throw new Error("Failed to save API Key: " + e.message);
  }
}

/**
 * Deletes the Gemini API key from User Properties.
 */
function deleteApiKey() {
  try {
    var userProperties = PropertiesService.getUserProperties();
    userProperties.deleteProperty('GEMINI_API_KEY');
    var effectiveKey = getEffectiveApiKey();
    return { 
      success: true,
      apiKeyStatus: {
        hasPersonalKey: false,
        hasSharedKey: effectiveKey.keyType === 'shared',
        activeKeyType: effectiveKey.keyType
      }
    };
  } catch (e) {
    Logger.log("Error deleting API Key: " + e.toString());
    throw new Error("Failed to delete API Key: " + e.message);
  }
}

/**
 * Toggles the single-star favorite (bookmark) status for a recipe in the database.
 * Also caches structured recipe details in db.recipeLibrary if recipeObj is passed.
 */
function toggleFavoriteRecipeServer(recipeName, isFavorite, recipeObj) {
  try {
    if (!recipeName) throw new Error("Recipe name is required.");
    isFavorite = !!isFavorite;
    
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    if (!db.recipeRatings) {
      db.recipeRatings = {};
    }
    if (!db.recipeLibrary) {
      db.recipeLibrary = {};
    }
    
    db.recipeRatings[recipeName] = {
      isFavorite: isFavorite,
      rating: isFavorite ? 5 : 0,
      favoritedAt: new Date().toISOString()
    };
    
    if (recipeObj && typeof recipeObj === 'object') {
      db.recipeLibrary[recipeName] = {
        name: recipeObj.name || recipeName,
        description: recipeObj.description || "",
        prepTime: recipeObj.prepTime || "20 mins",
        cookTime: recipeObj.cookTime || "30 mins",
        ingredients: recipeObj.ingredients || [],
        instructions: recipeObj.instructions || [],
        docUrl: recipeObj.docUrl || "",
        docId: recipeObj.docId || "",
        originalDiners: parseInt(recipeObj.originalDiners, 10) || parseInt(db.preferences.dinersCount, 10) || 2,
        dateAdded: new Date().toISOString()
      };
    }
    
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));
    
    return {
      success: true,
      isFavorite: isFavorite,
      rating: isFavorite ? 5 : 0,
      recipeRatings: db.recipeRatings,
      recipeLibrary: db.recipeLibrary
    };
  } catch (e) {
    Logger.log("Error toggling recipe favorite: " + e.toString());
    throw new Error("Failed to update favorite status: " + e.message);
  }
}

/**
 * Sets the star rating for a recipe in the database (backward compatible).
 */
function setRecipeRating(recipeName, rating) {
  try {
    if (!recipeName) throw new Error("Recipe name is required.");
    rating = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
    var isFavorite = rating > 0;
    
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    if (!db.recipeRatings) {
      db.recipeRatings = {};
    }
    
    db.recipeRatings[recipeName] = {
      isFavorite: isFavorite,
      rating: rating,
      ratedAt: new Date().toISOString(),
      favoritedAt: isFavorite ? new Date().toISOString() : null
    };
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));
    
    return { success: true, rating: rating, isFavorite: isFavorite, recipeRatings: db.recipeRatings };
  } catch (e) {
    Logger.log("Error setting recipe rating: " + e.toString());
    throw new Error("Failed to set recipe rating: " + e.message);
  }
}

/**
 * Saves the active meal plan recipes array when updated on the client (e.g. adding or removing recipes).
 */
function saveActiveMealPlanServer(recipesList) {
  try {
    if (!Array.isArray(recipesList)) {
      throw new Error("Invalid recipes list.");
    }
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    
    if (!db.mealPlan) {
      db.mealPlan = {
        generatedAt: new Date().toISOString(),
        approved: false,
        recipes: []
      };
    }
    
    db.mealPlan.recipes = recipesList;
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));
    
    return { success: true, db: db };
  } catch (e) {
    Logger.log("Error saving active meal plan: " + e.toString());
    throw new Error("Failed to save active meal plan: " + e.message);
  }
}

/**
 * Fallback parser for legacy recipe Google Docs that aren't in recipeLibrary
 */
function parseRecipeDocFallback(docFile, dinersCount) {
  var name = docFile.getName().replace(/^\d{8}\s*-\s*/, '');
  var recipe = {
    name: name,
    description: "Classic home favorite from your recipe history.",
    prepTime: "20 mins",
    cookTime: "30 mins",
    ingredients: [],
    instructions: [],
    docUrl: docFile.getUrl(),
    docId: docFile.getId(),
    originalDiners: dinersCount || 2
  };
  
  try {
    var doc = DocumentApp.openById(docFile.getId());
    var body = doc.getBody();
    var numChildren = body.getNumChildren();
    var currentSection = "";
    
    for (var i = 0; i < numChildren; i++) {
      var child = body.getChild(i);
      var text = child.asText().getText().trim();
      if (!text) continue;
      
      if (text.toLowerCase() === "ingredients") {
        currentSection = "ingredients";
      } else if (text.toLowerCase() === "instructions") {
        currentSection = "instructions";
      } else if (currentSection === "ingredients") {
        var ingMatch = text.match(/^([\d\.\/]+)\s*([a-zA-Z]+)?\s+(.+)$/);
        if (ingMatch) {
          recipe.ingredients.push({
            amount: parseFloat(ingMatch[1]) || 1,
            unit: ingMatch[2] || "unit",
            name: ingMatch[3]
          });
        } else {
          recipe.ingredients.push({
            amount: 1,
            unit: "unit",
            name: text
          });
        }
      } else if (currentSection === "instructions") {
        var cleanStep = text.replace(/^\d+\.\s*/, '');
        recipe.instructions.push(cleanStep);
      } else if (!currentSection && i === 1) {
        recipe.description = text;
      }
    }
  } catch (err) {
    Logger.log("Fallback doc parse note: " + err.toString());
  }
  
  if (recipe.ingredients.length === 0) {
    recipe.ingredients.push({ name: name + " main ingredients", amount: 1, unit: "serving" });
  }
  if (recipe.instructions.length === 0) {
    recipe.instructions.push("Follow instructions in original Google Doc.");
  }
  return recipe;
}

var TAG_DIRECTIVES = {
  quick: "- Speed & Prep: Ensure all recipes require under 30 minutes of total active prep and cooking time combined.",
  one_pot: "- Minimal Cleanup: Prioritize single-pot, single-skillet, or sheet-pan meals requiring minimal cookware and easy cleanup.",
  kid_friendly: "- Family & Kids: Focus on mild, approachable, kid-approved flavor profiles with familiar textures and no overly pungent/spicy seasonings.",
  slow_cooker: "- Hands-Off Cooking: Prioritize slow-cooker (Crock-Pot), multi-cooker, or Instant Pot recipes suitable for hands-off cooking.",
  high_veggie: "- Fresh & Light: Emphasize vegetable-forward, nutrient-dense, lighter dinners with vibrant seasonal produce.",
  comfort: "- Comfort Food: Feature hearty, satisfying, warm comfort food classics (e.g. casseroles, bakes, comforting pasta dishes)."
};

/**
 * Builds prompt directives string from selected constraint tag keys.
 */
function buildTagDirectivesText(selectedTags) {
  if (!Array.isArray(selectedTags) || selectedTags.length === 0) return "";
  var lines = [];
  selectedTags.forEach(function(tag) {
    if (TAG_DIRECTIVES[tag]) {
      lines.push(TAG_DIRECTIVES[tag]);
    }
  });
  if (lines.length === 0) return "";
  return lines.join("\n") + "\n";
}

/**
 * Calls the Gemini API to reroll/swap a single recipe at targetIndex, avoiding duplicates of all other meals in the plan.
 */
function rerollSingleRecipeServer(targetIndex, existingRecipes, planPreferences, selectedTags) {
  try {
    targetIndex = parseInt(targetIndex, 10);
    if (isNaN(targetIndex) || targetIndex < 0) {
      throw new Error("Invalid target recipe index.");
    }
    planPreferences = planPreferences ? String(planPreferences).trim() : "";
    selectedTags = Array.isArray(selectedTags) ? selectedTags : [];
    existingRecipes = Array.isArray(existingRecipes) ? existingRecipes : [];

    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    var prefs = db.preferences;

    var effectiveKey = getEffectiveApiKey();
    if (effectiveKey.keyType === 'none' || !effectiveKey.key) {
      throw new Error("Gemini API key is not configured. Please set it in the Settings panel.");
    }
    var apiKey = effectiveKey.key;

    // Extract Preferred and Avoided Cuisines
    var cuisinePrefs = prefs.cuisinePreferences || {};
    var preferredCuisines = [];
    var avoidedCuisines = [];
    for (var cuisineKey in cuisinePrefs) {
      if (cuisinePrefs[cuisineKey] === 'prefer') {
        preferredCuisines.push(cuisineKey);
      } else if (cuisinePrefs[cuisineKey] === 'avoid') {
        avoidedCuisines.push(cuisineKey);
      }
    }
    var cuisineConstraintText = "";
    if (preferredCuisines.length > 0) {
      cuisineConstraintText += "- Preferred Cuisines: Prioritize and feature dinner recipes inspired by the following cuisines: " + preferredCuisines.join(", ") + ".\n";
    }
    if (avoidedCuisines.length > 0) {
      cuisineConstraintText += "- Avoided Cuisines: Strictly DO NOT generate any recipes, flavor profiles, or dishes associated with the following cuisines: " + avoidedCuisines.join(", ") + ".\n";
    }

    // Build Avoid Duplicates list from all existing recipes in the plan
    var existingNames = [];
    existingRecipes.forEach(function(r, idx) {
      if (r && r.name && idx !== targetIndex) {
        existingNames.push(r.name);
      }
    });
    if (existingRecipes[targetIndex] && existingRecipes[targetIndex].name) {
      existingNames.push(existingRecipes[targetIndex].name);
    }

    var avoidText = "";
    if (existingNames.length > 0) {
      avoidText = "- Avoid Duplicating Planned Meals: The user already has or wants to replace the following dishes: [" + 
                  existingNames.join(", ") + "]. Do NOT generate duplicates or dishes with identical primary flavor profiles.\n";
    }

    var tagDirectivesText = buildTagDirectivesText(selectedTags);

    var prompt = "You are a professional chef. Generate exactly 1 single replacement dinner recipe. " +
                 "Scale all ingredient quantities in the recipe to feed exactly " + prefs.dinersCount + " diners.\n" +
                 "You MUST strictly follow these constraints:\n" +
                 "- Allergy Constraint: " + (prefs.allergies || "None specified") + "\n" +
                 "- Dietary Preferences: " + (prefs.dietaryPreferences || "None specified") + "\n" +
                 cuisineConstraintText +
                 avoidText +
                 tagDirectivesText +
                 (planPreferences ? "- Specific Preferences / Requests for this meal plan: " + planPreferences + "\n\n" : "\n\n") +
                 "Provide a unique, delicious dinner meal. The recipe must have ingredients, amounts, units, and clear step-by-step instructions. " +
                 "Format the output strictly according to the requested JSON schema. Do not return any other text or explanation outside the JSON structure.";

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + apiKey;

    var payload = {
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            description: { type: "STRING" },
            prepTime: { type: "STRING", description: "e.g., '15 mins'" },
            cookTime: { type: "STRING", description: "e.g., '35 mins'" },
            ingredients: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING", description: "Ingredient name (e.g. russet potatoes, olive oil)" },
                  amount: { type: "NUMBER", description: "Numerical quantity" },
                  unit: { type: "STRING", description: "Unit of measure (e.g. lbs, oz, tbsp, cups, whole)" }
                },
                required: ["name", "amount", "unit"]
              }
            },
            instructions: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: ["name", "description", "prepTime", "cookTime", "ingredients", "instructions"]
        }
      }
    };

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode !== 200) {
      if (responseCode === 429) {
        if (effectiveKey.keyType === 'shared') {
          throw new Error("The shared starter API quota is temporarily full. Please wait a moment, or add your own free personal API key in Settings for instant dedicated access.");
        } else {
          throw new Error("Your personal Gemini API rate limit / quota has been reached. Please check your Google AI Studio quota limits.");
        }
      }
      throw new Error("Gemini API error (Status " + responseCode + "): " + responseText);
    }

    var jsonResponse = JSON.parse(responseText);
    var responseJsonText = jsonResponse.candidates[0].content.parts[0].text;
    var newRecipe = JSON.parse(responseJsonText);

    if (!newRecipe || !newRecipe.name) {
      throw new Error("Gemini returned an invalid replacement recipe.");
    }

    // Update active plan in database
    if (!db.mealPlan) {
      db.mealPlan = {
        recipes: [],
        approved: false,
        generatedAt: new Date().toISOString(),
        executionResult: null
      };
    }
    if (!db.mealPlan.recipes) {
      db.mealPlan.recipes = [];
    }

    if (targetIndex < db.mealPlan.recipes.length) {
      db.mealPlan.recipes[targetIndex] = newRecipe;
    } else {
      db.mealPlan.recipes.push(newRecipe);
    }
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));

    return {
      success: true,
      newRecipe: newRecipe,
      targetIndex: targetIndex,
      db: db
    };
  } catch (e) {
    Logger.log("Error rerolling single recipe: " + e.toString());
    throw new Error("Failed to swap recipe: " + e.message);
  }
}

/**
 * Calls the Gemini API to generate a weekly meal plan based on preferences,
 * supporting ephemeral reuse of past recipes, locked recipe preservation, and constraint tags.
 */
function generateMealPlanServer(mealCount, planPreferences, reusedRecipeNames, selectedTags, lockedIndices) {
  try {
    mealCount = parseInt(mealCount, 10) || 7;
    planPreferences = planPreferences ? String(planPreferences).trim() : "";
    reusedRecipeNames = Array.isArray(reusedRecipeNames) ? reusedRecipeNames : [];
    selectedTags = Array.isArray(selectedTags) ? selectedTags : [];
    lockedIndices = Array.isArray(lockedIndices) ? lockedIndices : [];
    
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    var prefs = db.preferences;
    var recipeLibrary = db.recipeLibrary || {};
    var existingPlanRecipes = (db.mealPlan && Array.isArray(db.mealPlan.recipes)) ? db.mealPlan.recipes : [];
    
    // Resolve locked recipes from existing active plan
    var lockedMap = {};
    var lockedNames = [];
    var validLockedCount = 0;
    lockedIndices.forEach(function(idx) {
      var numIdx = parseInt(idx, 10);
      if (!isNaN(numIdx) && numIdx >= 0 && numIdx < existingPlanRecipes.length && numIdx < mealCount) {
        var rec = existingPlanRecipes[numIdx];
        if (rec && rec.name) {
          lockedMap[numIdx] = rec;
          lockedNames.push(rec.name);
          validLockedCount++;
        }
      }
    });

    // Resolve reused recipes
    var resolvedReused = [];
    reusedRecipeNames.forEach(function(rName) {
      var cached = recipeLibrary[rName];
      if (cached) {
        // Deep clone so scaling doesn't corrupt library
        var cloned = JSON.parse(JSON.stringify(cached));
        var origDiners = parseInt(cloned.originalDiners, 10) || parseInt(prefs.dinersCount, 10) || 2;
        var currDiners = parseInt(prefs.dinersCount, 10) || 2;
        if (origDiners !== currDiners && cloned.ingredients) {
          cloned.ingredients.forEach(function(ing) {
            if (typeof ing.amount === 'number') {
              ing.amount = Math.round((ing.amount * currDiners / origDiners) * 100) / 100;
            }
          });
        }
        cloned.isReused = true;
        resolvedReused.push(cloned);
      } else {
        // Fallback: Check if file exists in Drive
        var parentFolder = getOrCreateFolder(PARENT_FOLDER_NAME);
        var files = parentFolder.getFiles();
        var foundFile = null;
        while (files.hasNext()) {
          var f = files.next();
          var match = f.getName().match(/^(\d{8})\s*-\s*(.+)$/);
          if (match && match[2].trim().toLowerCase() === rName.trim().toLowerCase()) {
            foundFile = f;
            break;
          }
        }
        if (foundFile) {
          var fallbackRecipe = parseRecipeDocFallback(foundFile, prefs.dinersCount);
          fallbackRecipe.isReused = true;
          resolvedReused.push(fallbackRecipe);
        }
      }
    });
    
    // Calculate remaining needed slots
    var maxReusedSlots = Math.max(0, mealCount - validLockedCount);
    var reusedToInclude = resolvedReused.slice(0, maxReusedSlots);
    var remainingCount = mealCount - (validLockedCount + reusedToInclude.length);
    var newlyGeneratedRecipes = [];
    
    if (remainingCount > 0) {
      // Need to generate remainingCount recipes with Gemini
      var effectiveKey = getEffectiveApiKey();
      if (effectiveKey.keyType === 'none' || !effectiveKey.key) {
        throw new Error("Gemini API key is not configured. Please set it in the Settings panel.");
      }
      var apiKey = effectiveKey.key;
      
      // Extract Preferred and Avoided Cuisines
      var cuisinePrefs = prefs.cuisinePreferences || {};
      var preferredCuisines = [];
      var avoidedCuisines = [];
      for (var cuisineKey in cuisinePrefs) {
        if (cuisinePrefs[cuisineKey] === 'prefer') {
          preferredCuisines.push(cuisineKey);
        } else if (cuisinePrefs[cuisineKey] === 'avoid') {
          avoidedCuisines.push(cuisineKey);
        }
      }
      var cuisineConstraintText = "";
      if (preferredCuisines.length > 0) {
        cuisineConstraintText += "- Preferred Cuisines: Prioritize and feature dinner recipes inspired by the following cuisines: " + preferredCuisines.join(", ") + ".\n";
      }
      if (avoidedCuisines.length > 0) {
        cuisineConstraintText += "- Avoided Cuisines: Strictly DO NOT generate any recipes, flavor profiles, or dishes associated with the following cuisines: " + avoidedCuisines.join(", ") + ".\n";
      }
      
      // Avoid duplicating locked and reused recipes
      var avoidNames = [];
      reusedToInclude.forEach(function(r) { avoidNames.push(r.name); });
      lockedNames.forEach(function(name) {
        if (avoidNames.indexOf(name) === -1) avoidNames.push(name);
      });

      var reusedAvoidText = "";
      if (avoidNames.length > 0) {
        reusedAvoidText = "- Avoid Duplicating Planned Meals: The user has already selected/locked the following dishes for this meal plan: [" + 
                          avoidNames.join(", ") + "]. Do NOT generate duplicates or dishes with identical primary flavor profiles.\n";
      }

      var tagDirectivesText = buildTagDirectivesText(selectedTags);

      // Construct the Gemini API Prompt
      var prompt = "You are a professional chef. Generate a dinner meal plan consisting of exactly " + remainingCount + " dinner recipes. " +
                   "Scale all ingredient quantities in every recipe to feed exactly " + prefs.dinersCount + " diners.\n" +
                   "You MUST strictly follow these constraints:\n" +
                   "- Allergy Constraint: " + (prefs.allergies || "None specified") + "\n" +
                   "- Dietary Preferences: " + (prefs.dietaryPreferences || "None specified") + "\n" +
                   cuisineConstraintText +
                   reusedAvoidText +
                   tagDirectivesText +
                   (planPreferences ? "- Specific Preferences / Requests for this meal plan: " + planPreferences + "\n\n" : "\n\n") +
                   "Provide a variety of dinner meals. Every recipe must have ingredients, amounts, units, and clear step-by-step instructions. " +
                   "Format the output strictly according to the requested JSON schema. Do not return any other text or explanation outside the JSON structure.";
                   
      var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + apiKey;
      
      // Define the response schema to guarantee JSON formatting
      var payload = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              recipes: {
                type: "ARRAY",
                description: "A list of " + remainingCount + " dinner recipes satisfying all constraints",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    description: { type: "STRING" },
                    prepTime: { type: "STRING", description: "e.g., '15 mins'" },
                    cookTime: { type: "STRING", description: "e.g., '35 mins'" },
                    ingredients: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          name: { type: "STRING", description: "Ingredient name (e.g. russet potatoes, olive oil)" },
                          amount: { type: "NUMBER", description: "Numerical quantity" },
                          unit: { type: "STRING", description: "Unit of measure (e.g. lbs, oz, tbsp, cups, whole)" }
                        },
                        required: ["name", "amount", "unit"]
                      }
                    },
                    instructions: {
                      type: "ARRAY",
                      items: { type: "STRING" }
                    }
                  },
                  required: ["name", "description", "prepTime", "cookTime", "ingredients", "instructions"]
                }
              }
            },
            required: ["recipes"]
          }
        }
      };
      
      var options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();
      var responseText = response.getContentText();
      
      if (responseCode !== 200) {
        if (responseCode === 429) {
          if (effectiveKey.keyType === 'shared') {
            throw new Error("The shared starter API quota is temporarily full. Please wait a moment, or add your own free personal API key in Settings (under '✨ Create API Key') for instant dedicated access.");
          } else {
            throw new Error("Your personal Gemini API rate limit / quota has been reached. Please check your Google AI Studio quota limits.");
          }
        }
        throw new Error("Gemini API error (Status " + responseCode + "): " + responseText);
      }
      
      var jsonResponse = JSON.parse(responseText);
      var responseJsonText = jsonResponse.candidates[0].content.parts[0].text;
      var result = JSON.parse(responseJsonText);
      
      if (!result.recipes || result.recipes.length === 0) {
        throw new Error("Gemini returned an empty recipes list.");
      }
      
      newlyGeneratedRecipes = result.recipes;
    }
    
    // Merge locked recipes in place, then fill empty slots with reused + newly generated
    var poolOfAvailable = reusedToInclude.concat(newlyGeneratedRecipes);
    var finalRecipes = [];
    var poolIdx = 0;
    
    for (var i = 0; i < mealCount; i++) {
      if (lockedMap[i]) {
        finalRecipes.push(lockedMap[i]);
      } else if (poolIdx < poolOfAvailable.length) {
        finalRecipes.push(poolOfAvailable[poolIdx]);
        poolIdx++;
      }
    }
    
    // Save to the database as pending approval
    db.mealPlan = {
      recipes: finalRecipes,
      approved: false,
      selectedTags: selectedTags,
      lockedIndices: Object.keys(lockedMap).map(function(k) { return parseInt(k, 10); }),
      generatedAt: new Date().toISOString(),
      executionResult: null
    };
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));
    
    return { success: true, db: db };
  } catch (e) {
    Logger.log("Error generating meal plan: " + e.toString());
    throw new Error("Failed to generate meal plan: " + e.message);
  }
}

/**
 * Parse time supporting AM/PM formats as well as 24-hour.
 */
function parseTime(timeStr) {
  var hours = 18; // default 6 PM
  var minutes = 0;
  if (!timeStr) return { hours: hours, minutes: minutes };
  
  timeStr = timeStr.trim().toUpperCase();
  var isPM = timeStr.indexOf('PM') !== -1;
  var isAM = timeStr.indexOf('AM') !== -1;
  
  // Strip out AM/PM
  var cleanTime = timeStr.replace(/[AP]M/, '').trim();
  var parts = cleanTime.split(':');
  if (parts.length >= 2) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    
    if (isPM && hours < 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }
  }
  return { hours: hours, minutes: minutes };
}

var AISLE_CATEGORIES = [
  '🥬 Produce',
  '🥩 Meat & Seafood',
  '🧀 Dairy & Refrigerated',
  '🥫 Pantry & Canned',
  '🧂 Spices & Baking'
];

/**
 * Categorizes an ingredient by grocery aisle / store department.
 * @param {string} rawName Ingredient name
 * @return {string} Standard aisle category name
 */
function categorizeIngredient(rawName) {
  var name = (rawName || "").toLowerCase().trim();
  if (!name) return '🥫 Pantry & Canned';

  // 1. Broths, Stocks, Oils, Sauces, Vinegars, Canned Goods -> Pantry & Canned
  if (/broth|stock|bouillon|olive oil|vegetable oil|sesame oil|canola oil|cooking spray|vinegar|soy sauce|tamari|worcestershire|fish sauce|hot sauce|sriracha|salsa|tomato sauce|tomato paste|marinara|canned|beans|diced tomato|crushed tomato|coconut milk|peanut butter|honey|maple syrup|mayo|mustard|ketchup|dressing/.test(name)) {
    return '🥫 Pantry & Canned';
  }

  // 2. Spices, Powders, Seasonings, Baking
  if (/powder|seasoning|rub\b|extract|sugar|flour|cornstarch|baking|cocoa|yeast|cinnamon|nutmeg|paprika|cumin|turmeric|coriander|curry powder|cardamom|cayenne|allspice|vanilla|chocolate chip|red pepper flake|chili flake/.test(name)) {
    return '🧂 Spices & Baking';
  }
  if (/\bsalt\b|\bpepper\b|\bpeppercorn\b|\bpeppercorns\b|\bkosher salt\b|\bsea salt\b|\bblack pepper\b/.test(name) && !/bell pepper|chili pepper|jalapeno|poblano|serrano|sweet pepper|banana pepper/.test(name)) {
    return '🧂 Spices & Baking';
  }

  // 3. Meat & Seafood
  if (/chicken|beef|steak|pork|turkey|duck|lamb|veal|bacon|pancetta|prosciutto|sausage|chorizo|ham\b|ribeye|sirloin|ground beef|ground turkey|ground pork|salmon|tuna\b|shrimp|prawn|fish|cod\b|tilapia|halibut|mahi|trout|crab|lobster|scallop|clam|mussel|calamari|squid|anchov|meat/.test(name)) {
    return '🥩 Meat & Seafood';
  }

  // 4. Dairy & Refrigerated (and plant-based dairy substitutes)
  if (/milk|butter|cheese|cheddar|mozzarella|parmesan|parmigiano|ricotta|feta|gouda|swiss|provolone|brie|pecorino|yogurt|cream|sour cream|half and half|half & half|egg|eggs|egg white|egg yolk|tofu|tempeh|ghee|margarine|cream cheese|cottage cheese|mascarpone|queso/.test(name)) {
    return '🧀 Dairy & Refrigerated';
  }

  // 5. Fresh Produce
  if (/garlic|onion|shallot|leek|scallion|ginger|tomato|potato|potatoes|sweet potato|lettuce|spinach|kale|arugula|cabbage|bok choy|chard|celery|carrot|bell pepper|jalapeno|chili|poblano|serrano|avocado|cucumber|zucchini|squash|broccoli|cauliflower|asparagus|mushroom|green bean|pea\b|peas\b|snap pea|snow pea|eggplant|corn\b|radish|beet|lemon|lime|orange|apple|banana|berry|berries|strawberry|blueberry|raspberry|blackberry|mango|pineapple|grape|peach|pear|melon|watermelon|cilantro|parsley|basil|rosemary|thyme|mint|dill|sage\b|tarragon|lemongrass|sprout|herb/.test(name)) {
    return '🥬 Produce';
  }

  // 6. Grains, Pasta, Bread, Canned & Pantry fallback
  if (/pasta|spaghetti|penne|noodle|rice|quinoa|oat|bread|tortilla|pita|cracker|panko|breadcrumb|chip|olive|caper|nut\b|nuts\b|almond|walnut|peanut|cashew|pecan|pine nut|seed|sunflower|sesame/.test(name)) {
    return '🥫 Pantry & Canned';
  }

  // Default fallback
  return '🥫 Pantry & Canned';
}

/**
 * Consolidated shopping list: smart parses and deduplicates ingredients,
 * enriched with aisle department categorization.
 */
function consolidateShoppingList(recipes) {
  var list = {};
  recipes.forEach(function(recipe) {
    if (!recipe.ingredients) return;
    recipe.ingredients.forEach(function(ing) {
      var name = (ing.name || "").toLowerCase().trim();
      if (!name) return;
      var amount = parseFloat(ing.amount) || 0;
      var unit = (ing.unit || "").toLowerCase().trim();
      
      if (!list[name]) {
        list[name] = [];
      }
      list[name].push({ amount: amount, unit: unit });
    });
  });
  
  var consolidated = [];
  for (var name in list) {
    var items = list[name];
    var merged = [];
    
    items.forEach(function(item) {
      var found = false;
      for (var i = 0; i < merged.length; i++) {
        if (merged[i].unit === item.unit) {
          merged[i].amount = Math.round((merged[i].amount + item.amount) * 100) / 100;
          found = true;
          break;
        }
      }
      if (!found) {
        merged.push({ amount: Math.round(item.amount * 100) / 100, unit: item.unit });
      }
    });
    
    var category = categorizeIngredient(name);
    
    consolidated.push({
      name: name,
      category: category,
      amounts: merged
    });
  }
  
  // Sort alphabetically by name
  consolidated.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });
  
  return consolidated;
}

/**
 * Gets or creates a specific root-level folder in Google Drive.
 */
function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

/**
 * Gets or creates a subfolder inside a parent folder.
 */
function getOrCreateSubfolder(parentFolder, subfolderName) {
  var subfolders = parentFolder.getFoldersByName(subfolderName);
  if (subfolders.hasNext()) {
    return subfolders.next();
  } else {
    return parentFolder.createFolder(subfolderName);
  }
}

/**
 * Approves the meal plan and runs the workspace execution workflow.
 * @param {Array<Object>} approvedMealsWithDates Array of { name: String, date: String } (where date is "YYYY-MM-DD")
 */
function approveMealPlanServer(approvedMealsWithDates) {
  try {
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    var prefs = db.preferences;
    if (!db.recipeLibrary) db.recipeLibrary = {};
    
    if (!db.mealPlan) {
      throw new Error("No active meal plan found to approve.");
    }
    
    // Map approved meals names to check quickly
    var approvedMap = {};
    approvedMealsWithDates.forEach(function(item) {
      approvedMap[item.name] = item.date;
    });
    
    // Filter active recipes to only the approved ones and map dates
    var selectedRecipes = [];
    db.mealPlan.recipes.forEach(function(recipe) {
      if (approvedMap[recipe.name]) {
        selectedRecipes.push({
          recipe: recipe,
          dateVal: approvedMap[recipe.name] // YYYY-MM-DD
        });
      }
    });
    
    if (selectedRecipes.length === 0) {
      throw new Error("Please approve at least one recipe.");
    }
    
    var executionResult = {
      recipeDocs: [],
      shoppingListDocUrl: "",
      calendarEventsCreated: 0
    };
    
    // Create folders
    var parentFolder = getOrCreateFolder(PARENT_FOLDER_NAME);
    var shoppingListFolder = getOrCreateSubfolder(parentFolder, SHOPPING_LISTS_FOLDER_NAME);
    var calendar = CalendarApp.getDefaultCalendar();
    
    // 1. Process Google Docs for each recipe (rename if existing, create if new) & Calendar events
    selectedRecipes.forEach(function(item) {
      var recipe = item.recipe;
      var dateVal = item.dateVal; // YYYY-MM-DD
      var dateCompact = dateVal.replace(/-/g, ''); // YYYYMMDD
      var docName = dateCompact + " - " + recipe.name;
      var docUrl = "";
      var docId = recipe.docId || "";
      
      // Look for existing file if reused or already created
      var existingFile = null;
      if (docId) {
        try {
          existingFile = DriveApp.getFileById(docId);
        } catch (e) {
          existingFile = null;
        }
      }
      
      if (!existingFile) {
        // Search by name in Parent Folder
        var files = parentFolder.getFiles();
        while (files.hasNext()) {
          var f = files.next();
          var match = f.getName().match(/^(\d{8})\s*-\s*(.+)$/);
          if (match && match[2].trim().toLowerCase() === recipe.name.trim().toLowerCase()) {
            existingFile = f;
            break;
          }
        }
      }
      
      if (existingFile) {
        // Re-use existing file and rename with new date
        existingFile.setName(docName);
        docUrl = existingFile.getUrl();
        docId = existingFile.getId();
      } else {
        // Create new Doc named "YYYYMMDD - Recipe Name"
        var doc = DocumentApp.create(docName);
        var body = doc.getBody();
        
        body.appendParagraph(recipe.name).setHeading(DocumentApp.ParagraphHeading.HEADING1);
        body.appendParagraph(recipe.description).setItalic(true);
        body.appendParagraph("Date Scheduled: " + dateVal + " | Prep Time: " + recipe.prepTime + " | Cook Time: " + recipe.cookTime);
        body.appendParagraph("Diners Scaled For: " + prefs.dinersCount).setBold(true);
        
        body.appendParagraph("Ingredients").setHeading(DocumentApp.ParagraphHeading.HEADING2);
        (recipe.ingredients || []).forEach(function(ing) {
          body.appendListItem(ing.amount + " " + ing.unit + " " + ing.name);
        });
        
        body.appendParagraph("Instructions").setHeading(DocumentApp.ParagraphHeading.HEADING2);
        (recipe.instructions || []).forEach(function(step, stepIdx) {
          body.appendListItem((stepIdx + 1) + ". " + step);
        });
        
        doc.saveAndClose();
        
        // Move to Parent Folder
        var docFile = DriveApp.getFileById(doc.getId());
        docFile.moveTo(parentFolder);
        
        docUrl = doc.getUrl();
        docId = doc.getId();
      }
      
      // Cache structured recipe in db.recipeLibrary
      db.recipeLibrary[recipe.name] = {
        name: recipe.name,
        description: recipe.description || "",
        prepTime: recipe.prepTime || "15m",
        cookTime: recipe.cookTime || "20m",
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || [],
        docUrl: docUrl,
        docId: docId,
        originalDiners: prefs.dinersCount,
        lastScheduledDate: dateVal
      };
      
      executionResult.recipeDocs.push({
        name: recipe.name,
        date: dateVal,
        url: docUrl
      });
      
      // Create Google Calendar Event
      var dateParts = dateVal.split('-');
      var year = parseInt(dateParts[0], 10);
      var month = parseInt(dateParts[1], 10) - 1; // 0-indexed month
      var day = parseInt(dateParts[2], 10);
      
      var timeDetails = parseTime(prefs.defaultMealTime);
      
      var startTime = new Date(year, month, day, timeDetails.hours, timeDetails.minutes, 0);
      var endTime = new Date(year, month, day, timeDetails.hours + 1, timeDetails.minutes, 0);
      
      var description = "Prep & Cook: " + recipe.name + "\n\n" +
                        (recipe.description || "") + "\n\n" +
                        "Diners: " + prefs.dinersCount + "\n" +
                        "Prep Time: " + (recipe.prepTime || "15m") + " | Cook Time: " + (recipe.cookTime || "20m") + "\n\n" +
                        "Ingredients:\n" +
                        (recipe.ingredients || []).map(function(i) { return "- " + i.amount + " " + i.unit + " " + i.name; }).join("\n") + "\n\n" +
                        "Instructions:\n" +
                        (recipe.instructions || []).map(function(step, idx) { return (idx + 1) + ". " + step; }).join("\n") + "\n\n" +
                        "Recipe Document: " + docUrl;
                        
      calendar.createEvent("Meal Prep: " + recipe.name, startTime, endTime, {
        description: description,
        location: "Home Kitchen"
      });
      executionResult.calendarEventsCreated++;
    });
    
    // 2. Generate Consolidated Shopping List
    var rawSelectedRecipes = selectedRecipes.map(function(item) { return item.recipe; });
    var consolidatedList = consolidateShoppingList(rawSelectedRecipes);
    
    var dates = approvedMealsWithDates.map(function(item) { return item.date; });
    dates.sort();
    var earliestDateVal = dates[0] || new Date().toISOString().substring(0, 10);
    var earliestDateCompact = earliestDateVal.replace(/-/g, '');
    
    var shoppingListDocName = earliestDateCompact + " - Shopping List";
    var shoppingListDoc = DocumentApp.create(shoppingListDocName);
    var slBody = shoppingListDoc.getBody();
    
    slBody.appendParagraph("Consolidated Weekly Shopping List").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    slBody.appendParagraph("Scheduled Start Date: " + earliestDateVal).setItalic(true);
    slBody.appendParagraph("Diners Scaled For: " + prefs.dinersCount).setBold(true);
    slBody.appendParagraph("Recipes included: " + rawSelectedRecipes.map(function(r) { return r.name; }).join(", "));
    
    slBody.appendParagraph("Items to Buy by Store Section").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    // Group items by category for document rendering
    var categorizedItems = {};
    AISLE_CATEGORIES.forEach(function(cat) { categorizedItems[cat] = []; });
    
    consolidatedList.forEach(function(item) {
      var cat = item.category || '🥫 Pantry & Canned';
      if (!categorizedItems[cat]) categorizedItems[cat] = [];
      categorizedItems[cat].push(item);
    });
    
    AISLE_CATEGORIES.forEach(function(cat) {
      var items = categorizedItems[cat] || [];
      if (items.length > 0) {
        slBody.appendParagraph(cat).setHeading(DocumentApp.ParagraphHeading.HEADING3);
        items.forEach(function(item) {
          var amountStr = item.amounts.map(function(a) { return a.amount + " " + a.unit; }).join(", ");
          slBody.appendListItem(item.name.charAt(0).toUpperCase() + item.name.slice(1) + ": " + amountStr);
        });
      }
    });
    
    shoppingListDoc.saveAndClose();
    
    // Move to Subfolder "Shopping Lists"
    var slFile = DriveApp.getFileById(shoppingListDoc.getId());
    slFile.moveTo(shoppingListFolder);
    
    executionResult.shoppingListDocUrl = shoppingListDoc.getUrl();
    executionResult.shoppingListDocName = shoppingListDocName;
    executionResult.shoppingList = consolidatedList;
    
    // Save state back to DB
    db.mealPlan.approved = true;
    db.mealPlan.executionResult = executionResult;
    db.mealPlan.shoppingList = consolidatedList;
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));
    
    return { success: true, db: db };
  } catch (e) {
    Logger.log("Error during execution workflow: " + e.toString());
    throw new Error("Failed to execute meal plan workflow: " + e.message);
  }
}

/**
 * Reads the "Meal Plan Recipes" folder and extracts recipe history and top rated favorites.
 * Returns both the 25 most recently scheduled recipes and the 25 highest-rated recipes.
 */
function getRecipeHistory() {
  try {
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    var ratingsMap = db.recipeRatings || {};
    
    var parentFolder = getOrCreateFolder(PARENT_FOLDER_NAME);
    var files = parentFolder.getFiles();
    var allRecipes = [];
    
    while (files.hasNext()) {
      var f = files.next();
      var fileName = f.getName();
      
      // Look for recipe filename pattern: YYYYMMDD - Recipe Name
      var match = fileName.match(/^(\d{8})\s*-\s*(.+)$/);
      if (match) {
        var rawDate = match[1];
        var recipeName = match[2];
        
        // Format to YYYY-MM-DD
        var formattedDate = rawDate.substring(0, 4) + "-" + rawDate.substring(4, 6) + "-" + rawDate.substring(6, 8);
        var scheduledTimestamp = new Date(
          parseInt(rawDate.substring(0, 4), 10),
          parseInt(rawDate.substring(4, 6), 10) - 1,
          parseInt(rawDate.substring(6, 8), 10)
        ).getTime();
        
        var ratingInfo = ratingsMap[recipeName];
        var isFav = (ratingInfo && (ratingInfo.isFavorite === true || ratingInfo.rating > 0)) ? true : false;
        var recipeRating = isFav ? 5 : (ratingInfo && typeof ratingInfo.rating === 'number' ? ratingInfo.rating : 0);
          
        allRecipes.push({
          name: recipeName,
          date: formattedDate,
          rawDate: rawDate,
          url: f.getUrl(),
          fileId: f.getId(),
          isFavorite: isFav,
          rating: recipeRating,
          createdTime: f.getDateCreated().getTime(),
          scheduledTime: scheduledTimestamp
        });
      }
    }
    
    // Sort for Recipe History: Most recent scheduled date first, then creation time descending
    var historyList = allRecipes.slice().sort(function(a, b) {
      if (b.scheduledTime !== a.scheduledTime) {
        return b.scheduledTime - a.scheduledTime;
      }
      return b.createdTime - a.createdTime;
    });
    
    // Sort for Past Favorites: Filter recipes with isFavorite === true (or rating > 0)
    var favoritesList = allRecipes.filter(function(item) {
      return item.isFavorite === true || item.rating > 0;
    }).sort(function(a, b) {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      if (b.scheduledTime !== a.scheduledTime) {
        return b.scheduledTime - a.scheduledTime;
      }
      return b.createdTime - a.createdTime;
    });
    
    return {
      history: historyList.slice(0, 25),
      favorites: favoritesList.slice(0, 25),
      ratings: ratingsMap,
      library: db.recipeLibrary || {}
    };
  } catch (e) {
    Logger.log("Error loading recipe history: " + e.toString());
    throw new Error("Failed to load history: " + e.message);
  }
}
