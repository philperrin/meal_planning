# Feature Specification: Mobile-First Responsive UX & Navigation (MPA-17)

## 1. Overview & Objectives
This specification defines the functional, technical, and visual requirements for optimizing the **Meal Planning Assistant** for mobile devices (smartphones and compact tablets, `< 768px` viewport width). 

The goal is to enable busy parents multitasking in the kitchen or on-the-go to navigate the app effortlessly with one thumb without excessive vertical scrolling or tiny touch targets.

---

## 2. Key Mobile Requirements & User Stories

### 2.1 User Story (MPA-17)
> **As a parent** using the app on a mobile device while multitasking,  
> **I want** a sticky bottom navigation bar and glanceable, compact cards,  
> **So that** I can navigate with one thumb without excessive scrolling.

### 2.2 Acceptance Criteria
- [x] **Sticky Bottom Navigation**: On viewports under `768px` width, desktop header tabs collapse/hide and a fixed, thumb-accessible bottom navigation bar appears with active indicators.
- [x] **Glanceable Compact Cards**: On mobile viewports, recipe cards default to a glanceable compact view featuring the Recipe Title, a Total Time Badge (`⏱️ 25m`), and a 1-line teaser, expanding smoothly on tap.
- [x] **Ergonomic Touch Targets**: All interactive elements (bottom nav items, buttons, selection checkboxes, date pickers, cuisine buttons) meet or exceed the accessibility standard of **44x44px** touch target area.
- [x] **Unobscured Content & Sticky Actions**: The bottom nav and mobile layout include proper safe-area padding (`env(safe-area-inset-bottom)`) so sticky execution buttons and card content are never obscured.
- [x] **iOS / Mobile Form Optimization**: Form inputs use font sizes $\ge$ 16px on mobile to prevent unwanted viewport auto-zooming on focus.

---

## 3. UI/UX Architecture & Interactions

### 3.1 Mobile Header & Sticky Bottom Navigation
- **Top Header (`<header>`) on Mobile**:
  - Compact, slim header bar displaying the brand icon and title (`🍽️ Meal Planner`).
  - Desktop nav tabs (`.nav-desktop`) are hidden (`display: none`).
- **Sticky Bottom Navigation Bar (`<nav class="bottom-nav">`)**:
  - Fixed to viewport bottom with `backdrop-filter: blur(16px)` and background `var(--bg-card)`.
  - Displays 4 thumb-friendly navigation tabs:
    1. 🗓️ **Planner**
    2. 📜 **History**
    3. ❤️ **Preferences**
    4. ⚙️ **Settings**
  - Height: 60px + safe area inset.
  - Min touch target per tab: $\ge 44 \times 44\text{px}$.
  - Active tab highlighted with sage green indicator and subtle glow.
  - Coordinated state: Switching tabs in bottom nav updates both state and any desktop counterpart.

### 3.2 Glanceable Compact Recipe Cards
- **Desktop State ($\ge 769\text{px}$)**:
  - Expansive grid layout (`repeat(auto-fill, minmax(340px, 1fr))`).
  - Full details available as before.
- **Mobile Compact State ($< 768\text{px}$)**:
  - Cards default to a condensed summary row / collapsed card:
    - **Header Row**: Recipe Title + Total Time Pill Badge (e.g., `⏱️ 35m`, computed from Prep + Cook time).
    - **Selection Checkbox**: Minimum tap target $44\times 44\text{px}$ on the right edge.
    - **1-Line Teaser**: Truncated recipe description with ellipsis (`line-clamp: 1`).
    - **Expand/Collapse Indicator**: Smooth chevron indicating expandable details.
  - **1-Tap Smooth Expansion**:
    - Tapping the card body expands the card to reveal: full description, date picker, prep/cook breakdown tags, and accordion for ingredients & instructions.
    - Tapping the checkbox toggles selection without toggling expansion.

### 3.3 Touch Target & Form Sizing Optimization
- **Checkboxes**: Wrapped in a $44\times 44\text{px}$ touch hitbox.
- **Action Buttons (`.btn`)**: Full width on mobile or $\ge 48\text{px}$ height with comfortable thumb padding.
- **Cuisine Selector Pills**:
  - Vertically stacked or enlarged 3-state buttons with $\ge 44\text{px}$ touch targets.
- **Date Inputs**: Sized to $\ge 44\text{px}$ touch height with native date picker dialog trigger.
- **Text Inputs / Textareas**: Minimum $16\text{px}$ font size on mobile to prevent iOS Safari auto-zoom.

### 3.4 Sticky Footer / Floating Action Accessibility
- Bottom padding added to `.app-container` and `main` (`padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px))`).
- Floating meal plan execution button / bar pinned cleanly above bottom nav when active, ensuring immediate thumb reach without scrolling through tall plans.
- Toast notifications positioned above the bottom navigation bar (`bottom: calc(80px + env(safe-area-inset-bottom, 0px))`).

---

## 4. Technical Specifications & File Changes

| File | Changes |
|---|---|
| **`Index.html`** | 1. Add `<nav class="bottom-nav">` with mobile navigation tabs for Planner, History, Preferences, Settings.<br>2. Add mobile viewport meta check if needed.<br>3. Add classes distinguishing desktop top nav vs mobile bottom nav. |
| **`Styles.html`** | 1. Add `@media (max-width: 768px)` rules for `.bottom-nav`, `.nav-desktop`, and mobile header.<br>2. Add styling for mobile compact recipe cards (`.recipe-card.mobile-compact`, `.recipe-card.expanded`, `.total-time-badge`, 1-line teaser clamp).<br>3. Add minimum $44\text{px}$ touch target rules for checkboxes, buttons, cuisine controls, and date pickers.<br>4. Add bottom safe-area offset padding to prevent overlap with sticky bottom bar.<br>5. Position toast notifications above bottom nav. |
| **`JavaScript.html`** | 1. Update `setupNavigation()` to bind click events to all `.nav-tab` buttons (both header and bottom nav).<br>2. Add total time computation helper (e.g., `calculateTotalTime(prep, cook)` returning formatted string like `⏱️ 35m`).<br>3. Update `renderMealPlan()` to render compact card structure with total time badge and tap-to-expand handlers.<br>4. Provide dedicated event handlers for recipe selection vs. card expansion to avoid accidental toggles. |

---

## 5. Verification & Testing Matrix

| Test Case | Viewport | Expected Result |
|---|---|---|
| **Bottom Nav Visibility** | $\le 768\text{px}$ | Top nav tabs hidden, sticky bottom nav visible at bottom of viewport. |
| **Bottom Nav Visibility** | $> 768\text{px}$ | Desktop top nav visible in header, bottom nav hidden. |
| **Tab Switching** | $\le 768\text{px}$ | Tapping bottom nav tabs switches active view and highlights active icon. |
| **Compact Recipe Card** | $\le 768\text{px}$ | Meal plan cards render in collapsed view (title, total time badge, 1-line teaser). |
| **1-Tap Expand / Collapse** | $\le 768\text{px}$ | Tapping card expands smoothly to reveal full details; tapping again collapses. |
| **Recipe Selection Toggle** | Mobile & Desktop | Tapping $44\times 44\text{px}$ checkbox toggles selection without toggling card expansion. |
| **Touch Target Size** | $\le 768\text{px}$ | All interactive buttons, checkboxes, inputs meet $\ge 44\text{px}$ touch targets. |
| **Bottom Clearance** | $\le 768\text{px}$ | Content, buttons, and toasts remain 100% visible and accessible above bottom nav. |
