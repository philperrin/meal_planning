/**
 * Automated Test Suite for Meal Planning Assistant
 *
 * Validates:
 * 1. Syntax and JSON/HTML integrity
 * 2. Undeclared variable and reference errors in Code.gs
 * 3. Backend logic (API key resolution, loadAppData, savePreferences, consolidateShoppingList, parseTime, schema migrations)
 * 4. Frontend DOM element binding integrity
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');

// ANSI Color formatting for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function describe(suiteName, fn) {
  console.log(`\n${COLORS.bright}${COLORS.cyan}● ${suiteName}${COLORS.reset}`);
  fn();
}

function test(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ${COLORS.green}✔${COLORS.reset} ${testName}`);
  } catch (err) {
    failedTests++;
    failures.push({ name: testName, error: err });
    console.log(`  ${COLORS.red}✖${COLORS.reset} ${testName}`);
    console.log(`    ${COLORS.red}${err.message}${COLORS.reset}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message ? message + ' - ' : ''}Expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message ? message + ' - ' : ''}Expected: ${expectedStr}, got: ${actualStr}`);
  }
}

// ---------------------------------------------------------
// Mock Google Apps Script Environment Factory
// ---------------------------------------------------------
function createMockGasContext(initialDb, initialUserProps = {}, initialScriptProps = {}, mockRecipeFiles = []) {
  let dbState = JSON.parse(JSON.stringify(initialDb || {
    preferences: {
      allergies: "No eggs.",
      dietaryPreferences: "High protein.",
      cuisinePreferences: {},
      dinersCount: 2,
      defaultMealTime: "06:00 PM"
    },
    mealPlan: null,
    recipeRatings: {},
    recipeLibrary: {},
    lastUpdated: new Date().toISOString()
  }));

  const userPropsStore = { ...initialUserProps };
  const scriptPropsStore = { ...initialScriptProps };
  let recipeFiles = [...mockRecipeFiles];

  const mockFile = {
    getBlob: () => ({
      getDataAsString: () => JSON.stringify(dbState)
    }),
    setContent: (content) => {
      dbState = JSON.parse(content);
      return mockFile;
    },
    getName: () => "Automated_Meal_Planner_DB.json",
    getUrl: () => "https://drive.google.com/file/d/mock-db-id/view",
    getId: () => "mock-db-id",
    getDateCreated: () => new Date()
  };

  const sandbox = {
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    String: String,
    Array: Array,
    Object: Object,
    RegExp: RegExp,
    Error: Error,
    Set: Set,
    Logger: {
      log: () => {}
    },
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: (key) => (userPropsStore[key] !== undefined ? userPropsStore[key] : null),
        setProperty: (key, val) => { userPropsStore[key] = String(val); },
        deleteProperty: (key) => { delete userPropsStore[key]; },
        getProperties: () => ({ ...userPropsStore })
      }),
      getScriptProperties: () => ({
        getProperty: (key) => (scriptPropsStore[key] !== undefined ? scriptPropsStore[key] : null),
        setProperty: (key, val) => { scriptPropsStore[key] = String(val); },
        deleteProperty: (key) => { delete scriptPropsStore[key]; },
        getProperties: () => ({ ...scriptPropsStore })
      })
    },
    DriveApp: {
      getFilesByName: (name) => {
        let yielded = false;
        return {
          hasNext: () => !yielded,
          next: () => { yielded = true; return mockFile; }
        };
      },
      createFile: (name, content, mimeType) => {
        dbState = JSON.parse(content);
        return mockFile;
      },
      getFoldersByName: () => ({
        hasNext: () => true,
        next: () => ({
          getFiles: () => {
            let idx = 0;
            return {
              hasNext: () => idx < recipeFiles.length,
              next: () => {
                const item = recipeFiles[idx++];
                return {
                  getName: () => item.name,
                  getUrl: () => item.url || `https://docs.google.com/document/d/${item.id || 'id'}/edit`,
                  getId: () => item.id || 'id',
                  getDateCreated: () => new Date(item.createdTime || Date.now()),
                  setName: (newName) => { item.name = newName; }
                };
              }
            };
          },
          getFoldersByName: () => ({ hasNext: () => true, next: () => ({ createFolder: () => ({}) }) }),
          createFolder: () => ({})
        })
      }),
      createFolder: () => ({
        getFoldersByName: () => ({ hasNext: () => false }),
        createFolder: () => ({})
      }),
      getFileById: (id) => {
        const found = recipeFiles.find(f => f.id === id);
        return {
          getName: () => (found ? found.name : "mock-file"),
          setName: (newName) => { if (found) found.name = newName; },
          getUrl: () => `https://docs.google.com/document/d/${id}/edit`,
          getId: () => id,
          moveTo: () => {}
        };
      }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle: function() { return this; },
          addMetaTag: function() { return this; },
          setXFrameOptionsMode: function() { return this; }
        })
      }),
      createHtmlOutputFromFile: () => ({
        getContent: () => ""
      })
    },
    DocumentApp: {
      ParagraphHeading: { HEADING1: 'H1', HEADING2: 'H2' },
      create: (name) => ({
        getId: () => "mock-doc-id",
        getUrl: () => `https://docs.google.com/document/d/mock-doc-id/edit`,
        getBody: () => ({
          appendParagraph: function() { return { setHeading: function() { return this; }, setItalic: function() { return this; }, setBold: function() { return this; } }; },
          appendListItem: function() { return this; }
        }),
        saveAndClose: () => {}
      })
    },
    CalendarApp: {
      getDefaultCalendar: () => ({
        createEvent: () => ({})
      })
    },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  recipes: [
                    {
                      name: "Mock Recipe",
                      description: "Tasty mock meal",
                      prepTime: "10 mins",
                      cookTime: "20 mins",
                      ingredients: [{ name: "Olive oil", amount: 2, unit: "tbsp" }],
                      instructions: ["Cook and serve."]
                    }
                  ]
                })
              }]
            }
          }]
        })
      })
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    getMockDbState: () => dbState,
    getUserPropsStore: () => userPropsStore,
    getScriptPropsStore: () => scriptPropsStore
  };

  const context = vm.createContext(sandbox);
  const codeGsContent = fs.readFileSync(path.join(ROOT_DIR, 'Code.gs'), 'utf8');
  vm.runInContext(codeGsContent, context);

  return context;
}

// ---------------------------------------------------------
// RUN TEST SUITES
// ---------------------------------------------------------

console.log(`\n${COLORS.bright}========================================`);
console.log(`🧪 Running Meal Planning App Test Suite`);
console.log(`========================================${COLORS.reset}`);

// 1. Static & Syntax Analysis
describe('1. File System & Syntax Integrity', () => {
  test('Required project files must exist', () => {
    const requiredFiles = [
      'Code.gs',
      'Index.html',
      'JavaScript.html',
      'Styles.html',
      'appsscript.json',
      '.clasp.json',
      'ship.js',
      'package.json'
    ];
    requiredFiles.forEach(file => {
      assert(fs.existsSync(path.join(ROOT_DIR, file)), `Missing required file: ${file}`);
    });
  });

  test('JSON configuration files parse without syntax errors', () => {
    ['appsscript.json', '.clasp.json', 'package.json'].forEach(file => {
      const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
      try {
        JSON.parse(content);
      } catch (e) {
        throw new Error(`JSON syntax error in ${file}: ${e.message}`);
      }
    });
  });

  test('Code.gs passes JavaScript syntax parsing', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'Code.gs'), 'utf8');
    new vm.Script(code, { filename: 'Code.gs' });
  });

  test('ship.js passes JavaScript syntax parsing', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'ship.js'), 'utf8');
    new vm.Script(code, { filename: 'ship.js' });
  });

  test('JavaScript.html contains valid client-side scripts', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');
    const scriptMatch = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
    assert(scriptMatch && scriptMatch[1], 'No <script> tag found in JavaScript.html');
    const scriptCode = scriptMatch[1];
    new vm.Script(scriptCode, { filename: 'JavaScript.html' });
  });
});

// 2. Backend Unit & API Key Logic Tests
describe('2. Backend Logic & Hybrid API Key Management', () => {
  test('loadAppData() executes successfully without ReferenceError', () => {
    const ctx = createMockGasContext();
    const res = ctx.loadAppData();
    assert(res !== undefined, 'loadAppData returned nothing');
    assert(res.db !== undefined, 'loadAppData missing db object');
    assert(res.apiKeyStatus !== undefined, 'loadAppData missing apiKeyStatus');
  });

  test('getEffectiveApiKey() returns "none" when no keys are configured', () => {
    const ctx = createMockGasContext(null, {}, {});
    const keyInfo = ctx.getEffectiveApiKey();
    assertEqual(keyInfo.keyType, 'none');
    assertEqual(keyInfo.key, null);

    const appData = ctx.loadAppData();
    assertEqual(appData.hasApiKey, false);
    assertEqual(appData.apiKeyStatus.activeKeyType, 'none');
    assertEqual(appData.apiKeyStatus.hasPersonalKey, false);
    assertEqual(appData.apiKeyStatus.hasSharedKey, false);
  });

  test('getEffectiveApiKey() recognizes shared starter key when present in Script Properties', () => {
    const ctx = createMockGasContext(null, {}, { SHARED_GEMINI_API_KEY: 'shared_key_abc123' });
    const keyInfo = ctx.getEffectiveApiKey();
    assertEqual(keyInfo.keyType, 'shared');
    assertEqual(keyInfo.key, 'shared_key_abc123');

    const appData = ctx.loadAppData();
    assertEqual(appData.hasApiKey, true);
    assertEqual(appData.apiKeyStatus.activeKeyType, 'shared');
    assertEqual(appData.apiKeyStatus.hasPersonalKey, false);
    assertEqual(appData.apiKeyStatus.hasSharedKey, true);
  });

  test('getEffectiveApiKey() prioritizes personal key in User Properties over shared key', () => {
    const ctx = createMockGasContext(
      null,
      { GEMINI_API_KEY: 'personal_key_xyz789' },
      { SHARED_GEMINI_API_KEY: 'shared_key_abc123' }
    );
    const keyInfo = ctx.getEffectiveApiKey();
    assertEqual(keyInfo.keyType, 'personal');
    assertEqual(keyInfo.key, 'personal_key_xyz789');

    const appData = ctx.loadAppData();
    assertEqual(appData.hasApiKey, true);
    assertEqual(appData.apiKeyStatus.activeKeyType, 'personal');
    assertEqual(appData.apiKeyStatus.hasPersonalKey, true);
    assertEqual(appData.apiKeyStatus.hasSharedKey, true);
  });

  test('saveApiKey() saves personal key and updates status', () => {
    const ctx = createMockGasContext(null, {}, { SHARED_GEMINI_API_KEY: 'shared_starter' });
    const res = ctx.saveApiKey('new_personal_key');
    assertEqual(res.success, true);
    assertEqual(res.apiKeyStatus.hasPersonalKey, true);
    assertEqual(res.apiKeyStatus.activeKeyType, 'personal');

    const effective = ctx.getEffectiveApiKey();
    assertEqual(effective.key, 'new_personal_key');
    assertEqual(effective.keyType, 'personal');
  });

  test('deleteApiKey() removes personal key and reverts to shared key', () => {
    const ctx = createMockGasContext(
      null,
      { GEMINI_API_KEY: 'personal_key' },
      { SHARED_GEMINI_API_KEY: 'shared_starter' }
    );
    const res = ctx.deleteApiKey();
    assertEqual(res.success, true);
    assertEqual(res.apiKeyStatus.hasPersonalKey, false);
    assertEqual(res.apiKeyStatus.activeKeyType, 'shared');

    const effective = ctx.getEffectiveApiKey();
    assertEqual(effective.key, 'shared_starter');
    assertEqual(effective.keyType, 'shared');
  });
});

// 3. Data Processing & Helper Functions
describe('3. Data Processing & Helper Functions', () => {
  test('consolidateShoppingList() correctly aggregates ingredients and units', () => {
    const ctx = createMockGasContext();
    const recipes = [
      {
        name: "Recipe 1",
        ingredients: [
          { name: "Garlic", amount: 2, unit: "cloves" },
          { name: "Olive Oil", amount: 2, unit: "tbsp" },
          { name: "Chicken Breast", amount: 1, unit: "lb" }
        ]
      },
      {
        name: "Recipe 2",
        ingredients: [
          { name: "garlic", amount: 3, unit: "cloves" },
          { name: "Olive Oil", amount: 1, unit: "tbsp" },
          { name: "Garlic", amount: 1, unit: "tsp" }
        ]
      }
    ];

    const consolidated = ctx.consolidateShoppingList(recipes);
    assert(Array.isArray(consolidated), 'Result should be an array');

    // Alphabetical order: chicken breast, garlic, olive oil
    assertEqual(consolidated[0].name, 'chicken breast');
    assertEqual(consolidated[0].amounts[0].amount, 1);
    assertEqual(consolidated[0].amounts[0].unit, 'lb');

    assertEqual(consolidated[1].name, 'garlic');
    // Garlic has 2 units: 5 cloves and 1 tsp
    const clovesEntry = consolidated[1].amounts.find(a => a.unit === 'cloves');
    const tspEntry = consolidated[1].amounts.find(a => a.unit === 'tsp');
    assert(clovesEntry !== undefined, 'Missing cloves entry for garlic');
    assertEqual(clovesEntry.amount, 5);
    assert(tspEntry !== undefined, 'Missing tsp entry for garlic');
    assertEqual(tspEntry.amount, 1);

    assertEqual(consolidated[2].name, 'olive oil');
    assertEqual(consolidated[2].amounts[0].amount, 3);
    assertEqual(consolidated[2].amounts[0].unit, 'tbsp');
  });

  test('parseTime() parses 12h, 24h, and default times accurately', () => {
    const ctx = createMockGasContext();

    assertDeepEqual(ctx.parseTime("06:00 PM"), { hours: 18, minutes: 0 });
    assertDeepEqual(ctx.parseTime("6:30 PM"), { hours: 18, minutes: 30 });
    assertDeepEqual(ctx.parseTime("08:15 AM"), { hours: 8, minutes: 15 });
    assertDeepEqual(ctx.parseTime("12:00 PM"), { hours: 12, minutes: 0 });
    assertDeepEqual(ctx.parseTime("12:30 AM"), { hours: 0, minutes: 30 });
    assertDeepEqual(ctx.parseTime("19:45"), { hours: 19, minutes: 45 });
    assertDeepEqual(ctx.parseTime(""), { hours: 18, minutes: 0 });
    assertDeepEqual(ctx.parseTime(null), { hours: 18, minutes: 0 });
  });

  test('savePreferences() handles diner counts, cuisine map, and defaults', () => {
    const ctx = createMockGasContext();
    const newPrefs = {
      allergies: "Peanuts",
      dietaryPreferences: "Keto",
      cuisinePreferences: { Italian: "prefer", Mexican: "avoid" },
      dinersCount: "4",
      defaultMealTime: "07:30 PM",
      skipWelcomePage: true
    };

    const res = ctx.savePreferences(newPrefs);
    assertEqual(res.success, true);
    assertEqual(res.db.preferences.allergies, "Peanuts");
    assertEqual(res.db.preferences.dietaryPreferences, "Keto");
    assertEqual(res.db.preferences.dinersCount, 4);
    assertEqual(res.db.preferences.defaultMealTime, "07:30 PM");
    assertEqual(res.db.preferences.skipWelcomePage, true);
    assertEqual(res.db.preferences.cuisinePreferences.Italian, "prefer");
    assertEqual(res.db.preferences.cuisinePreferences.Mexican, "avoid");
  });

  test('setSkipWelcomePreference() directly updates skipWelcomePage flag in DB', () => {
    const ctx = createMockGasContext();
    const resTrue = ctx.setSkipWelcomePreference(true);
    assertEqual(resTrue.success, true);
    assertEqual(resTrue.skipWelcomePage, true);

    const appData = ctx.loadAppData();
    assertEqual(appData.db.preferences.skipWelcomePage, true);

    const resFalse = ctx.setSkipWelcomePreference(false);
    assertEqual(resFalse.success, true);
    assertEqual(resFalse.skipWelcomePage, false);
  });

  test('Database schema migrations migrate legacy "restrictions" to "dietaryPreferences" and ensure skipWelcomePage', () => {
    const legacyDb = {
      preferences: {
        restrictions: "No gluten."
      }
    };
    const ctx = createMockGasContext(legacyDb);
    const data = ctx.loadAppData();
    assertEqual(data.db.preferences.dietaryPreferences, "No gluten.");
    assertEqual(data.db.preferences.restrictions, undefined);
    assertEqual(data.db.preferences.dinersCount, 2);
    assertEqual(data.db.preferences.defaultMealTime, "06:00 PM");
    assertEqual(data.db.preferences.skipWelcomePage, false);
    assertDeepEqual(data.db.preferences.cuisinePreferences, {});
  });
});

// 4. UI Bindings & Template Consistency Tests
describe('4. Frontend DOM & Template Element Bindings', () => {
  test('Index.html defines all element IDs used by JavaScript.html', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');
    const requiredIds = [
      'pref-allergies',
      'pref-dietary-preferences',
      'pref-diners',
      'pref-meal-time',
      'pref-skip-welcome',
      'skip-welcome-checkbox',
      'cuisine-grid',
      'api-key-input',
      'api-badge',
      'api-desc',
      'meal-count-input',
      'plan-preferences-input',
      'planner-container',
      'history-container',
      'loader',
      'toast',
      'bottom-nav'
    ];

    requiredIds.forEach(id => {
      const pattern = new RegExp(`id=["']${id}["']`, 'i');
      assert(pattern.test(indexHtml), `Index.html is missing element with id="${id}"`);
    });
  });

  test('JavaScript.html contains 12 default cuisines in CUISINES list', () => {
    const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');
    const cuisineMatches = jsHtml.match(/name:\s*["']([^"']+)["']/g);
    assert(cuisineMatches && cuisineMatches.length >= 12, 'CUISINES array should define at least 12 cuisines');
  });
});

// 5. Mobile Responsiveness & Ergonomics Validation (MPA-17)
describe('5. Mobile Responsiveness & Ergonomics Tooling (MPA-17)', () => {
  test('Index.html includes mobile viewport meta configuration', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');
    assert(/<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width/i.test(indexHtml),
      'Index.html is missing responsive viewport meta tag');
  });

  test('Index.html defines both desktop and mobile navigation elements with matching view tabs', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');
    
    // Check for desktop and mobile navigation wrappers
    assert(/<nav\s+class=["'][^"']*nav-desktop/i.test(indexHtml), 'Missing desktop nav container in Index.html');
    assert(/<nav\s+class=["'][^"']*bottom-nav/i.test(indexHtml), 'Missing sticky bottom-nav in Index.html');

    // Check all 4 views exist in both desktop and bottom navigation
    ['planner', 'history', 'preferences', 'settings'].forEach(view => {
      const count = (indexHtml.match(new RegExp(`data-view=["']${view}["']`, 'g')) || []).length;
      assert(count >= 2, `Expected at least 2 nav buttons (desktop + mobile) for view: ${view}`);
    });
  });

  test('Styles.html defines mobile media query (<768px) with sticky bottom navigation rules', () => {
    const stylesHtml = fs.readFileSync(path.join(ROOT_DIR, 'Styles.html'), 'utf8');
    
    assert(/@media\s*\(\s*max-width:\s*768px\s*\)/i.test(stylesHtml), 'Styles.html missing @media (max-width: 768px) query');
    assert(/\.bottom-nav\s*\{[^}]*position:\s*fixed/i.test(stylesHtml), 'Styles.html missing fixed positioning for .bottom-nav');
    assert(/\.nav-desktop\s*\{[^}]*display:\s*none/i.test(stylesHtml), 'Styles.html must hide .nav-desktop on mobile');
  });

  test('Styles.html enforces accessibility touch target minimums (>= 44px) and safe-area insets', () => {
    const stylesHtml = fs.readFileSync(path.join(ROOT_DIR, 'Styles.html'), 'utf8');
    
    // Check checkbox hitbox minimum 44px
    assert(/recipe-checkbox-hitbox[\s\S]*?min-width:\s*44px/i.test(stylesHtml), 'Recipe checkbox hitbox missing min-width: 44px');
    assert(/recipe-checkbox-hitbox[\s\S]*?min-height:\s*44px/i.test(stylesHtml), 'Recipe checkbox hitbox missing min-height: 44px');

    // Check safe-area inset usage for sticky bottom nav
    assert(/safe-area-inset-bottom/i.test(stylesHtml), 'Styles.html should utilize env(safe-area-inset-bottom) for mobile clearance');
  });

  function createMockBrowserContext() {
    const mockElement = {
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      getAttribute: () => '',
      innerHTML: '',
      value: '',
      className: ''
    };

    const sandbox = {
      console: console,
      Math: Math,
      parseInt: parseInt,
      parseFloat: parseFloat,
      String: String,
      RegExp: RegExp,
      Date: Date,
      Set: Set,
      document: {
        querySelectorAll: () => [mockElement],
        querySelector: () => mockElement,
        getElementById: () => mockElement,
        addEventListener: () => {}
      },
      window: {
        scrollTo: () => {}
      },
      google: {
        script: {
          run: {
            withSuccessHandler: function() { return this; },
            withFailureHandler: function() { return this; },
            loadAppData: () => {}
          }
        }
      }
    };
    const context = vm.createContext(sandbox);
    return context;
  }

  test('JavaScript.html calculateTotalTime() correctly computes and formats recipe badge times', () => {
    const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');
    const scriptMatch = jsHtml.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
    assert(scriptMatch && scriptMatch[1], 'Script tag missing');

    const context = createMockBrowserContext();
    vm.runInContext(scriptMatch[1], context);

    assert(typeof context.calculateTotalTime === 'function', 'calculateTotalTime function missing in client JS');

    // Test time parsing and formatting variations
    assertEqual(context.calculateTotalTime("15 mins", "10 mins"), "⏱️ 25m");
    assertEqual(context.calculateTotalTime("20 min", "25 min"), "⏱️ 45m");
    assertEqual(context.calculateTotalTime("30 mins", "30 mins"), "⏱️ 1h");
    assertEqual(context.calculateTotalTime("45 mins", "45 mins"), "⏱️ 1h 30m");
    assertEqual(context.calculateTotalTime("1 hr", "15 mins"), "⏱️ 1h 15m");
    assertEqual(context.calculateTotalTime("10m", "20m"), "⏱️ 30m");
    assertEqual(context.calculateTotalTime("", "25 mins"), "⏱️ 25m");
  });

  test('JavaScript.html escapeJSString() safely escapes quotes and control characters', () => {
    const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');
    const scriptMatch = jsHtml.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
    const context = createMockBrowserContext();
    vm.runInContext(scriptMatch[1], context);

    assert(typeof context.escapeJSString === 'function', 'escapeJSString function missing in client JS');
    assertEqual(context.escapeJSString("Mom's Classic Shepherd's Pie"), "Mom\\'s Classic Shepherd\\'s Pie");
    assertEqual(context.escapeJSString('Chef "Special"'), 'Chef \\"Special\\"');
    assertEqual(context.escapeJSString(''), '');
  });
});

describe('6. Favicon & Welcome Page Navigation (MPA-6 & MPA-7)', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');

  test('MPA-6: Index.html includes dinner plate emoji favicon link tag', () => {
    assert(/<link[^>]*rel=["']icon["'][^>]*href=["']data:image\/svg\+xml,[^"']*🍽️[^"']*["']/i.test(indexHtml),
      'Favicon link tag with dinner plate emoji 🍽️ must be defined in Index.html head');
  });

  test('MPA-7: Brand header title links to welcome page', () => {
    assert(/class=["'][^"']*brand[^"']*["'][^>]*onclick=["']switchView\('welcome'\)["']/i.test(indexHtml),
      'Header brand element must have onclick="switchView(\'welcome\')" handler');
  });

  test('MPA-7: Welcome view is defined as active landing view with 4 guide cards', () => {
    assert(/id=["']welcome-view["'][^>]*class=["'][^"']*view\s+active[^"']*["']/i.test(indexHtml) ||
           /class=["'][^"']*view\s+active[^"']*["'][^>]*id=["']welcome-view["']/i.test(indexHtml),
      'welcome-view must be the default active view in Index.html');

    assert(indexHtml.includes('id="welcome-view"'), 'welcome-view must exist in Index.html');
    assert(indexHtml.includes('Getting Started'), 'Getting Started step card must exist');
    assert(indexHtml.includes('Setting Preferences'), 'Setting Preferences step card must exist');
    assert(indexHtml.includes('Generating Meal Plans'), 'Generating Meal Plans step card must exist');
    assert(indexHtml.includes('Reviewing Past Meals'), 'Reviewing Past Meals step card must exist');
  });

  test('MPA-7: Welcome cards navigate to respective views', () => {
    assert(indexHtml.includes("switchView('settings')"), 'Welcome view must link to settings view');
    assert(indexHtml.includes("switchView('preferences')"), 'Welcome view must link to preferences view');
    assert(indexHtml.includes("switchView('planner')"), 'Welcome view must link to planner view');
    assert(indexHtml.includes("switchView('history')"), 'Welcome view must link to history view');
  });
});

describe('7. Skip Welcome Preference & Matte Styling Experience', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');
  const stylesHtml = fs.readFileSync(path.join(ROOT_DIR, 'Styles.html'), 'utf8');
  const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');

  test('Index.html defines skip-welcome-checkbox inside welcome-hero panel', () => {
    assert(/welcome-hero[\s\S]*?id=["']skip-welcome-checkbox["']/i.test(indexHtml),
      'skip-welcome-checkbox must be located within the welcome-hero panel in Index.html');
    assert(/onchange=["']handleToggleSkipWelcome\(this\.checked\)["']/i.test(indexHtml),
      'skip-welcome-checkbox must trigger handleToggleSkipWelcome(this.checked)');
  });

  test('Styles.html eliminates all gradients and corner textures for a clean matte aesthetic', () => {
    assert(!/gradient/i.test(stylesHtml), 'Styles.html must not contain linear-gradient or radial-gradient');
    assert(!/\.welcome-hero::before/i.test(stylesHtml), 'welcome-hero corner texture pseudo-element must be removed');
  });

  test('JavaScript.html defines handleToggleSkipWelcome and synchronizes preference with backend and localStorage', () => {
    assert(jsHtml.includes('function handleToggleSkipWelcome'), 'handleToggleSkipWelcome function must exist in JavaScript.html');
    assert(jsHtml.includes('setSkipWelcomePreference'), 'JavaScript.html must call setSkipWelcomePreference on Google Apps Script');
  });
});

// 8. Recipe Ratings & Recipe Re-use Workflow (MPA-8)
describe('8. Recipe Ratings & Recipe Re-use Workflow (MPA-8)', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');
  const stylesHtml = fs.readFileSync(path.join(ROOT_DIR, 'Styles.html'), 'utf8');
  const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');

  test('Index.html defines History sub-navigation tabs, reuse banner, and planner reuse notice', () => {
    assert(indexHtml.includes('id="subtab-history-recent"'), 'Index.html must have subtab-history-recent');
    assert(indexHtml.includes('id="subtab-history-favorites"'), 'Index.html must have subtab-history-favorites');
    assert(indexHtml.includes('id="history-reuse-banner"'), 'Index.html must have history-reuse-banner');
    assert(indexHtml.includes('id="planner-reuse-notice"'), 'Index.html must have planner-reuse-notice');
  });

  test('Styles.html defines styles for sub-tabs, star ratings, and reuse banners', () => {
    assert(stylesHtml.includes('.history-subnav'), 'Styles.html must define .history-subnav');
    assert(stylesHtml.includes('.star-rating'), 'Styles.html must define .star-rating');
    assert(stylesHtml.includes('.star-btn'), 'Styles.html must define .star-btn');
    assert(stylesHtml.includes('.reuse-banner'), 'Styles.html must define .reuse-banner');
    assert(stylesHtml.includes('.planner-reuse-notice'), 'Styles.html must define .planner-reuse-notice');
  });

  test('JavaScript.html defines switchHistoryTab, toggleReuseRecipe, clearReusedRecipes, renderStarRating, and handleSetRating', () => {
    assert(jsHtml.includes('function switchHistoryTab'), 'switchHistoryTab missing in JavaScript.html');
    assert(jsHtml.includes('function toggleReuseRecipe'), 'toggleReuseRecipe missing in JavaScript.html');
    assert(jsHtml.includes('function clearReusedRecipes'), 'clearReusedRecipes missing in JavaScript.html');
    assert(jsHtml.includes('function renderStarRating'), 'renderStarRating missing in JavaScript.html');
    assert(jsHtml.includes('function handleSetRating'), 'handleSetRating missing in JavaScript.html');
  });

  test('Backend setRecipeRating() sets and persists 0-5 star ratings in DB', () => {
    const context = createMockGasContext();
    const res = context.setRecipeRating('Lemon Salmon', 5);
    assertEqual(res.success, true, 'setRecipeRating must return success: true');
    assertEqual(res.rating, 5, 'setRecipeRating must return rating: 5');

    const db = context.getMockDbState();
    assertEqual(db.recipeRatings['Lemon Salmon'].rating, 5, 'Rating must be persisted in db.recipeRatings');

    // Test clamping between 0 and 5
    const clampedHigh = context.setRecipeRating('Tacos', 10);
    assertEqual(clampedHigh.rating, 5, 'Rating > 5 should clamp to 5');
    const clampedLow = context.setRecipeRating('Tacos', -2);
    assertEqual(clampedLow.rating, 0, 'Rating < 0 should clamp to 0');
  });

  test('Backend getRecipeHistory() sorts History by scheduled date descending and Favorites by rating + date', () => {
    const mockFiles = [
      { name: "20260901 - Old Salmon", id: "salmon-doc", createdTime: 1000 },
      { name: "20260908 - Fresh Tacos", id: "tacos-doc", createdTime: 2000 },
      { name: "20260905 - Mid Chicken", id: "chicken-doc", createdTime: 1500 }
    ];

    const initialDb = {
      preferences: { dinersCount: 2, defaultMealTime: "06:00 PM" },
      mealPlan: null,
      recipeRatings: {
        "Old Salmon": { rating: 5 },
        "Mid Chicken": { rating: 4 },
        "Fresh Tacos": { rating: 0 }
      },
      recipeLibrary: {},
      lastUpdated: new Date().toISOString()
    };

    const context = createMockGasContext(initialDb, {}, {}, mockFiles);
    const result = context.getRecipeHistory();

    // Verify history sorted by scheduled date descending (2026-09-08, 2026-09-05, 2026-09-01)
    assertEqual(result.history.length, 3, 'History should contain all 3 recipes');
    assertEqual(result.history[0].name, 'Fresh Tacos', 'Most recent scheduled date (2026-09-08) should be first');
    assertEqual(result.history[1].name, 'Mid Chicken', 'Second scheduled date (2026-09-05) should be second');
    assertEqual(result.history[2].name, 'Old Salmon', 'Third scheduled date (2026-09-01) should be third');

    // Verify favorites filtered for rating > 0 and sorted by rating descending (5 stars -> 4 stars)
    assertEqual(result.favorites.length, 2, 'Favorites should only contain 2 recipes with rating > 0');
    assertEqual(result.favorites[0].name, 'Old Salmon', '5-star recipe should be top favorite');
    assertEqual(result.favorites[0].rating, 5, 'Old Salmon rating should be 5');
    assertEqual(result.favorites[1].name, 'Mid Chicken', '4-star recipe should be second favorite');
    assertEqual(result.favorites[1].rating, 4, 'Mid Chicken rating should be 4');
  });

  test('Backend generateMealPlanServer() supports complete and partial recipe reuse', () => {
    const initialDb = {
      preferences: { dinersCount: 4, defaultMealTime: "06:00 PM" },
      mealPlan: null,
      recipeRatings: {},
      recipeLibrary: {
        "Favorite Pasta": {
          name: "Favorite Pasta",
          description: "Garlic penne",
          prepTime: "10 mins",
          cookTime: "15 mins",
          ingredients: [{ name: "pasta", amount: 1, unit: "box" }],
          instructions: ["Boil and drain."],
          originalDiners: 2,
          docId: "pasta-id"
        }
      },
      lastUpdated: new Date().toISOString()
    };

    const userProps = { GEMINI_API_KEY: "mock-key" };
    const context = createMockGasContext(initialDb, userProps);

    // Test 1: Full reuse (reused count >= meal count) - Gemini bypass
    const resFull = context.generateMealPlanServer(1, "", ["Favorite Pasta"]);
    assertEqual(resFull.success, true, 'Full reuse should succeed');
    const plan1 = resFull.db.mealPlan;
    assertEqual(plan1.recipes.length, 1, 'Plan should contain 1 recipe');
    assertEqual(plan1.recipes[0].name, "Favorite Pasta", 'Recipe name should match reused recipe');
    // Ingredient scaled from 2 diners to 4 diners (1 * 4 / 2 = 2)
    assertEqual(plan1.recipes[0].ingredients[0].amount, 2, 'Ingredients should scale from 2 to 4 diners');

    // Test 2: Partial reuse (1 reused + 1 Gemini generated)
    const resPartial = context.generateMealPlanServer(2, "", ["Favorite Pasta"]);
    assertEqual(resPartial.success, true, 'Partial reuse should succeed');
    const plan2 = resPartial.db.mealPlan;
    assertEqual(plan2.recipes.length, 2, 'Plan should contain 2 recipes (1 reused + 1 generated)');
    assertEqual(plan2.recipes[0].name, "Favorite Pasta", 'First recipe should be reused');
    assertEqual(plan2.recipes[1].name, "Mock Recipe", 'Second recipe should be generated from Gemini');
  });

  test('Backend approveMealPlanServer() re-titles existing Google Doc and updates recipeLibrary', () => {
    const mockFiles = [
      { name: "20260901 - Classic Salmon", id: "salmon-doc-123", createdTime: 1000 }
    ];

    const initialDb = {
      preferences: { dinersCount: 2, defaultMealTime: "06:00 PM" },
      mealPlan: {
        recipes: [
          {
            name: "Classic Salmon",
            description: "Delicious salmon dish",
            prepTime: "10 mins",
            cookTime: "20 mins",
            ingredients: [{ name: "Salmon", amount: 2, unit: "fillets" }],
            instructions: ["Roast salmon."],
            docId: "salmon-doc-123"
          }
        ],
        approved: false,
        generatedAt: new Date().toISOString()
      },
      recipeRatings: {},
      recipeLibrary: {},
      lastUpdated: new Date().toISOString()
    };

    const context = createMockGasContext(initialDb, {}, {}, mockFiles);
    const approvedList = [{ name: "Classic Salmon", date: "2026-09-14" }];

    const res = context.approveMealPlanServer(approvedList);
    assertEqual(res.success, true, 'approveMealPlanServer should succeed');
    assertEqual(mockFiles[0].name, "20260914 - Classic Salmon", 'Existing file must be renamed with the new date prefix');

    const db = context.getMockDbState();
    assertEqual(db.recipeLibrary["Classic Salmon"].lastScheduledDate, "2026-09-14", 'lastScheduledDate must be saved in recipeLibrary');
    assertEqual(db.mealPlan.approved, true, 'Plan approved status must be true');
  });
});

// ---------------------------------------------------------
// Summary Readout & Exit Code Handling
// ---------------------------------------------------------
console.log(`\n========================================`);
if (failedTests === 0) {
  console.log(`${COLORS.bgGreen}${COLORS.bright}  ALL ${totalTests} TESTS PASSED  ${COLORS.reset}\n`);
  process.exit(0);
} else {
  console.log(`${COLORS.bgRed}${COLORS.bright}  ${failedTests} OF ${totalTests} TESTS FAILED  ${COLORS.reset}\n`);
  console.log(`${COLORS.red}${COLORS.bright}Failure Summary:${COLORS.reset}`);
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}) ${COLORS.bright}${f.name}${COLORS.reset}`);
    console.log(`     ${COLORS.dim}${f.error.stack || f.error.message}${COLORS.reset}`);
  });
  console.log('');
  process.exit(1);
}
