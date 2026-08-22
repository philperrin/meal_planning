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
        onHandIngredients: "",
        dinersCount: 2,
        defaultMealTime: "06:00 PM"
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
    // Migrate 'inventory' -> 'onHandIngredients'
    if (db.preferences.inventory !== undefined && db.preferences.onHandIngredients === undefined) {
      db.preferences.onHandIngredients = db.preferences.inventory;
      delete db.preferences.inventory;
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
    
    if (updated) {
      file.setContent(JSON.stringify(db, null, 2));
    }
    
    var userProperties = PropertiesService.getUserProperties();
    var apiKey = userProperties.getProperty('GEMINI_API_KEY');
    
    return {
      db: db,
      hasApiKey: !!apiKey
    };
  } catch (e) {
    Logger.log("Error loading app data: " + e.toString());
    throw new Error("Failed to load app data: " + e.message);
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
      onHandIngredients: preferences.onHandIngredients || "",
      dinersCount: parseInt(preferences.dinersCount, 10) || 2,
      defaultMealTime: preferences.defaultMealTime || "06:00 PM"
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
 * Saves the Gemini API key securely in User Properties.
 */
function saveApiKey(apiKey) {
  try {
    var userProperties = PropertiesService.getUserProperties();
    userProperties.setProperty('GEMINI_API_KEY', apiKey.trim());
    return { success: true };
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
    return { success: true };
  } catch (e) {
    Logger.log("Error deleting API Key: " + e.toString());
    throw new Error("Failed to delete API Key: " + e.message);
  }
}

/**
 * Calls the Gemini API to generate a weekly meal plan based on preferences.
 */
function generateMealPlanServer(mealCount) {
  try {
    mealCount = parseInt(mealCount, 10) || 7;
    
    var userProperties = PropertiesService.getUserProperties();
    var apiKey = userProperties.getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("Gemini API key is not configured. Please set it in the Settings panel.");
    }
    
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    var prefs = db.preferences;
    
    // Construct the Gemini API Prompt
    var prompt = "You are a professional chef. Generate a dinner meal plan consisting of exactly " + mealCount + " dinner recipes. " +
                 "Scale all ingredient quantities in every recipe to feed exactly " + prefs.dinersCount + " diners.\n" +
                 "You MUST strictly follow these constraints:\n" +
                 "- Allergy Constraint: " + prefs.allergies + "\n" +
                 "- Dietary Preferences: " + prefs.dietaryPreferences + "\n" +
                 (prefs.onHandIngredients ? "- On Hand Ingredients to use: " + prefs.onHandIngredients + "\n\n" : "\n\n") +
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
              description: "A list of " + mealCount + " dinner recipes satisfying all constraints",
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
      throw new Error("Gemini API error (Status " + responseCode + "): " + responseText);
    }
    
    var jsonResponse = JSON.parse(responseText);
    var responseJsonText = jsonResponse.candidates[0].content.parts[0].text;
    var result = JSON.parse(responseJsonText);
    
    if (!result.recipes || result.recipes.length === 0) {
      throw new Error("Gemini returned an empty recipes list.");
    }
    
    // Save to the database as pending approval
    db.mealPlan = {
      recipes: result.recipes,
      approved: false,
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

/**
 * Consolidated shopping list: smart parses and deduplicates ingredients.
 */
function consolidateShoppingList(recipes) {
  var list = {};
  recipes.forEach(function(recipe) {
    recipe.ingredients.forEach(function(ing) {
      var name = ing.name.toLowerCase().trim();
      var amount = parseFloat(ing.amount);
      var unit = ing.unit.toLowerCase().trim();
      
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
          merged[i].amount += item.amount;
          found = true;
          break;
        }
      }
      if (!found) {
        merged.push({ amount: item.amount, unit: item.unit });
      }
    });
    
    consolidated.push({
      name: name,
      amounts: merged
    });
  }
  
  // Sort alphabetically
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
    
    // 1. Create individual Google Docs for each recipe & Calendar events
    selectedRecipes.forEach(function(item) {
      var recipe = item.recipe;
      var dateVal = item.dateVal; // YYYY-MM-DD
      var dateCompact = dateVal.replace(/-/g, ''); // YYYYMMDD
      
      // Create Doc named "YYYYMMDD - Recipe Name"
      var docName = dateCompact + " - " + recipe.name;
      var doc = DocumentApp.create(docName);
      var body = doc.getBody();
      
      body.appendParagraph(recipe.name).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.appendParagraph(recipe.description).setItalic(true);
      body.appendParagraph("Date Scheduled: " + dateVal + " | Prep Time: " + recipe.prepTime + " | Cook Time: " + recipe.cookTime);
      body.appendParagraph("Diners Scaled For: " + prefs.dinersCount).setBold(true);
      
      body.appendParagraph("Ingredients").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      recipe.ingredients.forEach(function(ing) {
        body.appendListItem(ing.amount + " " + ing.unit + " " + ing.name);
      });
      
      body.appendParagraph("Instructions").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      recipe.instructions.forEach(function(step, stepIdx) {
        body.appendListItem((stepIdx + 1) + ". " + step);
      });
      
      doc.saveAndClose();
      
      // Move to Parent Folder
      var docFile = DriveApp.getFileById(doc.getId());
      docFile.moveTo(parentFolder);
      
      var docUrl = doc.getUrl();
      executionResult.recipeDocs.push({
        name: recipe.name,
        date: dateVal,
        url: docUrl
      });
      
      // Create Google Calendar Event
      // Parse YYYY-MM-DD
      var dateParts = dateVal.split('-');
      var year = parseInt(dateParts[0], 10);
      var month = parseInt(dateParts[1], 10) - 1; // 0-indexed month
      var day = parseInt(dateParts[2], 10);
      
      // Parse Default daily prep time from preferences (e.g. "06:00 PM" or "18:00")
      var timeDetails = parseTime(prefs.defaultMealTime);
      
      var startTime = new Date(year, month, day, timeDetails.hours, timeDetails.minutes, 0);
      var endTime = new Date(year, month, day, timeDetails.hours + 1, timeDetails.minutes, 0);
      
      var description = "Prep & Cook: " + recipe.name + "\n\n" +
                        recipe.description + "\n\n" +
                        "Diners: " + prefs.dinersCount + "\n" +
                        "Prep Time: " + recipe.prepTime + " | Cook Time: " + recipe.cookTime + "\n\n" +
                        "Ingredients:\n" +
                        recipe.ingredients.map(function(i) { return "- " + i.amount + " " + i.unit + " " + i.name; }).join("\n") + "\n\n" +
                        "Instructions:\n" +
                        recipe.instructions.map(function(step, idx) { return (idx + 1) + ". " + step; }).join("\n") + "\n\n" +
                        "Recipe Document: " + docUrl;
                        
      calendar.createEvent("Meal Prep: " + recipe.name, startTime, endTime, {
        description: description,
        location: "Home Kitchen"
      });
      executionResult.calendarEventsCreated++;
    });
    
    // 2. Generate Consolidated Shopping List
    // Get raw recipes
    var rawSelectedRecipes = selectedRecipes.map(function(item) { return item.recipe; });
    var consolidatedList = consolidateShoppingList(rawSelectedRecipes);
    
    // Find the earliest date among all approved meals to name the shopping list
    // approvedMealsWithDates is [{name, date}]
    var dates = approvedMealsWithDates.map(function(item) { return item.date; });
    dates.sort(); // Sorts strings alphabetically, which works for YYYY-MM-DD
    var earliestDateVal = dates[0] || new Date().toISOString().substring(0, 10);
    var earliestDateCompact = earliestDateVal.replace(/-/g, '');
    
    var shoppingListDocName = earliestDateCompact + " - Shopping List";
    var shoppingListDoc = DocumentApp.create(shoppingListDocName);
    var slBody = shoppingListDoc.getBody();
    
    slBody.appendParagraph("Consolidated Weekly Shopping List").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    slBody.appendParagraph("Scheduled Start Date: " + earliestDateVal).setItalic(true);
    slBody.appendParagraph("Diners Scaled For: " + prefs.dinersCount).setBold(true);
    slBody.appendParagraph("Recipes included: " + rawSelectedRecipes.map(function(r) { return r.name; }).join(", "));
    
    slBody.appendParagraph("Items to Buy").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    consolidatedList.forEach(function(item) {
      var amountStr = item.amounts.map(function(a) { return a.amount + " " + a.unit; }).join(", ");
      slBody.appendListItem(item.name.charAt(0).toUpperCase() + item.name.slice(1) + ": " + amountStr);
    });
    
    shoppingListDoc.saveAndClose();
    
    // Move to Subfolder "Shopping Lists"
    var slFile = DriveApp.getFileById(shoppingListDoc.getId());
    slFile.moveTo(shoppingListFolder);
    
    executionResult.shoppingListDocUrl = shoppingListDoc.getUrl();
    executionResult.shoppingListDocName = shoppingListDocName;
    
    // Save state back to DB
    db.mealPlan.approved = true;
    db.mealPlan.executionResult = executionResult;
    db.lastUpdated = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 2));
    
    return { success: true, db: db };
  } catch (e) {
    Logger.log("Error during execution workflow: " + e.toString());
    throw new Error("Failed to execute meal plan workflow: " + e.message);
  }
}
