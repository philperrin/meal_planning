#!/usr/bin/env node
/**
 * Prompt Evaluation Test Harness Runner
 * 
 * Usage:
 *   node test/prompt-eval/runner.js [--mock | --live]
 */

const fs = require('fs');
const path = require('path');
const Tier1PromptValidator = require('./tier1-validator');

const EVAL_DIR = __dirname;
const SCENARIOS_FILE = path.join(EVAL_DIR, 'scenarios.json');
const ALLERGEN_FILE = path.join(EVAL_DIR, 'allergen-dictionary.json');
const SCHEMA_FILE = path.join(EVAL_DIR, 'fixtures', 'schema-definition.json');
const MOCK_RESPONSES_FILE = path.join(EVAL_DIR, 'fixtures', 'mock-model-responses.json');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

function runPromptEvaluation() {
  const isLive = process.argv.includes('--live');
  
  console.log(`\n${COLORS.bright}${COLORS.cyan}======================================================${COLORS.reset}`);
  console.log(`${COLORS.bright}📊 Tier 1 Deterministic Prompt Evaluation Suite${COLORS.reset}`);
  console.log(`Mode: ${isLive ? `${COLORS.yellow}LIVE GEMINI API${COLORS.reset}` : `${COLORS.green}OFFLINE DETERMINISTIC MOCKS${COLORS.reset}`}`);
  console.log(`${COLORS.bright}${COLORS.cyan}======================================================${COLORS.reset}\n`);

  if (!fs.existsSync(SCENARIOS_FILE)) {
    console.error(`${COLORS.red}Missing scenarios file at ${SCENARIOS_FILE}${COLORS.reset}`);
    process.exit(1);
  }

  const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_FILE, 'utf8'));
  const allergenDict = JSON.parse(fs.readFileSync(ALLERGEN_FILE, 'utf8'));
  const schemaDef = fs.existsSync(SCHEMA_FILE) ? JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8')) : null;
  const mockResponses = JSON.parse(fs.readFileSync(MOCK_RESPONSES_FILE, 'utf8'));

  const validator = new Tier1PromptValidator(allergenDict, schemaDef);

  let totalScenarios = scenarios.length;
  let passedScenarios = 0;
  let failedScenarios = 0;
  let totalRecipes = 0;
  let totalViolations = 0;

  let totalSchemaCompliant = 0;
  let totalAllergenClean = 0;
  let totalAvoidedCuisineClean = 0;
  let totalQuickCompliant = 0;
  let quickTaggedCount = 0;
  let pantryScenariosCount = 0;
  let pantryItemsMatchedCount = 0;
  let totalPantryItemsExpected = 0;

  const suiteGroups = {};

  scenarios.forEach(scenario => {
    const category = scenario.category || 'Other';
    if (!suiteGroups[category]) {
      suiteGroups[category] = { total: 0, passed: 0, failed: 0, reports: [] };
    }
    suiteGroups[category].total++;

    const payload = mockResponses[scenario.id];
    if (!payload) {
      suiteGroups[category].failed++;
      failedScenarios++;
      console.log(`  ${COLORS.red}✖ [${scenario.id}] ${scenario.title} - Missing response fixture${COLORS.reset}`);
      return;
    }

    const report = validator.evaluatePlan(payload, scenario);
    suiteGroups[category].reports.push(report);

    totalRecipes += report.totalRecipes;
    totalSchemaCompliant += report.metrics.schemaValidCount;
    totalAllergenClean += report.metrics.allergenCleanCount;
    totalAvoidedCuisineClean += report.metrics.avoidedCuisineCleanCount;

    if (scenario.params.tags && scenario.params.tags.includes('quick')) {
      quickTaggedCount += report.totalRecipes;
      totalQuickCompliant += report.metrics.quickTimeCompliantCount;
    }

    if (scenario.params.pantryIngredients && scenario.params.pantryIngredients.length > 0) {
      pantryScenariosCount++;
      totalPantryItemsExpected += scenario.params.pantryIngredients.length;
      pantryItemsMatchedCount += (report.metrics.pantryItemsDetected || []).length;
    }

    if (report.pass) {
      passedScenarios++;
      suiteGroups[category].passed++;
    } else {
      failedScenarios++;
      suiteGroups[category].failed++;
      totalViolations += report.violations.length;
    }
  });

  // Print Category Summary
  Object.keys(suiteGroups).forEach(cat => {
    const g = suiteGroups[cat];
    const status = g.failed === 0 
      ? `${COLORS.green}[PASS]${COLORS.reset}` 
      : `${COLORS.red}[FAIL: ${g.failed}/${g.total}]${COLORS.reset}`;
    const dots = '.'.repeat(Math.max(2, 45 - cat.length - String(g.total).length));
    console.log(`● ${COLORS.bright}${cat} Suite${COLORS.reset} (${g.total} Cases) ${dots} ${status}`);
    
    if (g.failed > 0) {
      g.reports.filter(r => !r.pass).forEach(r => {
        console.log(`    ${COLORS.red}✖ [${r.scenarioId}] ${r.title}:${COLORS.reset}`);
        r.violations.forEach(v => console.log(`      ↳ ${COLORS.dim}${v}${COLORS.reset}`));
      });
    }
  });

  // Calculate Metrics
  const schemaPct = totalRecipes > 0 ? ((totalSchemaCompliant / totalRecipes) * 100).toFixed(1) : '100.0';
  const allergenViolationRate = totalRecipes > 0 ? (((totalRecipes - totalAllergenClean) / totalRecipes) * 100).toFixed(1) : '0.0';
  const cuisineViolationRate = totalRecipes > 0 ? (((totalRecipes - totalAvoidedCuisineClean) / totalRecipes) * 100).toFixed(1) : '0.0';
  const quickPct = quickTaggedCount > 0 ? ((totalQuickCompliant / quickTaggedCount) * 100).toFixed(1) : '100.0';
  const pantryScore = totalPantryItemsExpected > 0 ? ((pantryItemsMatchedCount / totalPantryItemsExpected) * 100).toFixed(1) : '100.0';

  console.log(`\n------------------------------------------------------`);
  console.log(`${COLORS.bright}Summary Evaluation Metrics:${COLORS.reset}`);
  console.log(`  ${schemaPct === '100.0' ? COLORS.green + '✔' : COLORS.red + '✖'}${COLORS.reset} JSON Schema Conformance:   ${schemaPct}% (Target: 100%)`);
  console.log(`  ${allergenViolationRate === '0.0' ? COLORS.green + '✔' : COLORS.red + '✖'}${COLORS.reset} Allergen Violation Rate:     ${allergenViolationRate}% (Target: 0.0%) ${COLORS.yellow}[P0 GATE]${COLORS.reset}`);
  console.log(`  ${cuisineViolationRate === '0.0' ? COLORS.green + '✔' : COLORS.red + '✖'}${COLORS.reset} Avoided Cuisine Violation:   ${cuisineViolationRate}% (Target: 0.0%) ${COLORS.yellow}[P0 GATE]${COLORS.reset}`);
  console.log(`  ${parseFloat(quickPct) >= 95 ? COLORS.green + '✔' : COLORS.red + '✖'}${COLORS.reset} Quick Tag Time Compliance: ${quickPct}% (Target: ≥95%)`);
  console.log(`  ${parseFloat(pantryScore) >= 80 ? COLORS.green + '✔' : COLORS.red + '✖'}${COLORS.reset} Pantry Utilization Score:   ${pantryScore}% (Target: ≥85%)`);

  console.log(`\n======================================================`);
  if (failedScenarios === 0) {
    console.log(`${COLORS.bgGreen}${COLORS.bright}  ALL ${totalScenarios} BENCHMARK SCENARIOS PASSED TIER 1 EVALUATION  ${COLORS.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${COLORS.bgRed}${COLORS.bright}  ${failedScenarios} OF ${totalScenarios} BENCHMARK SCENARIOS FAILED  ${COLORS.reset}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  runPromptEvaluation();
}

module.exports = { runPromptEvaluation };
