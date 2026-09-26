# MPA-8 Specification Sheet: Recipe Rating System & Recipe Re-use Workflow

**Author**: Antigravity Assistant  
**Date**: September 7, 2026  
**Status**: Pending Review  
**Target Ticket**: MPA-8  

---

## 1. Overview & Objectives

This specification defines the functional and technical requirements for **MPA-8**, enhancing the **History** and **Planner** experiences in the Automated Meal Planning Assistant.

### Key Goals:
1. **0-5 Star Rating System**: Allow users to rate their past recipes (0 to 5 stars) directly in the History tab.
2. **Dual-View History Tabs**:
   - **"Recipe History"**: Displays the 25 most recently created/scheduled recipes.
   - **"Past Favorites"**: Displays the 25 highest-rated recipes (rated $\ge 1$ star), sorted primarily by rating descending, with secondary sorting by recency.
3. **Ephemeral Recipe Re-use Workflow**:
   - Enable users to check/select past recipes on either sub-tab.
   - Carry selected recipes into the next meal plan generation.
   - Integrate reused recipes with Gemini AI (generating $N - K$ new complementary recipes to satisfy the total meal count).
   - In the execution phase, rename existing Google Docs (`YYYYMMDD - Recipe Name`) instead of creating duplicates, while scheduling calendar events and consolidating grocery lists.

---

## 2. Technical Architecture & Data Model

### 2.1 Database Schema Extensions (`Automated_Meal_Planner_DB.json`)

The JSON database in Google Drive will be updated with schema migration support:

```json
{
  "preferences": {
    "allergies": "No eggs.",
    "dietaryPreferences": "Strong preference for high protein and seasonal vegetables.",
    "cuisinePreferences": {},
    "dinersCount": 2,
    "defaultMealTime": "06:00 PM",
    "skipWelcomePage": false
  },
  "mealPlan": { ... },
  "recipeRatings": {
    "Sheet Pan Lemon Herb Salmon": {
      "rating": 5,
      "ratedAt": "2026-09-07T20:45:00.000Z"
    },
    "Tuscan Garlic White Bean Soup": {
      "rating": 4,
      "ratedAt": "2026-09-07T20:50:00.000Z"
    }
  },
  "recipeLibrary": {
    "Sheet Pan Lemon Herb Salmon": {
      "name": "Sheet Pan Lemon Herb Salmon",
      "description": "Crisp asparagus and tender salmon roasted with garlic and lemon slices.",
      "prepTime": "15 mins",
      "cookTime": "20 mins",
      "ingredients": [
        { "name": "salmon fillets", "amount": 2, "unit": "pieces" },
        { "name": "asparagus", "amount": 1, "unit": "bunch" },
        { "name": "olive oil", "amount": 2, "unit": "tbsp" }
      ],
      "instructions": [
        "Preheat oven to 400°F (200°C).",
        "Arrange salmon and asparagus on sheet pan."
      ],
      "docUrl": "https://docs.google.com/document/d/123/edit",
      "docId": "123",
      "originalDiners": 2
    }
  },
  "lastUpdated": "2026-09-07T20:50:00.000Z"
}
```

### 2.2 Server-Side API Contract (`Code.gs`)

| Function | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `setRecipeRating(recipeName, rating)` | `recipeName: String`, `rating: Number (0-5)` | `{ success: Boolean, ratings: Object }` | Sets or updates 0-5 star rating for a recipe in `db.recipeRatings`. |
| `getRecipeHistory()` | *None* | `{ history: Array<RecipeSummary>, favorites: Array<RecipeSummary> }` | Scans Drive folder, merges ratings and library cache, returns top 25 recent and top 25 highest-rated recipes. |
| `generateMealPlanServer(mealCount, planPreferences, reusedRecipeNames)` | `mealCount: Number`, `planPreferences: String`, `reusedRecipeNames: Array<String>` | `{ success: Boolean, db: Object }` | Re-uses $K$ recipes from library, prompts Gemini for remaining $N - K$ recipes avoiding duplicates, and builds active plan. |
| `approveMealPlanServer(approvedMealsWithDates)` | `approvedMealsWithDates: Array<{ name: String, date: String }>` | `{ success: Boolean, db: Object }` | Re-titles existing Docs for reused recipes (`file.setName`), generates new Docs for new recipes, creates Calendar events & shopping list. |

---

## 3. UI/UX Interaction Design

### 3.1 History Tab Sub-Navigation
- **Segmented Sub-Tabs**:
  - `[ 📜 Recipe History (25) ]` | `[ ⭐ Past Favorites (25) ]`
  - Active sub-tab highlighted with accent background and border.
- **Empty States**:
  - When no recipes exist: *"No Recipe Docs Found. Generate and execute a meal plan to build your history."*
  - When no favorites rated: *"No Rated Favorites Yet. Rate your favorite recipes with 1-5 stars to see them here."*

### 3.2 0-5 Star Rating Component
- Each recipe row in both views includes an interactive 5-star bar:
  - Unrated state: 5 empty outlines `☆☆☆☆☆` (gray/muted).
  - Rated state: Filled golden stars `★★★★☆` with numeric tooltip / rating value (`4 / 5`).
  - Interactive hover state previews selected score.
  - Clicking an active rating toggles or clears back to 0 (unrated).
  - Triggers asynchronous `setRecipeRating` with optimistic UI feedback.

### 3.3 Ephemeral Selection & Staging Banner
- Checkbox next to each recipe row: `[ ] Re-use in next plan`.
- When $\ge 1$ recipe is checked:
  - A floating/docked banner appears:
    `✦ 2 recipes selected for next meal plan — [ 🗓️ Go to Planner ] [ ✕ Clear Selection ]`
  - On the Planner tab:
    `Staged for re-use: Sheet Pan Salmon, Tuscan Soup (2 meals). Choose total meals above.`
  - When the user clicks **"Generate Dinner Plan"**, the staged recipes are seamlessly integrated.

---

## 4. Technical Obstacles & Solutions

### 1. Reused Recipe Content & Ingredient Retrieval
- **Challenge**: The shopping list and recipe cards require structured ingredient quantities and instructions. If only file names are stored in Drive, the system would have to parse arbitrary Google Doc text on the fly.
- **Solution**:
  - Maintain `db.recipeLibrary` mapping `recipeName -> structuredRecipeJSON`.
  - Upon approving any meal plan, automatically save its structured recipe definitions to `db.recipeLibrary`.
  - For legacy Google Docs (created prior to the library cache), provide a lightweight server-side regex parser for the Doc body.

### 2. Google Doc File Renaming vs Duplication
- **Challenge**: Drive Docs should not be recreated when reusing past recipes. Instead, the filename must update to reflect the new scheduled date (`YYYYMMDD - Recipe Name`).
- **Solution**:
  - Store the Google Doc File ID / URL with the recipe in `db.recipeLibrary` or look up the existing file by name in `Meal Plan Recipes`.
  - Call `DriveApp.getFileById(docId).setName(newDateCompact + " - " + recipe.name)` to re-title without generating a new document ID or breaking existing share links.
  - Gracefully fallback to `DocumentApp.create()` if the user previously deleted the Drive document.

### 3. Mixed Meal Plan Generation with Gemini AI
- **Challenge**: If a user selects 2 past recipes and requests a 5-meal plan, Gemini must generate exactly 3 new recipes that complement and do not duplicate the 2 selected dishes.
- **Solution**:
  - Inject the reused recipe names into the Gemini prompt:
    `"Avoid Duplicating: The user has already selected the following dishes for this week: [Dish 1, Dish 2]. Do NOT generate recipes with similar flavor profiles or main proteins."`
  - Adjust schema target count to $N - K = 3$.
  - Combine the $K$ reused recipes + 3 generated recipes into the active plan.
  - If $K = N$ (user selected all 5 meals from history), bypass Gemini completely for instant 0-quota generation.

### 4. Diner Count Ingredient Scaling
- **Challenge**: A past recipe might have been created for 2 diners, but the user's current household diner preference is 4.
- **Solution**:
  - In `recipeLibrary`, store `originalDiners: 2`.
  - When loading into the active plan, if `currentDiners !== originalDiners`, scale numerical quantities by $\frac{\text{currentDiners}}{\text{originalDiners}}$.

---

## 5. Implementation Steps

1. **Step 1: Backend Data Model & Ratings API** (`Code.gs`)
   - Add `recipeRatings` and `recipeLibrary` migrations to `loadAppData()`.
   - Implement `setRecipeRating(recipeName, rating)`.
   - Update `getRecipeHistory()` to output `{ history, favorites }` sorted appropriately.
2. **Step 2: Backend Re-use & Partial Generation** (`Code.gs`)
   - Update `generateMealPlanServer()` to accept `reusedRecipeNames`.
   - Update `approveMealPlanServer()` to re-title existing Docs for reused recipes.
3. **Step 3: Frontend Sub-Tabs & Star Rating UI** (`Index.html`, `Styles.html`, `JavaScript.html`)
   - Add sub-tabs for "Recipe History" and "Past Favorites".
   - Implement 0-5 star interactive rating widgets with optimistic updates.
4. **Step 4: Frontend Ephemeral Re-use Integration** (`JavaScript.html`, `Index.html`)
   - Add checkboxes and ephemeral `appState.reusedRecipes` set.
   - Render staged recipes indicator and link to Planner view.
   - Pass reused selections on generation and render merged recipe cards.
5. **Step 5: Testing & Verification** (`test/test-suite.js`)
   - Add unit tests for rating updates, dual-history sorting, partial AI generation, and Doc renaming.
   - Run test suite to verify 100% pass rate.
