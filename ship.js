/**
 * Post-Commit Deployment Automation Script
 *
 * Automates:
 * 1. Pushing commits to GitHub (git push)
 * 2. Pushing project files to Google Apps Script (npm run push / clasp push)
 * 3. Updating the existing Apps Script deployment with a new version (clasp deploy -i <id>)
 *
 * Usage:
 *   npm run ship
 *   npm run ship -- "Custom release description"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m'
};

function logStep(stepNum, totalSteps, title) {
  console.log(`\n${COLORS.cyan}${COLORS.bright}[${stepNum}/${totalSteps}] ${title}${COLORS.reset}`);
}

function runCommand(commandStr) {
  console.log(`${COLORS.dim}> ${commandStr}${COLORS.reset}`);
  execSync(commandStr, { stdio: 'inherit' });
}

function getCommitDescription() {
  // 1. Check if an explicit description was passed via CLI arguments
  const cliArgs = process.argv.slice(2).join(' ').trim();
  if (cliArgs) {
    return cliArgs.replace(/["\r\n]+/g, ' ');
  }

  // 2. Fall back to the latest git commit subject/message
  try {
    const gitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
    if (gitMessage) {
      // Use the first line of the commit message for the deployment description
      return gitMessage.split('\n')[0].replace(/["\r\n]+/g, ' ').trim();
    }
  } catch (e) {
    // If git log fails, proceed to default timestamp
  }

  // 3. Fallback to ISO timestamp
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);
  return `Release ${dateStr}`;
}

function getTargetDeploymentId() {
  // 1. Check environment variable
  if (process.env.CLASP_DEPLOYMENT_ID) {
    return process.env.CLASP_DEPLOYMENT_ID.trim();
  }

  // 2. Check .clasp.json for "deploymentId" property
  try {
    const claspJsonPath = path.join(__dirname, '.clasp.json');
    if (fs.existsSync(claspJsonPath)) {
      const claspConfig = JSON.parse(fs.readFileSync(claspJsonPath, 'utf8'));
      if (claspConfig.deploymentId) {
        return claspConfig.deploymentId.trim();
      }
    }
  } catch (e) {
    // Ignore error and fall through
  }

  // 3. Auto-discover active versioned deployment via clasp deployments
  try {
    const output = execSync('npx clasp deployments', { encoding: 'utf8' });
    // Look for lines matching: - <deploymentId> @<version> (excluding @HEAD)
    const matches = [...output.matchAll(/^-\s+([A-Za-z0-9_-]+)\s+@(\d+)/gm)];
    if (matches && matches.length > 0) {
      // Pick the first matching deployment ID
      return matches[0][1];
    }
  } catch (e) {
    console.log(`${COLORS.yellow}⚠ Could not auto-detect deployment ID from clasp deployments.${COLORS.reset}`);
  }

  return null;
}

function checkGitWorkingTree() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      console.log(`${COLORS.yellow}⚠ Warning: You have uncommitted changes in your working tree.${COLORS.reset}`);
      console.log(`${COLORS.dim}Only committed changes will be included in git push.${COLORS.reset}\n`);
    }
  } catch (e) {
    // Git status check non-critical
  }
}

function main() {
  console.log(`${COLORS.bright}🚀 Starting Post-Commit Deployment Pipeline${COLORS.reset}`);

  checkGitWorkingTree();

  const description = getCommitDescription();
  console.log(`${COLORS.bright}Description:${COLORS.reset} ${COLORS.green}"${description}"${COLORS.reset}`);

  const TOTAL_STEPS = 3;

  try {
    // Step 1: Git Push
    logStep(1, TOTAL_STEPS, 'Pushing commits to remote repository (GitHub)...');
    runCommand('git push');

    // Step 2: Push to Google Apps Script
    logStep(2, TOTAL_STEPS, 'Pushing code to Google Apps Script (clasp push)...');
    runCommand('npx clasp push -f');

    // Step 3: Deploy new version to Google Apps Script
    logStep(3, TOTAL_STEPS, 'Updating deployment in Google Apps Script (clasp deploy)...');
    
    const deploymentId = getTargetDeploymentId();
    if (deploymentId) {
      console.log(`${COLORS.dim}Targeting deployment ID: ${deploymentId}${COLORS.reset}`);
      runCommand(`npx clasp deploy -i "${deploymentId}" -d "${description}"`);
    } else {
      console.log(`${COLORS.yellow}No existing deployment ID found. Creating a new deployment...${COLORS.reset}`);
      runCommand(`npx clasp deploy -d "${description}"`);
    }

    console.log(`\n${COLORS.green}${COLORS.bright}✔ Deployment pipeline completed successfully!${COLORS.reset}\n`);
  } catch (err) {
    console.error(`\n${COLORS.red}${COLORS.bright}✖ Pipeline failed:${COLORS.reset} ${err.message}\n`);
    process.exit(1);
  }
}

main();
