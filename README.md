# Meal Planning Assistant

A Google Apps Script-based web application that automates meal planning using Google Gemini AI, creating personalized weekly meal plans with calendar integration, smart grocery checklists, and on-demand recipe documents.

## Overview

This application helps you plan weekly meals by:
- **Generating AI-powered meal plans** using Google Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Respecting dietary preferences** including allergies & sensitivities, natural-language dietary and cuisine styles, mood/constraint quick presets, and per-plan custom requests
- **Calendar-First execution** by automatically scheduling dinner events on your Google Calendar with complete recipes, ingredients, and cooking instructions embedded in descriptions, plus a consolidated morning **🛒 Groceries** checklist event organized by grocery aisle
- **On-Demand Google Docs** created directly from Recipe History or Family Favorites whenever you need permanent documents, eliminating Google Drive clutter
- **Storing meal history and family favorites** in Google Drive (`Automated_Meal_Planner_DB.json`) with 1-click staple meal re-use

## Features

### 🍽️ Personalized Meal Planning
- Set allergy and sensitivity constraints to strictly avoid
- Unified natural-language **Dietary & Cuisine Preferences** (e.g., *"Prefer Mediterranean, Mexican, and Italian cuisines. High protein, lean meats, plenty of vegetables..."*)
- One-click **Quick Presets** (`⚡ 20-30 Min Quick Meals`, `🥘 One-Pot`, `👶 Kid-Friendly`, `❄️ Slow Cooker`, `🥦 High-Veggie`, `🧀 Comfort Classics`)
- Specify number of diners for automatic ingredient scaling
- Add **per-plan custom notes & pantry priorities** directly on the Planner tab for each generation
- Set default meal preparation time for calendar scheduling
- Interactive recipe cards with card locking (`🔒`), single-recipe swapping / rerolling (`🔄`), and staple recipe insertion (`⭐ + Add to Plan`)

### 📝 Automated Recipe Generation
- AI-powered recipe generation using Google Gemini 2.5 Flash (`gemini-2.5-flash`) with automatic transient retry and model failover
- Generates exactly the number of recipes requested (or partial counts when locking/reusing meals)
- All ingredient quantities automatically scaled for your household size
- Complete with prep time, cook time, ingredients list, and step-by-step instructions

### 📅 Calendar-First Integration
- Automatically creates dinner events on your primary Google Calendar at your preferred meal time
- Full recipe details, scaled ingredients, and cooking instructions embedded directly in event descriptions
- Dedicated morning **🛒 Groceries** event scheduled on your calendar with an aisle-categorized shopping checklist

### 📄 On-Demand Document Generation
- Create formatted Google Docs for any recipe on-demand directly from the **Recipe History** or **Family Favorites** tab
- Eliminates Drive clutter by only generating documents when you want a permanent Google Doc
- Automatically organized in your Google Drive

### 📊 Recipe History & Family Favorites
- Browse your 25 most recently created recipes
- Star household favorites with 1-click binary toggles (`⭐`)
- 1-click insertion of starred staples directly into your active weekly meal plan
- Persistent JSON database in Google Drive (`Automated_Meal_Planner_DB.json`)

## Installation & Setup

### Prerequisites
- A Google Account with Google Drive and Google Calendar access
- Google Apps Script runtime environment
- Gemini API key (free tier available from Google AI Studio)

### Steps

1. **Deploy to Google Apps Script**
   - Use [Google's Clasp tool](https://github.com/google/clasp) to push code to your Apps Script project:
     ```bash
     npm install
     npm run login
     npm run push
     ```
   - Or manually copy files to your Apps Script project editor

2. **Configure API Keys (Hybrid Model)**
   - **Shared Starter Key (App Owner)**: In the Apps Script project editor, go to **Project Settings** (gear icon) → **Script Properties** and add `SHARED_GEMINI_API_KEY` (or run `setSharedApiKey('YOUR_KEY')`). This enables instant zero-setup meal plan generation for all users.
   - **Personal Key Override (End Users)**: Users can click **✨ Create API Key** on the **Settings** panel to obtain a free personal key from [Google AI Studio](https://aistudio.google.com/app/apikey) for dedicated rate limits. Personal keys are stored securely in Apps Script `User Properties`.

3. **Deploy as Web App**
   - In Apps Script editor: **Deploy** → **New Deployment** → **Type: Web app**
   - Execute as: Your Google Account
   - Who has access: Anyone (or restrict as needed)
   - Note the deployment URL

## Usage

### Basic Workflow

1. **Configure Preferences**
   - Click **Preferences** (or **Settings**)
   - Enter your allergies (e.g., "No eggs, shellfish")
   - Add natural-language dietary and cuisine preferences (e.g., "Prefer Mediterranean and Mexican cuisines. High protein, plenty of greens")
   - Set number of diners (all recipes scale automatically)
   - Set preferred daily meal prep time (e.g., "06:00 PM")
   - Click **Save Preferences**

2. **Generate & Customize Meal Plan**
   - Open the **Planner** tab
   - Select number of dinners (default: 7)
   - Optionally toggle Quick Presets or enter per-plan notes/pantry items
   - Click **Generate Plan**
   - Tailor your plan: lock recipes you like (`🔒`), reroll individual dishes (`🔄`), or insert family staples from the **History** tab (`⭐ + Add to Plan`)

3. **Approve & Schedule**
   - Select or adjust dates for approved recipes
   - Click **Approve & Schedule**
   - System automatically:
     - Saves recipes to your persistent recipe library
     - Creates dinner events with complete recipe instructions on Google Calendar
     - Creates a morning **🛒 Groceries** event on Google Calendar with an aisle-sorted checklist

4. **Access Results & On-Demand Docs**
   - View your dinner events and grocery checklist directly in Google Calendar
   - Whenever you want a formatted Google Doc for a recipe, open **History & Favorites** and click **📄 Create Doc**

### Settings Panel
- **Gemini API Key**: Add/update/remove personal Google AI Studio API key with real-time status badge
- **Data Privacy Details**: Comprehensive documentation on local Google Drive storage and secure AI transmission
- **App Information**: System architecture overview and developer contact links

## File Structure

```
meal_planning/
├── Code.gs              # Backend Apps Script code (database, calendar, docs, AI endpoints)
├── Index.html           # Main HTML structure, views (Planner, History, Preferences, Settings)
├── JavaScript.html      # Client-side JavaScript (state management, card rendering, event handlers)
├── Styles.html          # CSS styling (matte organic palette, glassmorphism, responsive mobile rules)
├── appsscript.json      # Apps Script manifest and OAuth scopes
├── package.json         # NPM scripts and test runner dependencies
├── ship.js              # Post-commit deployment automation script
├── spec/                # Technical specifications and design documents
├── docs/                # Product reviews and release documentation
└── test/                # Consolidated automated test suites & Tier 1 prompt evaluation harness
```

## Technical Details

### Backend (Code.gs)
- **Database**: JSON file stored in Google Drive (`Automated_Meal_Planner_DB.json`) with automated schema migrations
- **API Integration**: Google Gemini 2.5 Flash (`gemini-2.5-flash`) API with JSON schema validation, exponential backoff retries, and fallback cascade
- **Google Services Used**:
  - Google Calendar API (dinner scheduling & aisle-categorized grocery checklist)
  - Google Drive API (database file & folder management)
  - Google Docs API (on-demand document creation)
  - Properties Service (hybrid shared/personal API key storage)

### Frontend (JavaScript.html + Styles.html)
- Single-page application with responsive tab switching (Planner, History/Favorites, Preferences, Settings)
- Mobile-first bottom navigation bar and touch-friendly targets
- Interactive meal plan review, card locking, single-card reroll, and date assignment
- History & Family Favorites sub-navigation with 1-click plan insertion

### Key Functions
- `generateMealPlanServer()` - Calls Gemini API with user preferences, mood chips, locked cards, and reused staples
- `rerollSingleRecipeServer()` - Swaps an individual recipe while preventing duplicate dishes
- `approveMealPlanServer()` - Creates Google Calendar dinner and grocery events and caches structured recipes
- `createRecipeDocServer()` - On-demand generation of formatted Google Docs for individual recipes
- `toggleFavoriteRecipeServer()` - Binary favorite starring in persistent Google Drive library
- `loadAppData()` - Initializes database, performs schema migrations, and checks API key status

## Database Schema

The application stores data in `Automated_Meal_Planner_DB.json` in Google Drive with the following structure:

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
        "ingredients": [
          {
            "name": "string",
            "amount": 2,
            "unit": "tbsp"
          }
        ],
        "instructions": [
          "string"
        ],
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
    "Lemon Herb Salmon": {
      "name": "Lemon Herb Salmon",
      "description": "string",
      "prepTime": "15m",
      "cookTime": "20m",
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

## Development

### Prerequisites for Development
```bash
npm install
```

### Clasp Commands
```bash
npm run login    # Authenticate with Google Account
npm run push     # Push local code to Apps Script
npm run pull     # Pull code from Apps Script to local
npm run watch    # Watch mode: auto-push on file changes
npm run deploy   # Create a new versioned deployment in Apps Script
```

### 🧪 Automated Testing & Prompt Evaluation Suite

The repository includes a consolidated headless test runner and a deterministic **Tier 1 Prompt Evaluation Test Harness** to guard against prompt regressions, safety hazards, and schema drift.

```bash
# Run all consolidated test suites (DOM, CSS, Backend, DB, & Tier 1 Prompt Eval)
npm test

# Run the dedicated Tier 1 Deterministic Prompt Evaluation benchmark suite (mocked)
npm run test:prompts

# Run live prompt evaluation against the Gemini API (requires GEMINI_API_KEY)
npm run test:prompts:live
```

#### What the Tier 1 Prompt Evaluation Suite validates:
1. **JSON Schema Integrity (100% Target):** Enforces complete recipe contracts (`name`, `description`, `prepTime`, `cookTime`, `ingredients`, `instructions`).
2. **Hard Allergen Scanning (P0 Zero-Tolerance Gate):** Regex scans ingredients and instructions against a dictionary of allergens and derivatives (e.g., soy sauce, tamari, almond flour).
3. **Avoided Cuisine Absence (P0 Gate):** Guarantees zero contamination from avoided cuisines.
4. **Time Duration Bounds:** Confirms total preparation and cooking time $\le 30$ minutes when the quick tag (`⚡ 20-30 Min Quick Meals`) is active.
5. **Pantry Ingredient Utilization:** Verifies on-hand fridge ingredients are prioritized in the initial meal plan dishes.
6. **Prompt Injection Boundary Isolation:** Confirms freeform user notes (`planPreferences`) cannot override system safety directives.

### 🚀 Deployment & Release Workflow (All-in-One)

After staging and committing your code changes locally via Git, you can push to GitHub, sync to Google Apps Script, and create a new Apps Script deployment all in one command:

```bash
# 1. Stage and commit changes
git add .
git commit -m "feat: your change description"

# 2. Ship to GitHub + Google Apps Script + Apps Script Deployment
npm run ship
```

#### What `npm run ship` does automatically:
1. **GitHub Push**: Runs `git push` to synchronize remote commits.
2. **Apps Script Push**: Runs `npx clasp push` to sync code files to Apps Script.
3. **Apps Script Deploy**: Runs `npx clasp deploy` with your commit message to create a new versioned deployment.

> **Tip:** If you wish to provide a custom deployment description different from your latest git commit, pass it as an argument:
> ```bash
> npm run ship -- "Custom release description"
> ```

### Debugging
- Check Apps Script Execution Log: **Executions** panel in Apps Script editor
- Browser console logs available via browser DevTools
- Google Apps Script Stackdriver Logging enabled via `appsscript.json`

## Troubleshooting

### "Gemini API key is not configured"
- Go to Settings and check API key status
- If the shared key quota is full or unavailable, paste your free Google AI Studio API key and click **Save API Key**

### "No active meal plan found to approve"
- Generate a new meal plan first using the **Planner** tab

### Calendar events not created
- Verify Google Calendar access is enabled and authorized for your Google Account
- Check that your primary/default Google Calendar is accessible

### Shopping list contains duplicates
- This is expected if recipes use the same ingredient with different units
- The consolidation function groups by ingredient name and unit, displaying all quantities

## API Costs

- **Gemini API**: Free tier available on Google AI Studio
- **Google Services**: Free within Google Apps Script quotas
- No additional charges for Google Drive, Docs, or Calendar access

## License

ISC License

## Support

For questions, feature requests, or feedback:
- **Contact:** Phil at [phil@milehighdataviz.com](mailto:phil@milehighdataviz.com)
- **Website:** [Mile High Data Viz](https://milehighdataviz.com)

---

**Created with Google Apps Script and Google Gemini AI**
