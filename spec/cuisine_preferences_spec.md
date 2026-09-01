# Feature Specification: Cuisine Preferences

## 1. Overview & Objective
This specification defines the functional and technical requirements for adding **Cuisine Preferences** to the Meal Planning Assistant. Users will be able to categorize a comprehensive list of common cuisine types as **"Prefer"**, **"Avoid"**, or leave them as **"Neutral"** (no preference). 

These preferences will persist in the user's Google Drive database (`Automated_Meal_Planner_DB.json`) and dynamically guide the Gemini AI model during dinner plan generation.

---

## 2. Identified Cuisine Types
A curated list of 22 popular and diverse cuisine & dietary preference types covering everyday home cooking and global dining:

| # | Cuisine | Description / Typical Dishes |
|---|---|---|
| 1 | **Italian** | Pasta, risotto, rustic baked dishes, tomato/herb-rich preparations |
| 2 | **Mexican** | Tacos, enchiladas, fajitas, salsas, chili & lime flavor profiles |
| 3 | **American / Comfort** | Roasts, burgers, grilled meats, casseroles, pot pies, BBQ |
| 4 | **Chinese** | Stir-fries, dumplings, fried rice, noodle dishes, savory-sweet glazes |
| 5 | **Japanese** | Teriyaki, ramen, udon, donburi bowls, miso-glazed proteins |
| 6 | **Indian** | Curries, tikka masala, dal, biryani, spiced stews |
| 7 | **Thai** | Pad Thai, coconut curries, spicy basil stir-fries, lemongrass/lime soups |
| 8 | **Mediterranean / Greek** | Souvlaki, gyro bowls, roasted lemon chicken, olive oil & feta dishes |
| 9 | **Middle Eastern / Levantine** | Shawarma bowls, falafel, shakshuka, za'atar chicken, kofta |
| 10 | **French** | Braised meats, quiches, ratatouille, herb pan sauces, rustic gratins |
| 11 | **Korean** | Bulgogi, bibimbap, kimchi stews, glazed chicken, gochujang marinades |
| 12 | **Vietnamese** | Pho bowls, banh mi inspired plates, noodle bowls (bun cha), fresh rolls |
| 13 | **Spanish** | Paella, tapas-style platters, garlic shrimp, braised chicken, Romesco |
| 14 | **Cajun & Creole** | Jambalaya, gumbo, blackened fish/chicken, etouffee |
| 15 | **Tex-Mex / Southwestern** | Sheet-pan fajitas, chili con carne, quesadillas, loaded taco bowls |
| 16 | **Caribbean / Jamaican** | Jerk chicken, curried goat/chicken, rice & peas, mojo pork |
| 17 | **British & Irish** | Shepherd's pie, cottage pie, fish & chips, beef stew, bangers & mash |
| 18 | **German & Central European** | Schnitzel, roasted sausages, goulash, braised cabbage dishes |
| 19 | **Moroccan & North African** | Tagines, spiced couscous, harissa roasted chicken/vegetables |
| 20 | **Southeast Asian / Indonesian** | Satay, nasi goreng, rendang, peanut sauce dishes |
| 21 | **Vegetarian** | Plant-forward meals, legumes, dairy/egg options, tofu/tempeh, meatless mains |
| 22 | **Vegan** | 100% plant-based recipes, no animal products/dairy/honey |

---

## 3. User Interface & Experience (Preferences Tab)

### 3.1 Layout & Visual Design
- **Section Placement**: Inserted into the "Preferences" view between the free-text Dietary Preferences textarea and the On-Hand Ingredients textarea.
- **Controls**: Interactive cards or a responsive grid of cuisine items.
- **3-State Segmented Control / Pill Selector**:
  - `Neutral` (Default): Gray/subtle muted appearance. The cuisine is available normally.
  - `Prefer` (Thumbs Up / Heart / Bookmark): Highlighted with theme accent (Sage green `--accent-primary`), signaling priority to the AI.
  - `Avoid` (Thumbs Down / Prohibited / Cross): Highlighted with warning/danger styling (Soft red `--error`), signaling strict exclusion to the AI.
- **Quick Actions**:
  - `Reset All to Neutral` button to clear custom cuisine selections with one click.
  - Optional search/filter input to quickly find a cuisine in the list.

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
