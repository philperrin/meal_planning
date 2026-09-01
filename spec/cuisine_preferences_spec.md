# Feature Specification: Cuisine Preferences

## 1. Overview & Objective
This specification defines the functional and technical requirements for adding **Cuisine Preferences** to the Meal Planning Assistant. Users will be able to categorize a comprehensive list of common cuisine types as **"Prefer"**, **"Avoid"**, or leave them as **"Neutral"** (no preference). 

These preferences will persist in the user's Google Drive database (`Automated_Meal_Planner_DB.json`) and dynamically guide the Gemini AI model during dinner plan generation.

---

## 2. Identified Cuisine Types
A curated list of 12 popular cuisine and dietary preference types in alphabetical order:

| # | Cuisine / Style | Description / Typical Dishes |
|---|---|---|
| 1 | **American / Classic Comfort** | Roasts, burgers, grilled meats, casseroles, pot pies, BBQ |
| 2 | **Chinese** | Stir-fries, dumplings, fried rice, noodle dishes, savory-sweet glazes |
| 3 | **Indian** | Curries, tikka masala, dal, biryani, spiced stews |
| 4 | **Italian** | Pasta, risotto, rustic baked dishes, tomato/herb-rich preparations |
| 5 | **Korean** | Bulgogi, bibimbap, kimchi stews, glazed chicken, gochujang marinades |
| 6 | **Mediterranean / Greek** | Souvlaki, gyro bowls, roasted lemon chicken, olive oil & feta dishes |
| 7 | **Mexican** | Tacos, enchiladas, fajitas, salsas, chili & lime flavor profiles |
| 8 | **Middle Eastern / Levantine** | Shawarma bowls, falafel, shakshuka, za'atar chicken, kofta |
| 9 | **Tex-Mex / Southwestern** | Sheet-pan fajitas, chili con carne, quesadillas, loaded taco bowls |
| 10 | **Thai** | Pad Thai, coconut curries, spicy basil stir-fries, lemongrass/lime soups |
| 11 | **Vegan** | 100% plant-based recipes, no animal products/dairy/honey |
| 12 | **Vegetarian** | Plant-forward meals, legumes, dairy/egg options, tofu/tempeh, meatless mains |

---

## 3. User Interface & Experience (Preferences Tab)

### 3.1 Layout & Visual Design
- **Section Placement**: Inserted into the "Preferences" view between the free-text Dietary Preferences textarea and the On-Hand Ingredients textarea.
- **2-Column Layout**: Rendered as 2 columns of 6 cuisine cards arranged top-to-bottom, left-to-right in alphabetical order, maximizing space for full cuisine names.
- **3-State Segmented Control / Pill Selector**:
  - `None` (Default): Gray/subtle muted appearance. The cuisine is available normally.
  - `Prefer` (Sage green `--accent-primary`): Signals priority to the AI.
  - `Avoid` (Soft red `--error`): Signals strict exclusion to the AI.
- **Quick Action**:
  - `↺ Reset All` button to clear custom cuisine selections back to neutral with one click.

---

## 4. Data Model & Architecture

### 4.1 Schema Update (`Automated_Meal_Planner_DB.json`)
Under `db.preferences`, add `cuisinePreferences`:
```json
{
  "preferences": {
    "allergies": "No eggs.",
    "dietaryPreferences": "Strong preference for high protein and seasonal vegetables.",
    "cuisinePreferences": {
      "Italian": "prefer",
      "Mexican": "prefer",
      "Thai": "avoid",
      "Indian": "neutral"
    },
    "onHandIngredients": "",
    "dinersCount": 2,
    "defaultMealTime": "06:00 PM"
  },
  "mealPlan": null,
  "lastUpdated": "2026-08-31T19:30:00.000Z"
}
```

### 4.2 Backend Migration (`Code.gs`)
- Update `loadAppData()` with a schema check: if `db.preferences.cuisinePreferences` is missing or undefined, initialize it as `{}`.
- Update `savePreferences(preferences)` to validate and save `preferences.cuisinePreferences`.

---

## 5. Gemini Prompt Integration

In `Code.gs -> generateMealPlanServer(mealCount)`:
1. Parse `prefs.cuisinePreferences`:
   - Collect list of preferred cuisines: e.g., `["Italian", "Mexican"]`.
   - Collect list of avoided cuisines: e.g., `["Thai"]`.
2. Construct dynamic prompt directives:
   - **Preferred Cuisines**: `"- Preferred Cuisines: Prioritize and feature recipes inspired by the following cuisines: Italian, Mexican."`
   - **Avoided Cuisines**: `"- Avoided Cuisines: Strictly DO NOT include any recipes, flavor profiles, or dishes associated with the following cuisines: Thai."`
3. If no cuisine preferences are specified, no cuisine constraint clauses are appended.

---

## 6. Implementation Plan & File Modifications

1. **`Index.html`**:
   - Add the Cuisine Preferences section inside the Preferences tab with header, quick reset action, and the container for cuisine option items.
2. **`Styles.html`**:
   - Add styles for cuisine grid, 3-way toggle buttons/pills (neutral, prefer, avoid), active states, and hover effects matching the existing palette.
3. **`JavaScript.html`**:
   - Define cuisine master list.
   - Render cuisine list dynamically on load.
   - Handle 3-state toggle interactions.
   - Include `cuisinePreferences` in preference state when saving and loading.
4. **`Code.gs`**:
   - Ensure `db.preferences.cuisinePreferences` defaults and saves properly.
   - Append cuisine preference rules to the Gemini prompt in `generateMealPlanServer()`.
