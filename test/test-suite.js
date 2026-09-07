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
function createMockGasContext(initialDb, initialUserProps = {}, initialScriptProps = {}) {
  let dbState = JSON.parse(JSON.stringify(initialDb || {
    preferences: {
      allergies: "No eggs.",
      dietaryPreferences: "High protein.",
      cuisinePreferences: {},
      dinersCount: 2,
      defaultMealTime: "06:00 PM"
    },
    mealPlan: null,
    lastUpdated: new Date().toISOString()
  }));

  const userPropsStore = { ...initialUserProps };
  const scriptPropsStore = { ...initialScriptProps };

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
          getFiles: () => ({ hasNext: () => false, next: () => null }),
          getFoldersByName: () => ({ hasNext: () => true, next: () => ({ createFolder: () => ({}) }) }),
          createFolder: () => ({})
        })
      }),
      createFolder: () => ({
        getFoldersByName: () => ({ hasNext: () => false }),
        createFolder: () => ({})
      }),
      getFileById: () => ({
        moveTo: () => {}
      })
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
      defaultMealTime: "07:30 PM"
    };

    const res = ctx.savePreferences(newPrefs);
    assertEqual(res.success, true);
    assertEqual(res.db.preferences.allergies, "Peanuts");
    assertEqual(res.db.preferences.dietaryPreferences, "Keto");
    assertEqual(res.db.preferences.dinersCount, 4);
    assertEqual(res.db.preferences.defaultMealTime, "07:30 PM");
    assertEqual(res.db.preferences.cuisinePreferences.Italian, "prefer");
    assertEqual(res.db.preferences.cuisinePreferences.Mexican, "avoid");
  });

  test('Database schema migrations migrate legacy "restrictions" to "dietaryPreferences"', () => {
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
