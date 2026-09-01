# Automated Meal Planning Assistant

A Google Apps Script-based web application that automates meal planning using Google Gemini AI, creating personalized weekly meal plans with shopping lists and calendar integration.

## Overview

This application helps you plan weekly meals by:
- **Generating AI-powered meal plans** using Google Gemini's generative AI
- **Respecting dietary preferences** including allergies, dietary restrictions, and on-hand ingredients
- **Creating organized documentation** with individual recipe documents and consolidated shopping lists
- **Integrating with Google Calendar** for meal prep scheduling
- **Storing meal history** in Google Drive for future reference

## Features

### 🍽️ Personalized Meal Planning
- Set dietary allergies and preferences
- Configure **Cuisine & Meal Style Preferences** with 3-state controls (Prefer, Avoid, None) across 12 popular cuisine and diet styles in a clean 2-column layout
- Specify number of diners for automatic recipe scaling
- Include ingredients you have on hand
- Set default meal preparation time

### 📝 Automated Recipe Generation
- AI-powered recipe generation using Google Gemini 3.5 Flash
- Generates exactly the number of recipes you request
- All ingredient quantities automatically scaled for your household size
- Complete with prep time, cook time, and step-by-step instructions

### 📄 Document Generation
- Individual Google Docs created for each approved recipe
- **Consolidated shopping list** automatically merged and deduplicated by ingredient
- Documents organized in Google Drive folders
- Organized filing by date (YYYYMMDD format)

### 📅 Calendar Integration
- Automatically creates calendar events for each meal
- Events scheduled for your preferred meal time
- Full recipe details embedded in event descriptions
- Links to recipe documents included

### 📊 Recipe History
- Browse your 25 most recently created recipes
- Access previous meal plans from Google Drive
- Re-use approved recipes for future planning

## Installation & Setup

### Prerequisites
- A Google Account with Google Drive access
- Google Apps Script runtime environment
- Gemini API key (free tier available)

### Steps

1. **Deploy to Google Apps Script**
   - Use [Google's Clasp tool](https://github.com/google/clasp) to push code to your Apps Script project:
     ```bash
     npm install
     npm run login
     npm run push
     ```
   - Or manually copy files to your Apps Script project editor

2. **Configure API Key**
   - Obtain a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Open the deployed application
   - Go to **Settings** panel and paste your API key
   - The key is securely stored in Google Apps Script User Properties

3. **Deploy as Web App**
   - In Apps Script editor: **Deploy** → **New Deployment** → **Type: Web app**
   - Execute as: Your Google Account
   - Who has access: Anyone (or restrict as needed)
   - Note the deployment URL

## Usage

### Basic Workflow

1. **Configure Preferences**
   - Click **Settings**
   - Enter your allergies (e.g., "No eggs")
   - Add dietary preferences (e.g., "High protein, seasonal vegetables")
   - Specify on-hand ingredients (optional)
   - Set number of diners
   - Set preferred meal prep time (24-hour or AM/PM format)
   - Click **Save**

2. **Generate Meal Plan**
   - Click **Generate Plan**
   - Select number of dinners (default: 7)
   - Review AI-generated recipes
   - Approve/reject individual recipes by checking checkboxes

3. **Approve & Execute**
   - Select dates for approved recipes
   - Click **Approve & Execute**
   - System automatically:
     - Creates individual recipe documents in Google Drive
     - Generates consolidated shopping list
     - Creates calendar events for meal prep

4. **Access Results**
   - View links to all created documents in the confirmation panel
   - Check "Meal Plan Recipes" folder in Google Drive for documents
   - Check "Shopping Lists" subfolder for your shopping list
   - View calendar events in Google Calendar

### Settings Panel
- **Allergies**: Specify any food allergies (e.g., "nuts, shellfish")
- **Dietary Preferences**: Include any dietary restrictions or preferences
- **On-Hand Ingredients**: List ingredients to prioritize in recipes
- **Number of Diners**: All recipes automatically scale to this count
- **Default Meal Time**: Time to schedule calendar events (e.g., "6:00 PM" or "18:00")
- **API Key Management**: Add/update/remove Gemini API key

## File Structure

```
meal_planning/
├── Code.gs              # Backend Apps Script code (Google Apps Script)
├── Index.html           # Main web page template
├── JavaScript.html      # Client-side JavaScript
├── Styles.html          # CSS styling
├── appsscript.json      # Apps Script configuration
├── package.json         # NPM scripts and dependencies
├── ship.js              # Post-commit deployment automation script
├── spec/                # Technical specifications
└── clasp_github_setup.md # Setup instructions for GitHub integration
```

## Technical Details

### Backend (Code.gs)
- **Database**: JSON file stored in Google Drive ("Automated_Meal_Planner_DB.json")
- **API Integration**: Google Gemini 3.5 Flash API with JSON schema validation
- **Google Services Used**:
  - Google Drive API (file/folder management)
  - Google Docs API (document creation)
  - Google Calendar API (event scheduling)
  - Properties Service (secure API key storage)

### Frontend (JavaScript.html + Styles.html)
- Interactive meal plan review and approval interface
- Real-time date selection for recipes
- Shopping list preview
- Settings management UI

### Key Functions
- `generateMealPlanServer()` - Calls Gemini API with preferences
- `approveMealPlanServer()` - Creates documents, shopping list, and calendar events
- `consolidateShoppingList()` - Intelligently merges and deduplicates ingredients
- `getRecipeHistory()` - Retrieves past recipes from Drive

## Database Schema

The application stores data in a JSON file with the following structure:

```json
{
  "preferences": {
    "allergies": "string",
    "dietaryPreferences": "string",
    "onHandIngredients": "string",
    "dinersCount": number,
    "defaultMealTime": "HH:MM AM/PM or HH:MM"
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
            "amount": number,
            "unit": "string"
          }
        ],
        "instructions": ["string"]
      }
    ],
    "approved": boolean,
    "generatedAt": "ISO 8601 timestamp",
    "executionResult": {
      "recipeDocs": [
        {
          "name": "string",
          "date": "YYYY-MM-DD",
          "url": "string"
        }
      ],
      "shoppingListDocUrl": "string",
      "calendarEventsCreated": number
    }
  },
  "lastUpdated": "ISO 8601 timestamp"
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
- Google Apps Script Stackdriver Logging enabled via appsscript.json

## Troubleshooting

### "API key is not configured"
- Go to Settings and add your Gemini API key
- Ensure the key is valid and not expired

### "No active meal plan found to approve"
- Generate a new meal plan first using **Generate Plan**

### Calendar events not created
- Verify Google Calendar access is enabled for your account
- Check that the default calendar is accessible

### Shopping list contains duplicates
- This is expected if recipes use the same ingredient with different units
- The consolidation function groups by ingredient name and unit, displaying all quantities

## API Costs

- **Gemini API**: Free tier available (60 requests/min)
- **Google Services**: Free within Apps Script quotas
- No additional charges for Google Drive, Docs, or Calendar access

## License

ISC License

## Contributing

To contribute improvements:
1. Test changes locally with `npm run watch`
2. Submit pull requests with detailed descriptions
3. Ensure code follows existing style

## Support

For issues or feature requests, please open a GitHub issue in this repository.

---

**Created with Google Apps Script and Google Gemini AI**
