# Meal Planning Assistant

A Google Apps Script web application that automates weekly meal planning using Google Gemini AI, featuring Google Calendar scheduling, aisle-categorized grocery checklists, on-demand recipe Google Docs, and persistent favorite recipe management.

## Key Features

- **AI-Powered Meal Generation**: Generates customized dinner plans using Google Gemini 2.5 Flash (`gemini-2.5-flash`) based on household size, allergies, natural-language dietary/cuisine styles, mood presets, and pantry priorities.
- **Interactive Recipe Customization**: Lock favored dishes (`🔒`), reroll single recipes (`🔄`), or insert saved household staples (`⭐`).
- **Calendar-First Scheduling**: Automatically schedules dinners on Google Calendar with full ingredients, cooking steps, and prep times embedded, along with a morning **🛒 Groceries** event containing an aisle-sorted shopping checklist.
- **On-Demand Google Docs**: Generates formatted Google Docs for individual recipes directly from the History or Favorites tab without cluttering Google Drive.
- **Recipe Library & Favorites**: Persists created recipes and favorites in Google Drive (`Automated_Meal_Planner_DB.json`) for 1-click reuse.
- **Hybrid API Key Access**: Supports a shared starter Gemini API key for instant access and personal Google AI Studio key overrides stored securely in `UserProperties`.

## Technical Details

- **Backend**: Google Apps Script (`Code.gs`) interacting with Google Calendar, Google Drive, Google Docs, and Gemini 2.5 Flash APIs.
- **Frontend**: Single-page application (`Index.html`, `JavaScript.html`, `Styles.html`) optimized for mobile and desktop with touch-friendly interactions.
- **Testing**: Automated headless test harness covering DOM, styling, backend logic, and Tier 1 prompt safety/schema evaluations.
- **Deployment (`npm run ship`)**: Automated single-command release workflow that syncs git commits to GitHub, pushes source files via Clasp (`npx clasp push`), and creates a versioned Google Apps Script deployment (`npx clasp deploy`).

## File Structure & Database Schema

### Project Files

```
meal_planning/
├── Code.gs              # Backend Apps Script (AI prompts, Calendar, Docs, Drive DB)
├── Index.html           # Main UI layout and view templates
├── JavaScript.html      # Client-side state management, UI rendering, and server calls
├── Styles.html          # CSS design system, responsive styles, and animations
├── appsscript.json      # Apps Script manifest and OAuth scopes
├── package.json         # Scripts, Clasp tooling, and test runners
├── ship.js              # Multi-target release automation (Git + Clasp deploy)
├── spec/                # Architecture specifications and technical designs
├── docs/                # Product reviews and release notes
└── test/                # Automated test suites and prompt evaluation harness
```

### Database Schema (`Automated_Meal_Planner_DB.json`)

User data and recipe libraries are stored in a single JSON document in Google Drive:

```json
{
  "preferences": {
    "allergies": "string",
    "dietaryPreferences": "string",
    "cuisinePreferences": {},
    "dinersCount": 2,
    "defaultMealTime": "06:00 PM",
    "skipWelcomePage": false
  },
  "mealPlan": {
    "recipes": [
      {
        "name": "string",
        "description": "string",
        "prepTime": "string",
        "cookTime": "string",
        "ingredients": [{ "name": "string", "amount": 2, "unit": "tbsp" }],
        "instructions": ["string"],
        "isLocked": false,
        "isReused": false
      }
    ],
    "approved": true,
    "generatedAt": "2026-09-20T12:00:00.000Z",
    "planPreferences": "string",
    "executionResult": {
      "calendarEventsCreated": 7,
      "groceriesEventCreated": true
    }
  },
  "recipeLibrary": {
    "Recipe Name": {
      "name": "string",
      "description": "string",
      "prepTime": "string",
      "cookTime": "string",
      "ingredients": [],
      "instructions": [],
      "isFavorite": true,
      "createdAt": "2026-09-20T12:00:00.000Z",
      "lastScheduledDate": "2026-09-21",
      "originalDiners": 2,
      "docUrl": ""
    }
  },
  "lastUpdated": "2026-09-20T12:00:00.000Z"
}
```

## Support & Contact

- **Author**: Phil Perrin ([phil@milehighdataviz.com](mailto:phil@milehighdataviz.com))
- **Website**: [Mile High Data Viz](https://milehighdataviz.com)
- **License**: ISC
