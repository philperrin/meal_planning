# GitHub & Google Clasp Setup Guide

This guide walks you through setting up a Git/GitHub repository for this project and configuring **Google Clasp** to sync your local files (`Code.gs`, `Index.html`, etc.) directly to your Google Apps Script project.

We have already:
1. Created a `.gitignore` to keep credentials and dependencies out of Git.
2. Initialized a local Git repository (`git init`).
3. Installed `@google/clasp` as a local project dependency (`npm install --save-dev @google/clasp`).
4. Added shortcut scripts to your `package.json` for easy command execution.

---

## **Step 1: Set up the GitHub Repository**

1. Go to [GitHub](https://github.com/) and log in.
2. In the top-right corner, click the **`+`** icon and select **New repository**.
3. Configure the repository:
   *   **Repository name:** `meal-planning-assistant` (or any name you prefer)
   *   **Description:** (Optional) Automated Meal Planning Assistant via Apps Script.
   *   **Public/Private:** Choose your preference.
   *   **Initialize this repository with:** Leave "Add a README", "Add .gitignore", and "Choose a license" **UNCHECKED** (since we already have a local codebase).
4. Click **Create repository**.
5. Copy the remote URL shown under **"Quick setup"** (e.g., `https://github.com/YOUR_USERNAME/meal-planning-assistant.git`).
6. Run the following commands in your local terminal:
   ```bash
   # Stage and commit your files locally
   git add .
   git commit -m "initial commit"

   # Rename branch to main
   git branch -M main

   # Add the remote GitHub link (replace with your copied URL)
   git remote add origin https://github.com/YOUR_USERNAME/meal-planning-assistant.git

   # Push code to GitHub
   git push -u origin main
   ```

---

## **Step 2: Enable the Apps Script API**

For Clasp to communicate with Google's servers, you must enable API access on your Google account:
1. Go to the [Google Apps Script Settings Page](https://script.google.com/home/usersettings).
2. Toggle the **Google Apps Script API** switch to **ON** (enabled).

---

## **Step 3: Authenticate Clasp**

Log in to your Google Account through Clasp:
1. Run the login command in your terminal:
   ```bash
   npm run login
   ```
2. Your browser will automatically open to a Google authentication page. Log in with the account you use for Google Apps Script.
3. Click **Allow** to authorize Clasp. Once authorized, you can close the browser window.

---

## **Step 4: Link Clasp to Google Apps Script**

Choose **one** of the two options below depending on whether you have already created the Apps Script project manually.

### **Option A: Link to your existing Apps Script project**
If you already created the project in Apps Script manually:
1. Open your project on [script.google.com](https://script.google.com/).
2. On the left sidebar, click the gear icon (**Project Settings**).
3. Copy the **Script ID** (a long alphanumeric string).
4. In your local workspace root, create a file named `.clasp.json` containing:
   ```json
   {
     "scriptId": "YOUR_SCRIPT_ID_HERE",
     "rootDir": "."
   }
   ```
5. Pull down the server-side manifest (`appsscript.json`) by running:
   ```bash
   npm run pull
   ```
   *This downloads the Apps Script manifest file. It is now safe to sync your code!*

### **Option B: Create a brand new project from the command line**
If you want to start fresh with a new project created directly by Clasp:
1. Run the creation command:
   ```bash
   npx clasp create --title "Automated Meal Planning Assistant" --type webapp
   ```
2. This will:
   *   Create a new Apps Script project under your Google account.
   *   Generate a `.clasp.json` linking the project automatically.
   *   Generate a default `appsscript.json` manifest locally.

---

## **Step 5: How to Keep Code in Sync**

Now that everything is connected, use these commands to manage your workflow:

*   **Push local changes to the Apps Script cloud:**
    ```bash
    npm run push
    ```
    *Runs `clasp push` to overwrite the remote Apps Script files with your local versions.*

*   **Pull remote changes from the Apps Script cloud:**
    ```bash
    npm run pull
    ```
    *Runs `clasp pull` to update your local files with any edits made directly in the Google script editor.*

*   **Development watcher (auto-sync):**
    ```bash
    npm run watch
    ```
    *Runs `clasp push --watch`. Clasp will monitor your local folder and push changes automatically every time you save a file.*

*   **Open the project editor in your browser:**
    ```bash
    npx clasp open
    ```
