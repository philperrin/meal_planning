/**
 * Automated Test Suite for Meal Planning Assistant
 *
 * Consolidated Test Suite:
 * 1. File System, Configuration & Syntax Integrity
 * 2. Frontend DOM & Template Structure (Index.html)
 * 3. Responsive Layout & Matte Styling (Styles.html)
 * 4. Client-Side Utilities & Script Handlers (JavaScript.html)
 * 5. Backend App Data Initialization & Schema Migrations
 * 6. Hybrid API Key Management & Resolution Hierarchy
 * 7. Meal Planning Preferences & Helper Logic
 * 8. Recipe Rating & History Management (MPA-8)
 * 9. Meal Plan Generation with Recipe Reuse (MPA-8)
 * 10. Meal Plan Approval & Document Lifecycle (MPA-8)
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
      defaultMealTime: "06:00 PM",
      skipWelcomePage: false
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
  return vm.createContext(sandbox);
}

// ---------------------------------------------------------
// RUN CONSOLIDATED TEST SUITES
// ---------------------------------------------------------

console.log(`\n${COLORS.bright}========================================`);
console.log(`🧪 Running Meal Planning App Test Suite`);
console.log(`========================================${COLORS.reset}`);

// 1. Static, File System & Syntax Integrity
describe('1. File System, Configuration & Syntax Integrity', () => {
  test('Project files, JSON configs, and JavaScript code pass integrity and syntax validation', () => {
    // 1. Check required project files exist
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

    // 2. Validate JSON configurations
    ['appsscript.json', '.clasp.json', 'package.json'].forEach(file => {
      const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
      try {
        JSON.parse(content);
      } catch (e) {
        throw new Error(`JSON syntax error in ${file}: ${e.message}`);
      }
    });

    // 3. Validate JS syntax of Code.gs and ship.js
    const codeGs = fs.readFileSync(path.join(ROOT_DIR, 'Code.gs'), 'utf8');
    new vm.Script(codeGs, { filename: 'Code.gs' });

    const shipJs = fs.readFileSync(path.join(ROOT_DIR, 'ship.js'), 'utf8');
    new vm.Script(shipJs, { filename: 'ship.js' });

    // 4. Validate inline JS script syntax inside JavaScript.html
    const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');
    const scriptMatch = jsHtml.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
    assert(scriptMatch && scriptMatch[1], 'No <script> tag found in JavaScript.html');
    new vm.Script(scriptMatch[1], { filename: 'JavaScript.html' });
  });
});

// 2. Frontend DOM & Template Structure
describe('2. Frontend DOM & Template Structure (Index.html)', () => {
  test('Index.html defines all required elements, navigation tabs, views, favicon, and reuse banners', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'Index.html'), 'utf8');

    // 1. Favicon link check
    assert(/<link[^>]*rel=["']icon["'][^>]*href=["']data:image\/svg\+xml,[^"']*🍽️[^"']*["']/i.test(indexHtml),
      'Favicon link tag with dinner plate emoji 🍽️ must be defined in Index.html head');

    // 2. Required element IDs
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
      'bottom-nav',
      'welcome-view',
      'subtab-history-recent',
      'subtab-history-favorites',
      'history-reuse-banner',
      'planner-reuse-notice'
    ];
    requiredIds.forEach(id => {
      const pattern = new RegExp(`id=["']${id}["']`, 'i');
      assert(pattern.test(indexHtml), `Index.html is missing element with id="${id}"`);
    });

    // 3. Desktop and mobile navigation with all 4 primary views
    assert(/<nav\s+class=["'][^"']*nav-desktop/i.test(indexHtml), 'Missing desktop nav container in Index.html');
    assert(/<nav\s+class=["'][^"']*bottom-nav/i.test(indexHtml), 'Missing sticky bottom-nav in Index.html');
    ['planner', 'history', 'preferences', 'settings'].forEach(view => {
      const count = (indexHtml.match(new RegExp(`data-view=["']${view}["']`, 'g')) || []).length;
      assert(count >= 2, `Expected at least 2 nav buttons (desktop + mobile) for view: ${view}`);
    });

    // 4. Welcome landing view & guide cards
    assert(/id=["']welcome-view["'][^>]*class=["'][^"']*view\s+active[^"']*["']/i.test(indexHtml) ||
           /class=["'][^"']*view\s+active[^"']*["'][^>]*id=["']welcome-view["']/i.test(indexHtml),
      'welcome-view must be the default active view in Index.html');
    ['Getting Started', 'Setting Preferences', 'Generating Meal Plans', 'Reviewing Past Meals'].forEach(card => {
      assert(indexHtml.includes(card), `Welcome card "${card}" must exist in Index.html`);
    });
    ['settings', 'preferences', 'planner', 'history'].forEach(target => {
      assert(indexHtml.includes(`switchView('${target}')`), `Welcome view must link to '${target}' view`);
    });

    // 5. Header brand click handler & skip-welcome-checkbox
    assert(/class=["'][^"']*brand[^"']*["'][^>]*onclick=["']switchView\('welcome'\)["']/i.test(indexHtml),
      'Header brand element must have onclick="switchView(\'welcome\')" handler');
    assert(/welcome-hero[\s\S]*?id=["']skip-welcome-checkbox["']/i.test(indexHtml),
      'skip-welcome-checkbox must be located within the welcome-hero panel in Index.html');
    assert(/onchange=["']handleToggleSkipWelcome\(this\.checked\)["']/i.test(indexHtml),
      'skip-welcome-checkbox must trigger handleToggleSkipWelcome(this.checked)');
  });
});

// 3. Responsive Layout & Matte Styling
describe('3. Responsive Layout & Matte Styling (Styles.html)', () => {
  test('Styles.html enforces responsive rules (<768px), touch minimums, safe-area insets, and matte aesthetics', () => {
    const stylesHtml = fs.readFileSync(path.join(ROOT_DIR, 'Styles.html'), 'utf8');

    // 1. Mobile media query (<768px) and navigation positioning
    assert(/@media\s*\(\s*max-width:\s*768px\s*\)/i.test(stylesHtml), 'Styles.html missing @media (max-width: 768px) query');
    assert(/\.bottom-nav\s*\{[^}]*position:\s*fixed/i.test(stylesHtml), 'Styles.html missing fixed positioning for .bottom-nav');
    assert(/\.nav-desktop\s*\{[^}]*display:\s*none/i.test(stylesHtml), 'Styles.html must hide .nav-desktop on mobile');

    // 2. Accessibility touch targets and safe area insets
    assert(/recipe-checkbox-hitbox[\s\S]*?min-width:\s*44px/i.test(stylesHtml), 'Recipe checkbox hitbox missing min-width: 44px');
    assert(/recipe-checkbox-hitbox[\s\S]*?min-height:\s*44px/i.test(stylesHtml), 'Recipe checkbox hitbox missing min-height: 44px');
    assert(/safe-area-inset-bottom/i.test(stylesHtml), 'Styles.html should utilize env(safe-area-inset-bottom) for mobile clearance');

    // 3. Clean matte aesthetic rules
    assert(!/gradient/i.test(stylesHtml), 'Styles.html must not contain linear-gradient or radial-gradient');
    assert(!/\.welcome-hero::before/i.test(stylesHtml), 'welcome-hero corner texture pseudo-element must be removed');

    // 4. Sub-navigation, star ratings, and reuse banners
    assert(stylesHtml.includes('.history-subnav'), 'Styles.html must define .history-subnav');
    assert(stylesHtml.includes('.star-rating'), 'Styles.html must define .star-rating');
    assert(stylesHtml.includes('.star-btn'), 'Styles.html must define .star-btn');
    assert(stylesHtml.includes('.reuse-banner'), 'Styles.html must define .reuse-banner');
    assert(stylesHtml.includes('.planner-reuse-notice'), 'Styles.html must define .planner-reuse-notice');
  });
});

// 4. Client-Side Utilities & Script Handlers
describe('4. Client-Side Utilities & Script Handlers (JavaScript.html)', () => {
  test('JavaScript.html defines correct time formatters, string escapers, cuisines, and client event handlers', () => {
    const jsHtml = fs.readFileSync(path.join(ROOT_DIR, 'JavaScript.html'), 'utf8');
    const scriptMatch = jsHtml.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
    assert(scriptMatch && scriptMatch[1], 'Script tag missing in JavaScript.html');

    const context = createMockBrowserContext();
    vm.runInContext(scriptMatch[1], context);

    // 1. calculateTotalTime() formatting
    assert(typeof context.calculateTotalTime === 'function', 'calculateTotalTime function missing in client JS');
    assertEqual(context.calculateTotalTime("15 mins", "10 mins"), "⏱️ 25m");
    assertEqual(context.calculateTotalTime("20 min", "25 min"), "⏱️ 45m");
    assertEqual(context.calculateTotalTime("30 mins", "30 mins"), "⏱️ 1h");
    assertEqual(context.calculateTotalTime("45 mins", "45 mins"), "⏱️ 1h 30m");
    assertEqual(context.calculateTotalTime("1 hr", "15 mins"), "⏱️ 1h 15m");
    assertEqual(context.calculateTotalTime("10m", "20m"), "⏱️ 30m");
    assertEqual(context.calculateTotalTime("", "25 mins"), "⏱️ 25m");

    // 2. escapeJSString() character escaping
    assert(typeof context.escapeJSString === 'function', 'escapeJSString function missing in client JS');
    assertEqual(context.escapeJSString("Mom's Classic Shepherd's Pie"), "Mom\\'s Classic Shepherd\\'s Pie");
    assertEqual(context.escapeJSString('Chef "Special"'), 'Chef \\"Special\\"');
    assertEqual(context.escapeJSString(''), '');

    // 3. Cuisines catalog
    const cuisineMatches = jsHtml.match(/name:\s*["']([^"']+)["']/g);
    assert(cuisineMatches && cuisineMatches.length >= 12, 'CUISINES array should define at least 12 cuisines');

    // 4. Core handler functions
    const requiredClientFunctions = [
      'handleToggleSkipWelcome',
      'switchHistoryTab',
      'toggleReuseRecipe',
      'clearReusedRecipes',
      'renderStarRating',
      'handleSetRating'
    ];
    requiredClientFunctions.forEach(fnName => {
      assert(jsHtml.includes(`function ${fnName}`), `${fnName} function missing in JavaScript.html`);
    });
  });
});

// 5. Backend App Data Initialization & Schema Migrations
describe('5. Backend App Data Initialization & Schema Migrations', () => {
  test('loadAppData() initializes database, provides API key status, and migrates legacy schemas', () => {
    // 1. Normal initialization
    const ctx = createMockGasContext();
    const res = ctx.loadAppData();
    assert(res !== undefined, 'loadAppData returned nothing');
    assert(res.db !== undefined, 'loadAppData missing db object');
    assert(res.apiKeyStatus !== undefined, 'loadAppData missing apiKeyStatus');

    // 2. Legacy schema migration (restrictions -> dietaryPreferences)
    const legacyDb = {
      preferences: {
        restrictions: "No gluten."
      }
    };
    const legacyCtx = createMockGasContext(legacyDb);
    const data = legacyCtx.loadAppData();
    assertEqual(data.db.preferences.dietaryPreferences, "No gluten.");
    assertEqual(data.db.preferences.restrictions, undefined);
    assertEqual(data.db.preferences.dinersCount, 2);
    assertEqual(data.db.preferences.defaultMealTime, "06:00 PM");
    assertEqual(data.db.preferences.skipWelcomePage, false);
    assertDeepEqual(data.db.preferences.cuisinePreferences, {});
  });
});

// 6. Hybrid API Key Management & Resolution Hierarchy
describe('6. Hybrid API Key Management & Resolution Hierarchy', () => {
  test('API key resolution correctly traverses None -> Shared -> Personal, supporting save and delete', () => {
    // 1. No keys configured
    const noKeyCtx = createMockGasContext(null, {}, {});
    const noKeyInfo = noKeyCtx.getEffectiveApiKey();
    assertEqual(noKeyInfo.keyType, 'none');
    assertEqual(noKeyInfo.key, null);
    const noKeyAppData = noKeyCtx.loadAppData();
    assertEqual(noKeyAppData.hasApiKey, false);
    assertEqual(noKeyAppData.apiKeyStatus.activeKeyType, 'none');

    // 2. Shared starter key present in Script Properties
    const sharedCtx = createMockGasContext(null, {}, { SHARED_GEMINI_API_KEY: 'shared_key_abc123' });
    const sharedKeyInfo = sharedCtx.getEffectiveApiKey();
    assertEqual(sharedKeyInfo.keyType, 'shared');
    assertEqual(sharedKeyInfo.key, 'shared_key_abc123');
    const sharedAppData = sharedCtx.loadAppData();
    assertEqual(sharedAppData.hasApiKey, true);
    assertEqual(sharedAppData.apiKeyStatus.activeKeyType, 'shared');
    assertEqual(sharedAppData.apiKeyStatus.hasPersonalKey, false);
    assertEqual(sharedAppData.apiKeyStatus.hasSharedKey, true);

    // 3. Personal key overrides shared key
    const overrideCtx = createMockGasContext(
      null,
      { GEMINI_API_KEY: 'personal_key_xyz789' },
      { SHARED_GEMINI_API_KEY: 'shared_key_abc123' }
    );
    const overrideKeyInfo = overrideCtx.getEffectiveApiKey();
    assertEqual(overrideKeyInfo.keyType, 'personal');
    assertEqual(overrideKeyInfo.key, 'personal_key_xyz789');
    const overrideAppData = overrideCtx.loadAppData();
    assertEqual(overrideAppData.apiKeyStatus.activeKeyType, 'personal');
    assertEqual(overrideAppData.apiKeyStatus.hasPersonalKey, true);
    assertEqual(overrideAppData.apiKeyStatus.hasSharedKey, true);

    // 4. saveApiKey() updates personal key
    const saveRes = sharedCtx.saveApiKey('new_personal_key');
    assertEqual(saveRes.success, true);
    assertEqual(saveRes.apiKeyStatus.hasPersonalKey, true);
    assertEqual(saveRes.apiKeyStatus.activeKeyType, 'personal');
    assertEqual(sharedCtx.getEffectiveApiKey().key, 'new_personal_key');

    // 5. deleteApiKey() reverts to shared key
    const deleteRes = overrideCtx.deleteApiKey();
    assertEqual(deleteRes.success, true);
    assertEqual(deleteRes.apiKeyStatus.hasPersonalKey, false);
    assertEqual(deleteRes.apiKeyStatus.activeKeyType, 'shared');
    assertEqual(overrideCtx.getEffectiveApiKey().key, 'shared_key_abc123');
  });
});

// 7. Meal Planning Preferences & Helper Logic
describe('7. Meal Planning Preferences & Helper Logic', () => {
  test('Backend correctly parses times, saves preferences, and aggregates multi-unit shopping lists', () => {
    const ctx = createMockGasContext();

    // 1. parseTime() formats
    assertDeepEqual(ctx.parseTime("06:00 PM"), { hours: 18, minutes: 0 });
    assertDeepEqual(ctx.parseTime("6:30 PM"), { hours: 18, minutes: 30 });
    assertDeepEqual(ctx.parseTime("08:15 AM"), { hours: 8, minutes: 15 });
    assertDeepEqual(ctx.parseTime("12:00 PM"), { hours: 12, minutes: 0 });
    assertDeepEqual(ctx.parseTime("12:30 AM"), { hours: 0, minutes: 30 });
    assertDeepEqual(ctx.parseTime("19:45"), { hours: 19, minutes: 45 });
    assertDeepEqual(ctx.parseTime(""), { hours: 18, minutes: 0 });
    assertDeepEqual(ctx.parseTime(null), { hours: 18, minutes: 0 });

    // 2. savePreferences()
    const newPrefs = {
      allergies: "Peanuts",
      dietaryPreferences: "Keto",
      cuisinePreferences: { Italian: "prefer", Mexican: "avoid" },
      dinersCount: "4",
      defaultMealTime: "07:30 PM",
      skipWelcomePage: true
    };
    const prefRes = ctx.savePreferences(newPrefs);
    assertEqual(prefRes.success, true);
    assertEqual(prefRes.db.preferences.allergies, "Peanuts");
    assertEqual(prefRes.db.preferences.dietaryPreferences, "Keto");
    assertEqual(prefRes.db.preferences.dinersCount, 4);
    assertEqual(prefRes.db.preferences.defaultMealTime, "07:30 PM");
    assertEqual(prefRes.db.preferences.skipWelcomePage, true);
    assertEqual(prefRes.db.preferences.cuisinePreferences.Italian, "prefer");
    assertEqual(prefRes.db.preferences.cuisinePreferences.Mexican, "avoid");

    // 3. setSkipWelcomePreference()
    const skipTrue = ctx.setSkipWelcomePreference(true);
    assertEqual(skipTrue.skipWelcomePage, true);
    assertEqual(ctx.loadAppData().db.preferences.skipWelcomePage, true);
    const skipFalse = ctx.setSkipWelcomePreference(false);
    assertEqual(skipFalse.skipWelcomePage, false);

    // 4. consolidateShoppingList()
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
    assertEqual(consolidated[0].name, 'chicken breast');
    assertEqual(consolidated[0].amounts[0].amount, 1);
    assertEqual(consolidated[0].amounts[0].unit, 'lb');

    assertEqual(consolidated[1].name, 'garlic');
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
});

// 8. Recipe Rating & History Management (MPA-8)
describe('8. Recipe Rating & History Management (MPA-8)', () => {
  test('Backend persists star ratings (with 0-5 clamping) and sorts history/favorites accurately', () => {
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

    // 1. Rating persistence and clamping
    const res = context.setRecipeRating('Lemon Salmon', 5);
    assertEqual(res.success, true);
    assertEqual(res.rating, 5);
    assertEqual(context.getMockDbState().recipeRatings['Lemon Salmon'].rating, 5);

    assertEqual(context.setRecipeRating('Tacos', 10).rating, 5, 'Rating > 5 should clamp to 5');
    assertEqual(context.setRecipeRating('Tacos', -2).rating, 0, 'Rating < 0 should clamp to 0');

    // 2. getRecipeHistory() sorting and favorite filtering
    const result = context.getRecipeHistory();
    assertEqual(result.history.length, 3, 'History should contain all 3 recipes');
    assertEqual(result.history[0].name, 'Fresh Tacos', 'Most recent scheduled date (2026-09-08) should be first');
    assertEqual(result.history[1].name, 'Mid Chicken', 'Second scheduled date (2026-09-05) should be second');
    assertEqual(result.history[2].name, 'Old Salmon', 'Third scheduled date (2026-09-01) should be third');

    assertEqual(result.favorites.length, 2, 'Favorites should only contain recipes with rating > 0');
    assertEqual(result.favorites[0].name, 'Old Salmon', '5-star recipe should be top favorite');
    assertEqual(result.favorites[0].rating, 5);
    assertEqual(result.favorites[1].name, 'Mid Chicken', '4-star recipe should be second favorite');
    assertEqual(result.favorites[1].rating, 4);
  });
});

// 9. Meal Plan Generation with Recipe Reuse (MPA-8)
describe('9. Meal Plan Generation with Recipe Reuse (MPA-8)', () => {
  test('generateMealPlanServer() handles full reuse bypass and partial reuse generation with diner scaling', () => {
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

    // 1. Full reuse (reused count >= meal count) - Gemini bypass
    const resFull = context.generateMealPlanServer(1, "", ["Favorite Pasta"]);
    assertEqual(resFull.success, true, 'Full reuse should succeed');
    const plan1 = resFull.db.mealPlan;
    assertEqual(plan1.recipes.length, 1, 'Plan should contain 1 recipe');
    assertEqual(plan1.recipes[0].name, "Favorite Pasta");
    // Scaled from 2 diners to 4 diners (1 * 4 / 2 = 2)
    assertEqual(plan1.recipes[0].ingredients[0].amount, 2, 'Ingredients should scale from 2 to 4 diners');

    // 2. Partial reuse (1 reused + 1 Gemini generated)
    const resPartial = context.generateMealPlanServer(2, "", ["Favorite Pasta"]);
    assertEqual(resPartial.success, true, 'Partial reuse should succeed');
    const plan2 = resPartial.db.mealPlan;
    assertEqual(plan2.recipes.length, 2, 'Plan should contain 2 recipes');
    assertEqual(plan2.recipes[0].name, "Favorite Pasta", 'First recipe should be reused');
    assertEqual(plan2.recipes[1].name, "Mock Recipe", 'Second recipe should be generated from Gemini');
  });
});

// 10. Meal Plan Approval & Document Lifecycle (MPA-8)
describe('10. Meal Plan Approval & Document Lifecycle (MPA-8)', () => {
  test('approveMealPlanServer() re-titles existing Google Docs and synchronizes recipeLibrary metadata', () => {
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
