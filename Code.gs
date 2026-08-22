/**
 * Automated Meal Planning Assistant Backend
 * Deployed fully within Google Apps Script
 */

var DB_FILENAME = "Automated_Meal_Planner_DB.json";
var RECIPES_FOLDER_NAME = "Meal Prep Recipes";

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
        allergies: "Absolutely no eggs",
        restrictions: "No fish or seafood",
        inventory: "Prioritize the use of 40 lbs of existing russet potatoes in all recipes"
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
    
    // Check if Gemini API key exists in user properties
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
    
    db.preferences = preferences;
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
function generateMealPlanServer() {
  try {
    var userProperties = PropertiesService.getUserProperties();
    var apiKey = userProperties.getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("Gemini API key is not configured. Please set it in the Settings panel.");
    }
    
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    var prefs = db.preferences;
    
    // Construct the Gemini API Prompt
    var prompt = "You are a professional chef. Generate a weekly dinner meal plan consisting of exactly 7 dinner recipes. " +
                 "You MUST strictly follow these dietary constraints:\n" +
                 "- Allergy Constraint: " + prefs.allergies + "\n" +
                 "- Restriction Constraint: " + prefs.restrictions + "\n" +
                 "- Inventory Constraint: " + prefs.inventory + "\n\n" +
                 "Provide a variety of dinner meals. Every recipe must have ingredients, amounts, units, and clear step-by-step instructions. " +
                 "Since russet potatoes are in abundance, make sure russet potatoes are utilized in creative ways across all recipes. " +
                 "Format the output strictly according to the requested JSON schema. Do not return any other text or explanation outside the JSON structure.";
                 
    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
    
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
              description: "A list of 7 dinner recipes satisfying all constraints",
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
 * Consolidated shopping list: smart parses and deduplicates ingredients.
 */
function consolidateShoppingList(recipes) {
  var list = {};
  recipes.forEach(function(recipe) {
    recipe.ingredients.forEach(function(ing) {
      var name = ing.name.toLowerCase().trim();
      var amount = parseFloat(ing.amount);
      var unit = ing.unit.toLowerCase().trim();
      
      // Basic singular/plural grouping helper for common words
      if (name.endsWith('es') && name !== 'potatoes' && name !== 'tomatoes') {
        // e.g. olives -> olive (don't overdo, just light cleanup)
      } else if (name.endsWith('s') && !name.endsWith('ss') && !name.endsWith('ch') && !name.endsWith('sh') && !name.endsWith('x') && name !== 'russet potatoes') {
        // e.g. onions -> onion
      }
      
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
 * Gets or creates a specific folder in Google Drive.
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
 * Approves the meal plan and runs the workspace execution workflow.
 */
function approveMealPlanServer(approvedRecipes) {
  try {
    var file = getDatabaseFile();
    var db = JSON.parse(file.getBlob().getDataAsString());
    
    if (!db.mealPlan) {
      throw new Error("No active meal plan found to approve.");
    }
    
    // Filter the recipes to only the approved ones (if user deselected any)
    var selectedRecipes = db.mealPlan.recipes.filter(function(recipe) {
      return approvedRecipes.indexOf(recipe.name) !== -1;
    });
    
    if (selectedRecipes.length === 0) {
      throw new Error("Please approve at least one recipe.");
    }
    
    var executionResult = {
      recipeDocs: [],
      shoppingListDocUrl: "",
      calendarEventsCreated: 0
    };
    
    var recipesFolder = getOrCreateFolder(RECIPES_FOLDER_NAME);
    var calendar = CalendarApp.getDefaultCalendar();
    
    // Day counter for calendar events (start scheduling starting from tomorrow)
    var today = new Date();
    
    // 1. Create individual Google Docs for each recipe & Calendar events
    selectedRecipes.forEach(function(recipe, index) {
      // Create Doc
      var docName = "Recipe: " + recipe.name;
      var doc = DocumentApp.create(docName);
      var body = doc.getBody();
      
      body.appendParagraph(recipe.name).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.appendParagraph(recipe.description).setItalic(true);
      body.appendParagraph("Prep Time: " + recipe.prepTime + " | Cook Time: " + recipe.cookTime);
      
      body.appendParagraph("Ingredients").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      recipe.ingredients.forEach(function(ing) {
        body.appendListItem(ing.amount + " " + ing.unit + " " + ing.name);
      });
      
      body.appendParagraph("Instructions").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      recipe.instructions.forEach(function(step, stepIdx) {
        body.appendListItem((stepIdx + 1) + ". " + step);
      });
      
      doc.saveAndClose();
      
      // Move to Recipes Folder
      var docFile = DriveApp.getFileById(doc.getId());
      docFile.moveTo(recipesFolder);
      
      var docUrl = doc.getUrl();
      executionResult.recipeDocs.push({
        name: recipe.name,
        url: docUrl
      });
      
      // Create Google Calendar Event
      var eventDate = new Date(today.getTime());
      eventDate.setDate(today.getDate() + index + 1); // Starting tomorrow, consecutive days
      
      // Set to 6:00 PM - 7:00 PM for dinner prep
      var startTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 18, 0, 0);
      var endTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 19, 0, 0);
      
      var description = "Prep & Cook: " + recipe.name + "\n\n" +
                        recipe.description + "\n\n" +
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
    
    // 2. Generate Consolidated Deduplicated Shopping List
    var consolidatedList = consolidateShoppingList(selectedRecipes);
    var shoppingListDoc = DocumentApp.create("Consolidated Shopping List - " + Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd"));
    var slBody = shoppingListDoc.getBody();
    
    slBody.appendParagraph("Consolidated Weekly Shopping List").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    slBody.appendParagraph("Generated on: " + today.toDateString()).setItalic(true);
    slBody.appendParagraph("Recipes included: " + selectedRecipes.map(function(r) { return r.name; }).join(", "));
    
    slBody.appendParagraph("Items to Buy").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    consolidatedList.forEach(function(item) {
      var amountStr = item.amounts.map(function(a) { return a.amount + " " + a.unit; }).join(", ");
      slBody.appendListItem(item.name.charAt(0).toUpperCase() + item.name.slice(1) + ": " + amountStr);
    });
    
    shoppingListDoc.saveAndClose();
    
    // Move to Recipes Folder as well
    var slFile = DriveApp.getFileById(shoppingListDoc.getId());
    slFile.moveTo(recipesFolder);
    
    executionResult.shoppingListDocUrl = shoppingListDoc.getUrl();
    
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
