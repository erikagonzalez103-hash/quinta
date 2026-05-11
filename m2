<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Give Claude Memory · Module Two · Quinta &amp; Co.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap" rel="stylesheet">
<style>
  /* ============================
     CONFIG — change in one place
     ============================ */
  /* Access code is set in JS at the bottom of this file */

  :root {
    --bg: #FAFAF6;
    --bg-warm: #F5F2EA;
    --surface: #FFFFFF;
    --surface-soft: #F1EEE6;
    --border: #DCD7CB;
    --border-soft: #E8E3D7;
    --text: #2F332E;
    --text-soft: #5A5E55;
    --text-muted: #8A8E83;
    --heading: #20231F;
    --sage: #6E8B7A;
    --sage-deep: #4F6B5C;
    --sage-soft: #DFE7E0;
    --sage-whisper: #EEF2EC;
    --moss: #3D544A;
    --accent-warm: #B8A37E;
    --shadow-soft: 0 1px 2px rgba(48, 56, 49, 0.04), 0 4px 12px rgba(48, 56, 49, 0.04);
    --shadow-lift: 0 4px 16px rgba(48, 56, 49, 0.06), 0 12px 32px rgba(48, 56, 49, 0.06);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html { scroll-behavior: smooth; scroll-padding-top: 80px; }

  body {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 400;
    background: var(--bg);
    color: var(--text);
    line-height: 1.65;
    font-size: 17px;
    min-height: 100vh;
    overflow-x: hidden;
    /* Anti-copy: disable text selection by default */
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
  }

  /* Allow selection on prompt/copyable elements */
  .copyable, .copyable * {
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
    user-select: text;
  }

  /* Background paper texture */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
      radial-gradient(circle at 20% 10%, rgba(110, 139, 122, 0.04) 0%, transparent 40%),
      radial-gradient(circle at 80% 70%, rgba(184, 163, 126, 0.03) 0%, transparent 40%);
  }

  body::after {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.4;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.18 0 0 0 0 0.20 0 0 0 0 0.18 0 0 0 0.04 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  /* ============================
     ACCESS GATE
     ============================ */
  .gate {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: linear-gradient(135deg, #F5F2EA 0%, #EEF2EC 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .gate-card {
    max-width: 460px;
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 56px 44px;
    box-shadow: var(--shadow-lift);
    text-align: center;
    position: relative;
  }

  .gate-card::before {
    content: '';
    position: absolute;
    top: 0; left: 50%; transform: translateX(-50%);
    width: 80px;
    height: 3px;
    background: var(--sage);
  }

  .gate-mark {
    font-family: 'Cinzel', serif;
    font-size: 12px;
    letter-spacing: 0.32em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 24px;
  }

  .gate-card h1 {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    font-size: 28px;
    color: var(--heading);
    margin-bottom: 16px;
    letter-spacing: 0.04em;
  }

  .gate-card p {
    color: var(--text-soft);
    margin-bottom: 32px;
    font-size: 15px;
    font-style: italic;
  }

  .gate-input {
    width: 100%;
    padding: 14px 16px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-family: 'Fraunces', serif;
    font-size: 16px;
    color: var(--text);
    margin-bottom: 14px;
    border-radius: 2px;
    text-align: center;
    letter-spacing: 0.05em;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .gate-input:focus {
    outline: none;
    border-color: var(--sage);
    box-shadow: 0 0 0 3px var(--sage-whisper);
  }

  .gate-button {
    width: 100%;
    padding: 14px;
    background: var(--sage-deep);
    color: var(--bg);
    border: none;
    font-family: 'Cinzel', serif;
    font-size: 13px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.2s, transform 0.1s;
  }

  .gate-button:hover { background: var(--moss); }
  .gate-button:active { transform: translateY(1px); }

  .gate-error {
    color: #A0524F;
    font-size: 13px;
    font-style: italic;
    margin-top: 12px;
    min-height: 18px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .gate-error.show { opacity: 1; }

  .gate-footer {
    margin-top: 28px;
    font-size: 12px;
    color: var(--text-muted);
    letter-spacing: 0.08em;
  }

  /* ============================
     LAYOUT
     ============================ */
  .app {
    display: none;
    position: relative;
    z-index: 1;
  }

  .app.unlocked { display: block; }

  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    min-height: 100vh;
  }

  /* ============================
     SIDEBAR
     ============================ */
  .sidebar {
    background: var(--bg-warm);
    border-right: 1px solid var(--border-soft);
    padding: 40px 28px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    z-index: 10;
  }

  .brand {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.32em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .module-title {
    font-family: 'Cinzel', serif;
    font-size: 22px;
    font-weight: 500;
    color: var(--heading);
    line-height: 1.3;
    margin-bottom: 4px;
  }

  .module-sub {
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border-soft);
  }

  .nav-label {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    letter-spacing: 0.28em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .nav { list-style: none; margin-bottom: 32px; }

  .nav li { margin-bottom: 2px; }

  .nav a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    text-decoration: none;
    color: var(--text-soft);
    font-size: 14px;
    border-left: 2px solid transparent;
    border-radius: 0 2px 2px 0;
    transition: all 0.2s ease;
    font-family: 'Fraunces', serif;
  }

  .nav a:hover {
    background: var(--sage-whisper);
    color: var(--moss);
    border-left-color: var(--sage);
  }

  .nav a.active {
    background: var(--sage-whisper);
    color: var(--moss);
    border-left-color: var(--sage-deep);
    font-weight: 500;
  }

  .nav-num {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    color: var(--text-muted);
    min-width: 18px;
    letter-spacing: 0.05em;
  }

  .nav a.active .nav-num { color: var(--sage-deep); }

  .nav-time {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
  }

  .sidebar-meta {
    padding-top: 24px;
    border-top: 1px solid var(--border-soft);
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .sidebar-meta strong {
    font-weight: 500;
    color: var(--text-soft);
    display: block;
    margin-bottom: 4px;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  /* ============================
     MAIN CONTENT
     ============================ */
  .main {
    padding: 64px 72px 120px;
    max-width: 880px;
  }

  .header {
    margin-bottom: 64px;
    padding-bottom: 40px;
    border-bottom: 1px solid var(--border-soft);
  }

  .eyebrow {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.32em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 16px;
  }

  .header h1 {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    font-size: 44px;
    color: var(--heading);
    line-height: 1.15;
    letter-spacing: 0.02em;
    margin-bottom: 18px;
  }

  .header .lede {
    font-size: 19px;
    color: var(--text-soft);
    font-style: italic;
    line-height: 1.6;
    max-width: 640px;
  }

  /* Sections */
  section {
    margin-bottom: 80px;
    scroll-margin-top: 40px;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 8px;
  }

  .section-num {
    font-family: 'Cinzel', serif;
    font-size: 13px;
    color: var(--sage);
    letter-spacing: 0.1em;
    font-weight: 500;
  }

  .section-time {
    font-family: 'Fraunces', serif;
    font-style: italic;
    font-size: 13px;
    color: var(--text-muted);
    margin-left: auto;
  }

  section h2 {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    font-size: 30px;
    color: var(--heading);
    line-height: 1.2;
    letter-spacing: 0.02em;
    margin-bottom: 8px;
  }

  .section-deck {
    font-size: 17px;
    color: var(--text-soft);
    font-style: italic;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border-soft);
  }

  section h3 {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    font-size: 18px;
    color: var(--heading);
    margin: 32px 0 14px;
    letter-spacing: 0.04em;
  }

  section p {
    margin-bottom: 16px;
    color: var(--text);
  }

  section p strong { color: var(--heading); font-weight: 500; }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    padding: 28px 32px;
    margin: 24px 0;
    border-radius: 3px;
    box-shadow: var(--shadow-soft);
    position: relative;
  }

  .card-sage {
    background: var(--sage-whisper);
    border-color: var(--sage-soft);
  }

  .card-warm {
    background: var(--bg-warm);
    border-color: var(--border-soft);
  }

  .card-mark {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.24em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  /* Two-column comparison */
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 24px 0;
  }

  .compare > div {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    padding: 24px;
    border-radius: 3px;
    box-shadow: var(--shadow-soft);
  }

  .compare h4 {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    font-size: 15px;
    color: var(--heading);
    margin-bottom: 12px;
    letter-spacing: 0.04em;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  .compare ul, .compare ol { margin-left: 18px; font-size: 15px; color: var(--text-soft); }
  .compare li { margin-bottom: 6px; }

  /* Cheat sheet table */
  .cheat-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 14px;
    table-layout: auto;
  }

  .cheat-table thead th {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-soft);
    text-align: left;
    padding: 12px 14px;
    border-bottom: 1.5px solid var(--border);
    background: transparent;
    transition: color 0.3s, background 0.3s;
  }

  .cheat-table tbody td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-soft);
    vertical-align: top;
    color: var(--text);
    transition: background 0.3s;
  }

  .cheat-table tbody td:first-child {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 14px;
    color: var(--heading);
    width: 38%;
  }

  .cheat-table tbody tr:last-child td { border-bottom: none; }

  .cheat-table.detect-mac .col-mac,
  .cheat-table.detect-pc .col-pc {
    background: var(--sage-whisper);
  }

  .cheat-table.detect-mac thead .col-mac,
  .cheat-table.detect-pc thead .col-pc {
    color: var(--sage-deep);
    font-weight: 600;
  }

  .cheat-table.detect-mac thead .col-mac::after,
  .cheat-table.detect-pc thead .col-pc::after {
    content: ' · YOU';
    font-size: 9px;
    letter-spacing: 0.18em;
    color: var(--sage);
  }

  kbd {
    display: inline-block;
    background: var(--bg-warm);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    padding: 2px 8px;
    border-radius: 3px;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--moss);
    white-space: nowrap;
    margin: 0 1px;
  }

  /* Section locking */
  section.lockable.locked > *:not(.section-head):not(h2):not(.lock-card) {
    display: none;
  }
  section.lockable .lock-card {
    display: none;
  }
  section.lockable.locked .lock-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: var(--bg-warm);
    border: 1px dashed var(--border);
    padding: 48px 32px;
    border-radius: 3px;
    margin-top: 28px;
    animation: rise 0.5s ease-out;
  }

  .lock-icon {
    color: var(--sage-deep);
    margin-bottom: 16px;
    opacity: 0.85;
  }

  .lock-title {
    font-family: 'Cinzel', serif;
    font-size: 14px;
    font-weight: 500;
    color: var(--heading);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 10px !important;
  }

  .lock-sub {
    font-style: italic;
    color: var(--text-soft);
    font-size: 15px;
    max-width: 420px;
    margin-bottom: 24px !important;
    line-height: 1.5;
  }

  .lock-input-row {
    display: flex;
    gap: 8px;
    width: 100%;
    max-width: 360px;
  }

  .lock-input {
    flex: 1;
    padding: 12px 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-family: 'Fraunces', serif;
    font-size: 15px;
    color: var(--text);
    border-radius: 2px;
    text-align: center;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: border-color 0.2s, box-shadow 0.2s;
    -webkit-user-select: text;
    user-select: text;
  }

  .lock-input:focus {
    outline: none;
    border-color: var(--sage);
    box-shadow: 0 0 0 3px var(--sage-whisper);
  }

  .lock-button {
    padding: 12px 22px;
    background: var(--sage-deep);
    color: var(--bg);
    border: none;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.2s, transform 0.1s;
  }

  .lock-button:hover { background: var(--moss); }
  .lock-button:active { transform: translateY(1px); }

  .lock-error {
    color: #A0524F;
    font-size: 13px;
    font-style: italic;
    margin-top: 14px !important;
    min-height: 18px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .lock-error.show { opacity: 1; }

  /* Sidebar lock indicators */
  .nav a.is-locked .nav-num::before {
    content: '·';
    color: var(--sage);
    margin-right: 4px;
    opacity: 0.6;
  }
  .nav a.is-unlocked .nav-num::before {
    content: '◦';
    color: var(--sage);
    margin-right: 4px;
  }

  /* Setup checklist */
  .checklist {
    background: var(--sage-whisper);
    border: 1px solid var(--sage-soft);
    border-left: 3px solid var(--sage);
    padding: 24px 28px;
    margin: 24px 0 32px;
    border-radius: 3px;
  }

  .checklist-mark {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.24em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .checklist ul {
    list-style: none;
    padding: 0;
  }

  .checklist li {
    padding: 8px 0 8px 32px;
    position: relative;
    cursor: pointer;
    transition: color 0.2s;
    color: var(--text);
    font-size: 15px;
  }

  .checklist li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--sage);
    border-radius: 2px;
    background: var(--surface);
    transition: all 0.15s;
  }

  .checklist li.checked {
    color: var(--text-muted);
  }

  .checklist li.checked::before {
    background: var(--sage-deep);
    border-color: var(--sage-deep);
  }

  .checklist li.checked::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 14px;
    width: 8px;
    height: 4px;
    border-left: 2px solid var(--bg);
    border-bottom: 2px solid var(--bg);
    transform: rotate(-45deg);
  }

  .checklist li small {
    display: block;
    color: var(--text-muted);
    font-size: 13px;
    font-style: italic;
    margin-top: 2px;
  }

  /* Session summary */
  .session-summary {
    margin-top: 64px;
    padding: 36px 40px;
    background: linear-gradient(135deg, var(--sage-whisper) 0%, var(--bg-warm) 100%);
    border: 1px solid var(--sage-soft);
    border-radius: 3px;
    display: none;
  }

  .session-summary.show {
    display: block;
    animation: rise 0.6s ease-out;
  }

  .session-summary .card-mark {
    margin-bottom: 16px;
  }

  .session-summary h3 {
    font-family: 'Cinzel', serif;
    font-size: 22px;
    font-weight: 500;
    color: var(--heading);
    margin-top: 0 !important;
    margin-bottom: 12px;
    letter-spacing: 0.04em;
  }

  .session-summary p {
    color: var(--text-soft);
    font-size: 15px;
  }

  .session-log-preview {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    padding: 20px 24px;
    margin: 20px 0;
    font-family: 'Fraunces', serif;
    font-size: 13px;
    color: var(--text);
    line-height: 1.7;
    max-height: 280px;
    overflow-y: auto;
    border-radius: 2px;
    white-space: pre-wrap;
    -webkit-user-select: text;
    user-select: text;
  }

  .session-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 16px;
  }

  .session-button {
    padding: 12px 22px;
    background: var(--sage-deep);
    color: var(--bg);
    border: none;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.2s;
  }

  .session-button:hover { background: var(--moss); }

  .session-button.copied {
    background: var(--moss);
  }

  .session-button.secondary {
    background: transparent;
    color: var(--sage-deep);
    border: 1px solid var(--sage);
  }

  .session-button.secondary:hover {
    background: var(--sage-whisper);
  }

  /* Lists */
  .styled-list {
    list-style: none;
    margin: 16px 0;
  }

  .styled-list li {
    padding: 10px 0 10px 28px;
    position: relative;
    border-bottom: 1px solid var(--border-soft);
  }

  .styled-list li:last-child { border-bottom: none; }

  .styled-list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 19px;
    width: 14px;
    height: 1px;
    background: var(--sage);
  }

  .styled-list li strong {
    font-weight: 500;
    color: var(--heading);
    font-family: 'Cinzel', serif;
    font-size: 13px;
    letter-spacing: 0.06em;
    display: block;
    margin-bottom: 2px;
  }

  /* Pull quote / wisdom */
  .wisdom {
    margin: 32px 0;
    padding: 24px 32px;
    border-left: 2px solid var(--sage);
    font-family: 'Fraunces', serif;
    font-style: italic;
    font-size: 18px;
    color: var(--moss);
    line-height: 1.6;
    background: var(--sage-whisper);
  }

  .wisdom::before {
    content: '"';
    font-family: 'Cinzel', serif;
    font-size: 32px;
    color: var(--sage);
    line-height: 0;
    position: relative;
    top: 12px;
    margin-right: 4px;
  }

  /* ============================
     CALLOUT — Where the water comes from / Why this way
     ============================ */
  .callout {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-left: 3px solid var(--sage-deep);
    padding: 26px 30px;
    margin: 28px 0;
    border-radius: 3px;
    box-shadow: var(--shadow-soft);
    position: relative;
  }

  .callout::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, transparent 0 50%, var(--bg-warm) 50%);
    opacity: 0.45;
    pointer-events: none;
  }

  .callout-section { margin: 0; }

  .callout-label {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.24em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 10px;
    font-weight: 500;
    display: block;
  }

  .callout-body {
    font-size: 16px;
    line-height: 1.7;
    color: var(--text);
    margin: 0;
  }

  .callout-body em {
    color: var(--moss);
    font-style: italic;
    font-weight: 500;
  }

  .callout-fleuron {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 18px 0;
    gap: 14px;
  }

  .callout-fleuron::before,
  .callout-fleuron::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--border), transparent);
    max-width: 90px;
  }

  .callout-fleuron span {
    font-family: 'Fraunces', serif;
    font-size: 16px;
    color: var(--accent-warm);
    line-height: 1;
    opacity: 0.85;
  }

  .callout--single { padding: 26px 30px; }

  /* ============================
     CHECK-YOUR-WORK — small tappable verification boxes
     ============================ */
  .checkwork {
    background: var(--bg-warm);
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    padding: 22px 26px;
    margin: 24px 0;
    transition: background 0.4s, border-color 0.4s;
  }

  .checkwork-mark {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.24em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .checkwork ul { list-style: none; padding: 0; margin: 0; }

  .checkwork li {
    position: relative;
    padding: 10px 0 10px 38px;
    cursor: pointer;
    color: var(--text);
    font-size: 15.5px;
    line-height: 1.55;
    border-bottom: 1px solid rgba(220, 215, 203, 0.5);
    transition: color 0.25s;
    -webkit-tap-highlight-color: transparent;
  }

  .checkwork li:last-child { border-bottom: none; }

  .checkwork li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 14px;
    width: 18px;
    height: 18px;
    border: 1.5px solid var(--sage);
    border-radius: 2px;
    background: var(--bg);
    transition: background 0.25s, border-color 0.25s;
  }

  .checkwork li:hover { color: var(--moss); }
  .checkwork li:hover::before { border-color: var(--sage-deep); }

  .checkwork li.checked { color: var(--text-soft); }

  .checkwork li.checked::before {
    background: var(--sage-deep);
    border-color: var(--sage-deep);
  }

  .checkwork li.checked::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 18px;
    width: 11px;
    height: 6px;
    border-left: 2px solid var(--bg);
    border-bottom: 2px solid var(--bg);
    transform: rotate(-45deg);
  }

  .checkwork.complete {
    border-color: var(--sage);
    background: var(--sage-whisper);
  }

  .checkwork.complete .checkwork-mark::after {
    content: ' · ready';
    color: var(--sage-deep);
    font-style: italic;
    text-transform: lowercase;
    letter-spacing: 0.1em;
  }

  /* ============================
     SAVE-YOUR-ANSWER — text input that persists + feeds session log
     ============================ */
  .answer-block {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-left: 3px solid var(--accent-warm);
    padding: 24px 28px;
    margin: 24px 0;
    border-radius: 3px;
    box-shadow: var(--shadow-soft);
  }

  .answer-mark {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.24em;
    color: var(--accent-warm);
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .answer-prompt {
    font-family: 'Fraunces', serif;
    font-style: italic;
    color: var(--text-soft);
    font-size: 15px;
    margin-bottom: 14px;
  }

  .answer-input {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-family: 'Fraunces', serif;
    font-size: 16px;
    color: var(--text);
    border-radius: 2px;
    transition: border-color 0.2s, box-shadow 0.2s;
    -webkit-user-select: text;
    user-select: text;
    resize: vertical;
    line-height: 1.6;
  }

  textarea.answer-input { min-height: 80px; }

  .answer-input:focus {
    outline: none;
    border-color: var(--sage);
    box-shadow: 0 0 0 3px var(--sage-whisper);
  }

  .answer-saved {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--sage-deep);
    text-transform: uppercase;
    margin-top: 8px;
    opacity: 0;
    transition: opacity 0.3s;
  }

  .answer-saved.show { opacity: 1; }

  /* ============================
     PREVIEW FRAME — "what your build should look like" image card
     ============================ */
  .preview-frame {
    margin: 20px 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    box-shadow: var(--shadow-lift);
    overflow: hidden;
  }

  .preview-titlebar {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background: var(--bg-warm);
    border-bottom: 1px solid var(--border-soft);
  }

  .preview-titlebar::before {
    content: '';
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #E0B8AE;
    box-shadow: 16px 0 0 0 #E5D5A6, 32px 0 0 0 #B5CCB5;
  }

  .preview-title {
    margin-left: 56px;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .preview-image { display: block; width: 100%; height: auto; background: var(--bg); }

  .preview-placeholder {
    padding: 56px 30px;
    text-align: center;
    background: linear-gradient(135deg, var(--bg) 0%, var(--bg-warm) 100%);
    color: var(--text-muted);
    font-style: italic;
    font-size: 14px;
    line-height: 1.6;
  }

  .preview-caption {
    padding: 12px 20px;
    background: var(--surface);
    border-top: 1px solid var(--border-soft);
    font-size: 13px;
    color: var(--text-soft);
    font-style: italic;
    font-family: 'Fraunces', serif;
  }

  /* ============================
     EXAMPLES GALLERY — Pick Your Thing cards
     ============================ */
  .examples-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin: 24px 0;
  }

  .example-card {
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    padding: 18px 20px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: var(--shadow-soft);
  }

  .example-card:hover {
    border-color: var(--sage);
    transform: translateY(-1px);
    box-shadow: var(--shadow-lift);
  }

  .example-card.selected {
    border-color: var(--sage-deep);
    background: var(--sage-whisper);
  }

  .example-card-title {
    font-family: 'Cinzel', serif;
    font-size: 13px;
    color: var(--heading);
    margin-bottom: 6px;
    letter-spacing: 0.04em;
  }

  .example-card-sub {
    font-size: 13px;
    color: var(--text-soft);
    line-height: 1.5;
    font-style: italic;
  }

  /* Prompt blocks */
  .prompt-block {
    background: var(--bg-warm);
    border: 1px dashed var(--sage);
    padding: 22px 26px;
    margin: 16px 0;
    border-radius: 3px;
    position: relative;
  }

  .prompt-block::before {
    content: 'TRY THIS';
    position: absolute;
    top: -8px;
    left: 18px;
    background: var(--bg);
    padding: 0 10px;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    letter-spacing: 0.24em;
    color: var(--sage-deep);
  }

  .prompt-text {
    font-family: 'Fraunces', serif;
    font-style: italic;
    color: var(--text);
    line-height: 1.65;
    font-size: 16px;
    -webkit-user-select: text;
    user-select: text;
  }

  .prompt-text .fill {
    background: rgba(110, 139, 122, 0.12);
    padding: 1px 6px;
    border-radius: 2px;
    color: var(--moss);
    font-style: normal;
    font-size: 14px;
    font-family: 'Cinzel', serif;
    letter-spacing: 0.04em;
  }

  .copy-btn {
    margin-top: 16px;
    background: transparent;
    border: 1px solid var(--sage);
    color: var(--sage-deep);
    padding: 8px 16px;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.2s;
    text-transform: uppercase;
  }

  .copy-btn:hover {
    background: var(--sage);
    color: var(--bg);
  }

  .copy-btn.copied {
    background: var(--sage-deep);
    color: var(--bg);
    border-color: var(--sage-deep);
  }

  /* Steps */
  .steps {
    list-style: none;
    counter-reset: step;
    margin: 24px 0;
  }

  .steps li {
    counter-increment: step;
    padding: 20px 24px 20px 64px;
    margin-bottom: 12px;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    position: relative;
    box-shadow: var(--shadow-soft);
  }

  .steps li::before {
    content: counter(step, decimal-leading-zero);
    position: absolute;
    left: 22px;
    top: 18px;
    font-family: 'Cinzel', serif;
    font-size: 13px;
    color: var(--sage-deep);
    font-weight: 500;
    letter-spacing: 0.05em;
  }

  .steps li strong {
    display: block;
    margin-bottom: 4px;
    font-family: 'Cinzel', serif;
    font-weight: 500;
    color: var(--heading);
    font-size: 14px;
    letter-spacing: 0.04em;
  }

  /* Glossary terms */
  dl.glossary {
    margin: 24px 0;
  }

  .glossary dt {
    font-family: 'Cinzel', serif;
    font-weight: 500;
    color: var(--heading);
    font-size: 14px;
    letter-spacing: 0.06em;
    margin-top: 18px;
    margin-bottom: 6px;
    padding-top: 18px;
    border-top: 1px solid var(--border-soft);
  }

  .glossary dt:first-child { padding-top: 0; border-top: none; }

  .glossary dd {
    color: var(--text-soft);
    margin-left: 0;
    font-size: 15px;
  }

  /* Divider */
  .ornament {
    text-align: center;
    margin: 64px 0 48px;
    font-family: 'Cinzel', serif;
    color: var(--sage);
    letter-spacing: 0.4em;
    font-size: 14px;
  }

  /* Footer */
  .footer-note {
    margin-top: 80px;
    padding-top: 32px;
    border-top: 1px solid var(--border-soft);
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
    text-align: center;
  }

  /* Watermark */
  .watermark {
    position: fixed;
    bottom: 16px;
    right: 20px;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    letter-spacing: 0.18em;
    color: rgba(110, 139, 122, 0.55);
    text-transform: uppercase;
    pointer-events: none;
    z-index: 100;
    background: rgba(250, 250, 246, 0.7);
    padding: 4px 10px;
    border-radius: 2px;
    backdrop-filter: blur(4px);
  }

  /* Mobile */
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar {
      position: relative;
      height: auto;
      padding: 24px;
    }
    .nav { columns: 1; }
    .main { padding: 32px 24px 80px; }
    .header h1 { font-size: 32px; }
    section h2 { font-size: 24px; }
    .compare { grid-template-columns: 1fr; }
  }

  /* Print blocking */
  @media print {
    body * { display: none !important; }
    body::after {
      content: 'Printing not permitted. This is a licensed module.';
      display: block !important;
      font-family: serif;
      padding: 40px;
      font-size: 18px;
    }
  }

  /* Subtle entrance animation */
  .app.unlocked .header,
  .app.unlocked section {
    animation: rise 0.8s ease-out backwards;
  }

  .app.unlocked section:nth-child(2) { animation-delay: 0.1s; }
  .app.unlocked section:nth-child(3) { animation-delay: 0.15s; }

  @keyframes rise {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
</head>
<body>

<!-- ===========================
     ACCESS GATE
     =========================== -->
<div id="gate" class="gate">
  <div class="gate-card">
    <div class="gate-mark">Module Two · A Private Module</div>
    <h1>Welcome Back</h1>
    <p>Please enter your access code and name to begin.</p>
    <input id="codeInput" class="gate-input" type="password" placeholder="Access code" autocomplete="off" />
    <input id="nameInput" class="gate-input" type="text" placeholder="Your name" autocomplete="off" />
    <button id="unlockBtn" class="gate-button">Enter</button>
    <div id="gateError" class="gate-error">That code isn't quite right. Try again.</div>
    <div class="gate-footer">Quinta &amp; Co. · Licensed Content</div>
  </div>
</div>

<!-- ===========================
     APP
     =========================== -->
<div id="app" class="app">
  <div class="layout">

    <!-- SIDEBAR -->
    <aside class="sidebar">
      <div class="brand">Quinta &amp; Co.</div>
      <h2 class="module-title">Give Claude Memory</h2>
      <p class="module-sub">Module Two · 60 minutes</p>

      <div class="nav-label">The Build</div>
      <ul class="nav" id="navList">
        <li><a href="#welcome"><span class="nav-num">01</span> The Amnesia Problem <span class="nav-time">5m</span></a></li>
        <li><a href="#mental-model"><span class="nav-num">02</span> The Mental Model <span class="nav-time">5m</span></a></li>
        <li><a href="#pick-your-thing"><span class="nav-num">03</span> Pick Your Thing <span class="nav-time">5m</span></a></li>
        <li><a href="#build-tracker"><span class="nav-num">04</span> Build the Tracker <span class="nav-time">25m</span></a></li>
        <li><a href="#export-csv"><span class="nav-num">05</span> Take Your Data Out <span class="nav-time">5m</span></a></li>
        <li><a href="#hire-assistant"><span class="nav-num">06</span> Hire Your Assistant <span class="nav-time">8m</span></a></li>
        <li><a href="#test-assistant"><span class="nav-num">07</span> Test Your Assistant <span class="nav-time">5m</span></a></li>
        <li><a href="#beyond"><span class="nav-num">08</span> Beyond <span class="nav-time">2m</span></a></li>
      </ul>

      <div class="sidebar-meta">
        <strong>Licensed To</strong>
        <span id="licenseName">—</span><br>
        <span id="licenseDate" style="font-size: 11px;"></span>
      </div>
    </aside>

    <!-- MAIN -->
    <main class="main">

      <header class="header">
        <div class="eyebrow">Quinta &amp; Co. · Module Two</div>
        <h1>Give Claude Memory</h1>
        <p class="lede">You've been using Claude like a brilliant friend with amnesia. Today we fix that. By the end of the hour, you'll have built a tool that holds your work — and an AI assistant that knows what's in it.</p>
      </header>

      <!-- ============ 01 WELCOME · THE AMNESIA PROBLEM ============ -->
      <section id="welcome">
        <div class="section-head">
          <span class="section-num">01</span>
          <span class="section-time">~ 5 minutes</span>
        </div>
        <h2>Welcome — The Amnesia Problem</h2>
        <p class="section-deck">Before we open anything, a quick frame on what we're doing today, and a quick check that you're set up.</p>

        <div class="checklist" id="setupChecklist">
          <div class="checklist-mark">Before We Begin · Tap each as you confirm</div>
          <ul>
            <li data-check="pro">
              I have Claude Pro (or higher)
              <small>Module 2 uses Projects, which require a paid plan. If you're still on Free — open a new tab, go to <strong>claude.ai/settings</strong>, click <em>Upgrade</em>. You'll get more out of today with Pro.</small>
            </li>
            <li data-check="module1">
              I have my Module 1 GitHub repo still accessible
              <small>You'll add to it today. If you can't find it — open <strong>github.com</strong> and look for a repo named after your Module 1 build.</small>
            </li>
            <li data-check="claude-tab">
              I have a separate tab open with claude.ai
              <small>You'll switch between this module and Claude a lot.</small>
            </li>
            <li data-check="editor">
              I have a text editor I can save files in
              <small>VS Code, Sublime, even TextEdit on Mac. Whatever you used in Module 1.</small>
            </li>
          </ul>
        </div>

        <h3>What we're doing today</h3>
        <p>Right now, every conversation you have with Claude starts from zero. You have to re-explain your business, paste in your client list, remind it of your tone of voice — every single time. That's the ceiling we're going to break today.</p>

        <p>By the end of the hour, you'll have two things:</p>

        <ul class="styled-list">
          <li>
            <strong>A tool that holds your work</strong>
            A simple webpage you built — a tracker, a log, a list — that saves your data. Yours. On your phone, on your laptop, anywhere you open the link.
          </li>
          <li>
            <strong>An AI assistant who knows what's in it</strong>
            A Claude Project loaded with your data and your context. You can ask it real questions about your real work, and it answers like an assistant who's been with you for years.
          </li>
        </ul>

        <div class="wisdom">You've been using Claude like a brilliant friend with amnesia. Today we give it memory.</div>
      </section>

      <!-- ============ 02 THE MENTAL MODEL ============ -->
      <section id="mental-model" class="lockable locked" data-code="NEST">
        <div class="section-head">
          <span class="section-num">02</span>
          <span class="section-time">~ 5 minutes</span>
        </div>
        <h2>The Mental Model — Two Halves of Memory</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">Before we build anything, the shape of what we're doing. Two halves. They click together at the end.</p>

        <h3>Half one — the <em>tool</em></h3>
        <p>The first thing we'll build is a small webpage. Like the one you built in Module 1, but this one <em>does</em> something — it has a form, and the form remembers what you typed even after you close the page. It's a tracker, in the most basic sense of the word.</p>
        <p>The data lives in <strong>your browser</strong>, not on someone else's server. That has implications, good and bad. The callout below tells you the truth about both.</p>

        <div class="callout">
          <div class="callout-section">
            <p class="callout-label">Where the water comes from</p>
            <p class="callout-body">When you build a webpage, the page itself can save little bits of information directly inside your browser. That's called <em>localStorage.</em> It's like a sticky note attached to the inside of <em>your</em> browser, on <em>your</em> computer — invisible to anyone else.</p>
          </div>
          <div class="callout-fleuron"><span>❦</span></div>
          <div class="callout-section">
            <p class="callout-label">Why we're using localStorage and not a real database</p>
            <p class="callout-body">Two reasons: it costs nothing, and it needs no setup. Nothing to install, no account to make. The trade-off — and this is a real one — your data only lives on the device you typed it into. If you switch from your laptop to your phone, the laptop's data isn't there. <em>That's why we'll export to CSV later.</em> When you outgrow this (and you will, if your business grows), Module 3 introduces a real database.</p>
          </div>
        </div>

        <h3>Half two — the <em>context</em></h3>
        <p>The second thing we'll build is a <strong>Claude Project</strong>. That's a workspace inside Claude where you load files Claude should always remember and write a permanent set of instructions Claude follows every time.</p>

        <p>The two halves come together when you take your tracker's data, export it as a spreadsheet, and upload it to your Project. Suddenly Claude isn't a stranger — it's an assistant who's been holding your binder.</p>

        <div class="card card-warm">
          <div class="card-mark">The Mental Model</div>
          <p><strong>The tool</strong> is where you <em>put data in.</em> A form. A list. A browser-saved table.<br>
          <strong>The Project</strong> is where Claude <em>reads data out.</em> A workspace. Instructions. Your context.<br>
          <strong>The CSV</strong> is the bridge between them. The one piece you'll update by hand for now.</p>
        </div>
      </section>

      <!-- ============ 03 PICK YOUR THING ============ -->
      <section id="pick-your-thing" class="lockable locked" data-code="FERN">
        <div class="section-head">
          <span class="section-num">03</span>
          <span class="section-time">~ 5 minutes</span>
        </div>
        <h2>Pick Your Thing</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">Every woman in this room is building a different tracker, for her own work. Pick yours now. It'll shape every prompt we use from here on.</p>

        <h3>Pick from one of these — or write your own below</h3>
        <p>Tap the card that fits you best. The questions you'll ask Claude later are tailored to what you pick, so this isn't decoration — it shapes the rest of the hour.</p>

        <div class="examples-gallery" id="examplesGallery">
          <div class="example-card" data-example="candidates">
            <div class="example-card-title">Candidate Tracker</div>
            <div class="example-card-sub">For recruiters, hiring managers, or anyone shepherding people through a pipeline.</div>
          </div>
          <div class="example-card" data-example="clients">
            <div class="example-card-title">Client Check-In Log</div>
            <div class="example-card-sub">For coaches, consultants, or service businesses tracking who you owe a touch.</div>
          </div>
          <div class="example-card" data-example="leads">
            <div class="example-card-title">Lead Pipeline</div>
            <div class="example-card-sub">For anyone selling something — track every prospect, what stage they're at, what's next.</div>
          </div>
          <div class="example-card" data-example="shoots">
            <div class="example-card-title">Shoot Log</div>
            <div class="example-card-sub">For photographers, videographers — every shoot, every client, every deliverable.</div>
          </div>
          <div class="example-card" data-example="content">
            <div class="example-card-title">Content Calendar</div>
            <div class="example-card-sub">For writers, creators, marketers — what you posted, where, when, how it landed.</div>
          </div>
          <div class="example-card" data-example="inventory">
            <div class="example-card-title">Inventory or Stock List</div>
            <div class="example-card-sub">For makers, shop owners, product businesses — what you have, what's selling, what's out.</div>
          </div>
        </div>

        <div class="answer-block">
          <div class="answer-mark">Your tracker</div>
          <p class="answer-prompt">My tracker is for…</p>
          <textarea class="answer-input" id="trackerAnswer" data-answer="tracker_purpose" placeholder="e.g. 'tracking my candidate pipeline across three open roles' — be specific, this becomes the brief Claude uses to build your tool"></textarea>
          <p class="answer-saved" id="trackerSaved">Saved</p>
        </div>

        <div class="wisdom">The clearer you are about what you're tracking, the better Claude will build for you. Vague in, vague out.</div>
      </section>

      <!-- ============ 04 BUILD THE TRACKER ============ -->
      <section id="build-tracker" class="lockable locked" data-code="ELM">
        <div class="section-head">
          <span class="section-num">04</span>
          <span class="section-time">~ 25 minutes · the main build</span>
        </div>
        <h2>Build the Tracker</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">This is the longest section. Three sub-steps. Don't worry about getting it perfect — get it working first, prettify second.</p>

        <h3>Step 4a — The form</h3>
        <p>Open a new chat in Claude. Paste this prompt (tap <em>Copy</em> to grab it). Wherever you see <span class="prompt-fill-marker">[brackets]</span>, replace with your own words from Section 03.</p>

        <div class="card card-warm">
          <div class="card-mark">How to Write a Prompt</div>
          <p>A prompt is just a clear request. You don't need to sound like a developer — Claude reads vibes, not jargon. Three things every good prompt has:</p>
          <ol style="margin: 14px 0 4px 20px; padding: 0;">
            <li style="margin-bottom: 10px;"><strong>What you want.</strong> Be specific. <em>"A form to track candidates"</em> is okay. <em>"A form to track candidates with name, last contact date, and status"</em> is much better.</li>
            <li style="margin-bottom: 10px;"><strong>The feel.</strong> You can say <em>"clean,"</em> <em>"calm,"</em> <em>"like a journal,"</em> <em>"warm but professional."</em> You don't need to know CSS — Claude reads plain English describing how things should feel.</li>
            <li><strong>What you'll use it for.</strong> One line of context — <em>"this is for my Friday afternoon review"</em> — helps Claude make smarter choices than you'd get without it.</li>
          </ol>
          <p style="margin-top: 14px; font-style: italic; color: var(--text-soft);">The prompt below already does all three. Notice the pattern as you read it — by your second prompt, you'll be writing your own.</p>
        </div>

        <div class="prompt-block">
          <div class="prompt-text">
            Build me a single HTML file for a tracker. It's for <span class="fill">[what you're tracking]</span>. The page should have a form at the top with these fields: <span class="fill">[list 3-5 fields you need]</span>. Use clean, calm styling — soft colors, generous spacing, a single column. Don't add anything fancy yet. Just the form, a title, and a Save button. Use vanilla HTML, CSS, and JavaScript only — no frameworks.
          </div>
        </div>
        <button class="copy-btn" onclick="copyPrompt(this, '4a')">Copy Prompt</button>

        <p style="margin-top: 20px;">Claude will write an HTML file. Copy the whole thing, open your text editor, paste it in, save as <kbd>tracker.html</kbd> on your Desktop. Double-click to open it in your browser.</p>

        <div class="preview-frame">
          <div class="preview-titlebar">
            <span class="preview-title">tracker.html — after Step 4a</span>
          </div>
          <div class="preview-placeholder" style="padding: 0; background: #FAFAF6;">
            <svg viewBox="0 0 600 360" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;" role="img" aria-label="Illustration: a simple form with a title, three input fields, and a Save button">
              <rect width="600" height="360" fill="#FAFAF6"/>
              <!-- Title -->
              <text x="300" y="46" text-anchor="middle" font-family="Cinzel, serif" font-size="17" letter-spacing="2" fill="#20231F">MY TRACKER</text>
              <line x1="245" y1="58" x2="355" y2="58" stroke="#6E8B7A" stroke-width="1"/>
              <!-- Field 1 -->
              <text x="80" y="95" font-family="Cinzel, serif" font-size="10" letter-spacing="1.5" fill="#5A5E55">NAME</text>
              <rect x="80" y="105" width="440" height="34" rx="2" fill="#FFFFFF" stroke="#DCD7CB"/>
              <text x="92" y="127" font-family="Fraunces, serif" font-style="italic" font-size="13" fill="#8A8E83">type a name…</text>
              <!-- Field 2 -->
              <text x="80" y="160" font-family="Cinzel, serif" font-size="10" letter-spacing="1.5" fill="#5A5E55">DATE</text>
              <rect x="80" y="170" width="440" height="34" rx="2" fill="#FFFFFF" stroke="#DCD7CB"/>
              <text x="92" y="192" font-family="Fraunces, serif" font-style="italic" font-size="13" fill="#8A8E83">mm/dd/yyyy</text>
              <!-- Field 3 -->
              <text x="80" y="225" font-family="Cinzel, serif" font-size="10" letter-spacing="1.5" fill="#5A5E55">STATUS</text>
              <rect x="80" y="235" width="440" height="34" rx="2" fill="#FFFFFF" stroke="#DCD7CB"/>
              <text x="92" y="257" font-family="Fraunces, serif" font-style="italic" font-size="13" fill="#8A8E83">choose one…</text>
              <!-- Save button -->
              <rect x="240" y="300" width="120" height="36" rx="2" fill="#4F6B5C"/>
              <text x="300" y="323" text-anchor="middle" font-family="Cinzel, serif" font-size="11" letter-spacing="2" fill="#FAFAF6">SAVE</text>
            </svg>
          </div>
          <div class="preview-caption">What your build should look like — roughly. Yours will have your own field names.</div>
        </div>

        <div class="checkwork" data-checkwork="4a">
          <div class="checkwork-mark">Check your work · Step 4a</div>
          <ul>
            <li data-id="4a-form">I see a form on the page with the fields I asked for</li>
            <li data-id="4a-save">I see a Save button</li>
            <li data-id="4a-style">The page looks calm and readable — not loud or broken</li>
          </ul>
        </div>

        <h3>Step 4b — Save and display</h3>
        <p>Right now the Save button doesn't do anything. Let's fix that. In the same Claude chat, paste this next prompt:</p>

        <div class="prompt-block">
          <div class="prompt-text">
            Now make the Save button actually save the entry. Use <span class="fill">localStorage</span> so the data stays even after I refresh the page. Below the form, show a table of all the entries I've saved, with the newest at the top. Add an X button on each row so I can delete entries I don't want. After saving, clear the form so I can add another.
          </div>
        </div>
        <button class="copy-btn" onclick="copyPrompt(this, '4b')">Copy Prompt</button>

        <p style="margin-top: 20px;">Replace your <kbd>tracker.html</kbd> with the new version Claude gives you. Save. Refresh your browser. Try it.</p>

        <div class="preview-frame">
          <div class="preview-titlebar">
            <span class="preview-title">tracker.html — after Step 4b</span>
          </div>
          <div class="preview-placeholder" style="padding: 0; background: #FAFAF6;">
            <svg viewBox="0 0 600 470" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;" role="img" aria-label="Illustration: a form at the top, with a table of saved entries below — each row has a delete button">
              <rect width="600" height="470" fill="#FAFAF6"/>
              <!-- Title -->
              <text x="300" y="34" text-anchor="middle" font-family="Cinzel, serif" font-size="15" letter-spacing="2" fill="#20231F">MY TRACKER</text>
              <line x1="252" y1="44" x2="348" y2="44" stroke="#6E8B7A" stroke-width="1"/>
              <!-- Compact form -->
              <text x="80" y="73" font-family="Cinzel, serif" font-size="9" letter-spacing="1.5" fill="#5A5E55">NAME</text>
              <rect x="80" y="81" width="440" height="28" rx="2" fill="#FFFFFF" stroke="#DCD7CB"/>
              <text x="92" y="99" font-family="Fraunces, serif" font-style="italic" font-size="11" fill="#8A8E83">type a name…</text>
              <text x="80" y="126" font-family="Cinzel, serif" font-size="9" letter-spacing="1.5" fill="#5A5E55">DATE</text>
              <rect x="80" y="134" width="440" height="28" rx="2" fill="#FFFFFF" stroke="#DCD7CB"/>
              <text x="92" y="152" font-family="Fraunces, serif" font-style="italic" font-size="11" fill="#8A8E83">mm/dd/yyyy</text>
              <text x="80" y="179" font-family="Cinzel, serif" font-size="9" letter-spacing="1.5" fill="#5A5E55">STATUS</text>
              <rect x="80" y="187" width="440" height="28" rx="2" fill="#FFFFFF" stroke="#DCD7CB"/>
              <text x="92" y="205" font-family="Fraunces, serif" font-style="italic" font-size="11" fill="#8A8E83">choose one…</text>
              <!-- Save button -->
              <rect x="240" y="230" width="120" height="30" rx="2" fill="#4F6B5C"/>
              <text x="300" y="250" text-anchor="middle" font-family="Cinzel, serif" font-size="10" letter-spacing="2" fill="#FAFAF6">SAVE</text>
              <!-- Divider -->
              <line x1="80" y1="290" x2="520" y2="290" stroke="#DCD7CB" stroke-width="1"/>
              <!-- Recent entries label -->
              <text x="80" y="316" font-family="Cinzel, serif" font-size="11" letter-spacing="2" fill="#4F6B5C">RECENT ENTRIES</text>
              <!-- Table header -->
              <text x="80" y="345" font-family="Cinzel, serif" font-size="9" letter-spacing="1.5" fill="#8A8E83">NAME</text>
              <text x="250" y="345" font-family="Cinzel, serif" font-size="9" letter-spacing="1.5" fill="#8A8E83">DATE</text>
              <text x="380" y="345" font-family="Cinzel, serif" font-size="9" letter-spacing="1.5" fill="#8A8E83">STATUS</text>
              <line x1="80" y1="353" x2="520" y2="353" stroke="#DCD7CB" stroke-width="1"/>
              <!-- Row 1 -->
              <text x="80" y="377" font-family="Fraunces, serif" font-size="13" fill="#2F332E">First entry</text>
              <text x="250" y="377" font-family="Fraunces, serif" font-size="13" fill="#5A5E55">May 11</text>
              <text x="380" y="377" font-family="Fraunces, serif" font-size="13" fill="#5A5E55">in progress</text>
              <text x="510" y="378" text-anchor="middle" font-family="Fraunces, serif" font-size="15" fill="#8A8E83">×</text>
              <line x1="80" y1="389" x2="520" y2="389" stroke="#E8E3D7" stroke-width="0.5"/>
              <!-- Row 2 -->
              <text x="80" y="413" font-family="Fraunces, serif" font-size="13" fill="#2F332E">Another one</text>
              <text x="250" y="413" font-family="Fraunces, serif" font-size="13" fill="#5A5E55">May 10</text>
              <text x="380" y="413" font-family="Fraunces, serif" font-size="13" fill="#5A5E55">done</text>
              <text x="510" y="414" text-anchor="middle" font-family="Fraunces, serif" font-size="15" fill="#8A8E83">×</text>
              <line x1="80" y1="425" x2="520" y2="425" stroke="#E8E3D7" stroke-width="0.5"/>
              <!-- Row 3 -->
              <text x="80" y="449" font-family="Fraunces, serif" font-size="13" fill="#2F332E">Third example</text>
              <text x="250" y="449" font-family="Fraunces, serif" font-size="13" fill="#5A5E55">May 9</text>
              <text x="380" y="449" font-family="Fraunces, serif" font-size="13" fill="#5A5E55">waiting</text>
              <text x="510" y="450" text-anchor="middle" font-family="Fraunces, serif" font-size="15" fill="#8A8E83">×</text>
            </svg>
          </div>
          <div class="preview-caption">The form stays on top. Every save appears as a new row below.</div>
        </div>

        <div class="checkwork" data-checkwork="4b">
          <div class="checkwork-mark">Check your work · Step 4b</div>
          <ul>
            <li data-id="4b-add">I added a test entry and it appeared in the table</li>
            <li data-id="4b-persist">I refreshed the browser and the entry is still there</li>
            <li data-id="4b-delete">I deleted a row with the X button and it disappeared</li>
            <li data-id="4b-clear">The form clears after I save, ready for the next entry</li>
          </ul>
        </div>

        <h3>Step 4c — Make it yours (optional)</h3>
        <p>If you have time, ask Claude to style it in your colors, add a title, change the layout. This is the optional polish. If you're running behind in class, skip ahead — the tracker works as-is.</p>

        <div class="prompt-block">
          <div class="prompt-text">
            Style this page in <span class="fill">[your colors / vibe — "soft sage and cream, like a journal"]</span>. Add a heading at the top: <span class="fill">[what to call your tracker]</span>. Add today's date next to each saved row. Don't change how the form or table work — just the look.
          </div>
        </div>
        <button class="copy-btn" onclick="copyPrompt(this, '4c')">Copy Prompt</button>

        <div class="checkwork" data-checkwork="4c">
          <div class="checkwork-mark">Check your work · Step 4c</div>
          <ul>
            <li data-id="4c-looks">It looks like something I'd actually want to use</li>
            <li data-id="4c-works">Everything still works after the restyle</li>
          </ul>
        </div>

        <div class="card card-sage">
          <div class="card-mark">If your tracker breaks</div>
          <p>It happens. Most often: a missing bracket somewhere. Don't try to find the bug yourself — paste your whole file back to Claude with the message <em>"This is the file I have, and [describe what's broken]. Please fix and give me the whole file again."</em> Claude will rewrite it. <strong>Replace, don't patch.</strong></p>
        </div>
      </section>

      <!-- ============ 05 TAKE YOUR DATA OUT · CSV ============ -->
      <section id="export-csv" class="lockable locked" data-code="STREAM">
        <div class="section-head">
          <span class="section-num">05</span>
          <span class="section-time">~ 5 minutes</span>
        </div>
        <h2>Take Your Data Out — CSV Export</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">The bridge between your tool and your assistant. One small button, one big concept.</p>

        <div class="callout">
          <div class="callout-section">
            <p class="callout-label">Where the water comes from</p>
            <p class="callout-body">CSV stands for "comma-separated values" — the simplest way to store a spreadsheet. Just text, with commas between each cell and a new line for each row. You can open it in Excel, Google Sheets, or Numbers and it looks like a normal spreadsheet. <em>You can also hand it to Claude.</em></p>
          </div>
          <div class="callout-fleuron"><span>❦</span></div>
          <div class="callout-section">
            <p class="callout-label">Why we're using CSV (and not something fancier)</p>
            <p class="callout-body">Every program that touches data understands CSV. It's the most universal format on Earth. And it's the format Claude reads best when you upload it to a Project. The trade-off: it's <em>a snapshot in time,</em> not a live connection. You'll re-export every week (or however often) to keep your assistant current. <em>Module 3 replaces this manual step with a real-time connection.</em></p>
          </div>
        </div>

        <h3>Add an Export button</h3>
        <p>Back in your Claude chat. Same conversation as before — context matters.</p>

        <div class="prompt-block">
          <div class="prompt-text">
            Add a button labeled "Download CSV" that exports all the entries from localStorage as a CSV file. Include the column headers at the top. Use today's date in the filename — for example, <span class="fill">tracker-2026-05-11.csv</span>.
          </div>
        </div>
        <button class="copy-btn" onclick="copyPrompt(this, '5')">Copy Prompt</button>

        <p style="margin-top: 20px;">Replace your file with the new version. Refresh. Click Download CSV. A file should land in your Downloads folder.</p>

        <div class="checkwork" data-checkwork="5">
          <div class="checkwork-mark">Check your work · Step 5</div>
          <ul>
            <li data-id="5-button">I see a Download CSV button on the page</li>
            <li data-id="5-download">I clicked it and a file landed in Downloads</li>
            <li data-id="5-open">I opened it in Sheets/Excel and the columns make sense</li>
          </ul>
        </div>
      </section>

      <!-- ============ 06 HIRE YOUR ASSISTANT · THE PROJECT ============ -->
      <section id="hire-assistant" class="lockable locked" data-code="HEARTH">
        <div class="section-head">
          <span class="section-num">06</span>
          <span class="section-time">~ 8 minutes</span>
        </div>
        <h2>Hire Your Assistant — The Claude Project</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">The handoff. You've built the tool. Now you teach Claude about it.</p>

        <div class="callout">
          <div class="callout-section">
            <p class="callout-label">Where the water comes from</p>
            <p class="callout-body">A Claude Project is a workspace inside Claude where you drop files Claude should always remember and write a permanent set of instructions Claude follows every time you talk to it. Every new conversation inside that Project starts with that knowledge already loaded.</p>
          </div>
          <div class="callout-fleuron"><span>❦</span></div>
          <div class="callout-section">
            <p class="callout-label">Why a Project, not just another chat</p>
            <p class="callout-body">A regular chat is like meeting a stranger at a coffee shop — you have to explain everything every time. A Project is like meeting your assistant in <em>her</em> office, where she already knows your business, your clients, your voice, and what's on your desk this week. You stop wasting the first ten minutes of every conversation getting her up to speed.</p>
          </div>
        </div>

        <h3>Step 6a — Create the Project</h3>
        <ol class="steps">
          <li><strong>Open claude.ai</strong> in a fresh tab.</li>
          <li><strong>In the sidebar, click "Projects"</strong> → then the <em>New Project</em> button.</li>
          <li><strong>Name it</strong> something specific. Not "Work." Try <em>"[Your Name]'s [Tracker Type] Assistant"</em> — e.g. <em>"Maria's Candidate Pipeline Assistant."</em></li>
          <li><strong>Skip the description for now.</strong> We'll write the real instructions in a moment.</li>
        </ol>

        <h3>Step 6b — Upload your CSV</h3>
        <p>Inside the Project, find the <em>Project Knowledge</em> area. Click <em>Add Content</em> → <em>Upload File</em>. Pick the CSV you just downloaded from your tracker.</p>

        <div class="checkwork" data-checkwork="6b">
          <div class="checkwork-mark">Check your work · Step 6b</div>
          <ul>
            <li data-id="6b-created">My Project is created and named</li>
            <li data-id="6b-uploaded">My CSV is uploaded and I can see it in Project Knowledge</li>
          </ul>
        </div>

        <h3>Step 6c — Write the system instructions</h3>
        <p>This is the most important part of the whole module. The instructions are what turn Claude from "a smart chatbot reading my data" into "my assistant who happens to use AI."</p>

        <p>In your Project, find <em>Custom Instructions</em>. Paste the template below and fill in the blanks for your business.</p>

        <div class="prompt-block">
          <div class="prompt-text">
            You are <span class="fill">[your name]</span>'s assistant. <span class="fill">[Your name]</span> runs <span class="fill">[describe your business in one sentence]</span>. The CSV in your project knowledge is her <span class="fill">[what kind of tracker — "candidate pipeline" / "client check-in log" / etc.]</span> — the most current version she has.<br><br>
            When she asks you about the data, refer to the CSV directly. Quote names and dates when relevant. If she asks for advice or a draft (an email, a follow-up, a summary), write in her voice: <span class="fill">[describe her voice in 5-10 words — "warm, direct, no fluff, lightly playful"]</span>.<br><br>
            If something in the CSV is unclear or missing, ask before assuming. If the data looks stale (the dates are old), gently mention it.
          </div>
        </div>
        <button class="copy-btn" onclick="copyPrompt(this, '6c')">Copy Template</button>

        <p style="margin-top: 20px;">Fill in the five blanks. Save. Your assistant is hired.</p>

        <div class="checkwork" data-checkwork="6c">
          <div class="checkwork-mark">Check your work · Step 6c</div>
          <ul>
            <li data-id="6c-pasted">I pasted the template into Custom Instructions</li>
            <li data-id="6c-filled">I filled in all five blanks with my own info</li>
            <li data-id="6c-saved">I saved the Custom Instructions</li>
          </ul>
        </div>
      </section>

      <!-- ============ 07 TEST YOUR ASSISTANT ============ -->
      <section id="test-assistant" class="lockable locked" data-code="SPARROW">
        <div class="section-head">
          <span class="section-num">07</span>
          <span class="section-time">~ 5 minutes</span>
        </div>
        <h2>Test Your Assistant</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">The magic moment. You're going to ask your new Project a real question about your real data. The first time you do this, it usually causes a small silence in the room. That's the feature.</p>

        <h3>Start a new chat inside your Project</h3>
        <p>From inside your Project, click <em>Start new chat</em>. This new chat has your CSV and your instructions already loaded.</p>

        <h3>Try one of these — or your own</h3>
        <p>Pick whichever fits your tracker. You can also write your own question. The point is to ask something you'd actually want to know.</p>

        <ul class="styled-list">
          <li>
            <strong>For a candidate / lead / client tracker</strong>
            <em>"Who haven't I followed up with in 30 days? Draft a short check-in email to my three oldest."</em>
          </li>
          <li>
            <strong>For a shoot log / content calendar</strong>
            <em>"What was my busiest month, and which projects am I most proud of based on the notes column?"</em>
          </li>
          <li>
            <strong>For an inventory / stock list</strong>
            <em>"What's running low? What's been sitting longest? Suggest three items I should put on sale."</em>
          </li>
          <li>
            <strong>For anything</strong>
            <em>"Summarize what you see in my data. What's the shape of my work right now? What would you flag?"</em>
          </li>
        </ul>

        <div class="answer-block">
          <div class="answer-mark">The magic moment · question</div>
          <p class="answer-prompt">What did you ask?</p>
          <textarea class="answer-input" id="claudeQuestion" data-answer="claude_question" placeholder="Type the exact question you asked your Project…"></textarea>
          <p class="answer-saved" id="claudeQuestionSaved">Saved</p>
        </div>

        <div class="answer-block">
          <div class="answer-mark">The magic moment · what Claude said</div>
          <p class="answer-prompt">Paste Claude's response, or write a sentence or two about what surprised you.</p>
          <textarea class="answer-input" id="claudeAnswer" data-answer="claude_answer" style="min-height: 140px;" placeholder="Paste the full answer here, or a couple of sentences about what stood out — &#10;the part that made you sit up, or laugh, or think 'wait, it really got me'…"></textarea>
          <p class="answer-saved" id="claudeAnswerSaved">Saved</p>
        </div>

        <div class="checkwork" data-checkwork="7">
          <div class="checkwork-mark">Check your work · Step 7</div>
          <ul>
            <li data-id="7-asked">I asked my Project a real question about my data</li>
            <li data-id="7-quoted">Claude referenced specific things from my CSV in the answer</li>
            <li data-id="7-voice">The answer sounded like an assistant who knows me, not a stranger</li>
          </ul>
        </div>

        <div class="wisdom">You didn't just get an answer. You got an assistant who has read your work and can speak in your voice. That's the leap.</div>
      </section>

      <!-- ============ 08 BEYOND ============ -->
      <section id="beyond" class="lockable locked" data-code="HORIZON">
        <div class="section-head">
          <span class="section-num">08</span>
          <span class="section-time">~ 2 minutes</span>
        </div>
        <h2>Beyond — When Your Tool Grows Up</h2>
        <div class="lock-card">
          <div class="lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 10V8a5 5 0 0110 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>
          </div>
          <p class="lock-title">This section is locked</p>
          <p class="lock-sub">Your facilitator will share the code when we arrive here.</p>
          <div class="lock-input-row">
            <input type="text" class="lock-input" placeholder="Enter code" maxlength="20" autocomplete="off" spellcheck="false" />
            <button class="lock-button" type="button">Unlock</button>
          </div>
          <p class="lock-error"></p>
        </div>

        <p class="section-deck">An honest look at what you just built, and what the next step is.</p>

        <h3>What you have now</h3>
        <ul class="styled-list">
          <li>
            <strong>A tool that holds your work</strong>
            On the device you built it on. You can add entries, delete them, export them whenever.
          </li>
          <li>
            <strong>An assistant who knows what's in it</strong>
            As of the last time you exported. You'll re-upload the CSV when you want it current. That's the manual step.
          </li>
          <li>
            <strong>A pattern you can repeat</strong>
            You can build a second tracker — for a different part of your work — in 20 minutes now. Then a third Project to assist with that.
          </li>
        </ul>

        <h3>The honest limits</h3>
        <ul class="styled-list">
          <li>
            <strong>One device per dataset</strong>
            Your laptop's tracker isn't on your phone. (You could open the same file URL on both, but the data won't sync.)
          </li>
          <li>
            <strong>You're the bridge</strong>
            You manually re-export the CSV and re-upload it. Forget for a month and your assistant gets stale.
          </li>
          <li>
            <strong>Claude can speak but not act</strong>
            It can draft the follow-up email. You still send it. It can tell you who to call. You still call.
          </li>
        </ul>

        <div class="callout callout--single">
          <div class="callout-section">
            <p class="callout-label">Where the water comes from · What's an "agent," really?</p>
            <p class="callout-body">An agent is just an AI that can <em>do things,</em> not just <em>say things.</em> A chatbot answers your question. A smart helper drafts your email. An agent <em>sends</em> the email, books the meeting, updates the tracker — without you in the middle. <em>That's Module 3.</em> What we built today is the foundation it sits on.</p>
          </div>
        </div>

        <div class="ornament">· · ·</div>

        <h3>A closing word</h3>
        <p>You walked in with a tool that started from zero every conversation. You're walking out with one that remembers — and an assistant who's read your binder. That's not nothing. That's a real change in how your work feels day to day.</p>
        <p>The first time you ask your Project a question and it answers like a colleague, something quiet happens. You stop being the bottleneck. You stop carrying everything in your head. You start trusting that the tool knows what you put in it. <em>That's the skill we just built.</em></p>

        <div class="wisdom">You are not here to replace your assistant. You are here to finally have one.</div>

        <div class="footer-note">
          Quinta &amp; Co. · Module Two · Licensed for the named attendee only.<br>
          Please do not redistribute. Module Three forthcoming.
        </div>
      </section>

      <!-- ============ SESSION SUMMARY ============ -->
      <div class="session-summary" id="sessionSummary">
        <div class="card-mark">A Final Favor</div>
        <h3>Share Your Session With Erika</h3>
        <p>This module is being refined. If you'd be willing, please tap below to copy your session log — what you saw, when, and what you tried — and paste it into a reply to Erika's email. It helps her shape the next module for you.</p>
        <p style="font-size: 13px; color: var(--text-muted); font-style: italic;">No personal information is captured beyond your name and the time you spent on the module. Nothing leaves your device unless you send it.</p>

        <div class="session-log-preview" id="sessionLogPreview">Your session log will appear here.</div>

        <div class="session-actions">
          <button class="session-button" id="copyLogBtn" type="button">Copy log to clipboard</button>
          <button class="session-button secondary" id="downloadLogBtn" type="button">Download as text file</button>
        </div>
      </div>

    </main>
  </div>

  <!-- Watermark -->
  <div class="watermark" id="watermark">Licensed · Loading</div>
</div>

<script>
  // ============================
  // CONFIG — change as needed
  // ============================
  const ACCESS_CODE = 'HEARTH2026'; // Gate code attendees enter to access the module
  // Section unlock codes — change per cohort if you like
  // (Codes are also enforced via the data-code attribute on each section)

  // ============================
  // STORAGE — graceful fallback
  // ============================
  const memStore = {};
  const storage = {
    get(k) {
      try { return localStorage.getItem(k); }
      catch (e) { return memStore[k] === undefined ? null : memStore[k]; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); }
      catch (e) { memStore[k] = v; }
    },
    remove(k) {
      try { localStorage.removeItem(k); }
      catch (e) { delete memStore[k]; }
    }
  };

  // ============================
  // EVENT LOG (for session summary)
  // ============================
  const sessionLog = {
    name: '',
    startedAt: null,
    events: [],
    sectionTime: {}, // sectionId -> total ms in viewport
    _viewStart: {},  // sectionId -> ts when entered viewport
    log(type, meta) {
      this.events.push({ ts: Date.now(), type: type, meta: meta || {} });
    },
    sectionEnter(id) {
      this._viewStart[id] = Date.now();
    },
    sectionLeave(id) {
      if (this._viewStart[id]) {
        const dt = Date.now() - this._viewStart[id];
        this.sectionTime[id] = (this.sectionTime[id] || 0) + dt;
        delete this._viewStart[id];
      }
    }
  };

  // ============================
  // ACCESS GATE
  // ============================
  const gate = document.getElementById('gate');
  const app = document.getElementById('app');
  const codeInput = document.getElementById('codeInput');
  const nameInput = document.getElementById('nameInput');
  const unlockBtn = document.getElementById('unlockBtn');
  const gateError = document.getElementById('gateError');

  function unlock() {
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (!name) {
      gateError.textContent = 'Please enter your name to continue.';
      gateError.classList.add('show');
      nameInput.focus();
      return;
    }

    if (code !== ACCESS_CODE.toUpperCase()) {
      gateError.textContent = "That code isn't quite right. Try again.";
      gateError.classList.add('show');
      codeInput.focus();
      codeInput.select();
      return;
    }

    sessionLog.name = name;
    sessionLog.startedAt = Date.now();
    sessionLog.log('module_open', { name: name });

    document.getElementById('licenseName').textContent = name;
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('licenseDate').textContent = dateStr;
    document.getElementById('watermark').textContent = `Licensed · ${name} · ${dateStr}`;

    gate.style.display = 'none';
    app.classList.add('unlocked');

    initLockables();
    updateNavLockIndicators();
  }

  unlockBtn.addEventListener('click', unlock);
  codeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { if (!nameInput.value) nameInput.focus(); else unlock(); } });
  nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') unlock(); });

  // ============================
  // SECTION LOCKING
  // ============================
  function initLockables() {
    const sections = document.querySelectorAll('section.lockable');
    sections.forEach((sec) => {
      const id = sec.id;
      const expected = (sec.dataset.code || '').toUpperCase();

      // Restore prior unlock state
      if (storage.get('unlocked:' + id) === '1') {
        sec.classList.remove('locked');
        return;
      }

      const card = sec.querySelector('.lock-card');
      if (!card) return;
      const input = card.querySelector('.lock-input');
      const button = card.querySelector('.lock-button');
      const errorEl = card.querySelector('.lock-error');

      function tryUnlock() {
        const v = (input.value || '').trim().toUpperCase();
        if (!v) { input.focus(); return; }
        if (v === expected) {
          sec.classList.remove('locked');
          storage.set('unlocked:' + id, '1');
          sessionLog.log('section_unlock', { id: id });
          updateNavLockIndicators();
          maybeShowSessionSummary();
          // Smooth scroll the section into view
          setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        } else {
          errorEl.textContent = "That code doesn't match. Try again, or ask your facilitator.";
          errorEl.classList.add('show');
          sessionLog.log('section_unlock_failed', { id: id, attempt: v });
          input.value = '';
          input.focus();
          setTimeout(() => errorEl.classList.remove('show'), 3500);
        }
      }

      button.addEventListener('click', tryUnlock);
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') tryUnlock(); });
    });
  }

  function updateNavLockIndicators() {
    const navLinks = document.querySelectorAll('.nav a');
    navLinks.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      const id = href.slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      a.classList.remove('is-locked', 'is-unlocked');
      if (target.classList.contains('lockable')) {
        if (target.classList.contains('locked')) {
          a.classList.add('is-locked');
        } else {
          a.classList.add('is-unlocked');
        }
      }
    });
  }

  // ============================
  // ANTI-CASUAL-SHARING
  // ============================
  document.addEventListener('contextmenu', (e) => {
    // Allow right-click in input fields (so they can paste codes)
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    return false;
  });

  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === 's' || k === 'p' || k === 'u')) {
      e.preventDefault();
      return false;
    }
  });

  document.addEventListener('dragstart', (e) => e.preventDefault());

  // ============================
  // NAV — active section highlighting + tracking
  // ============================
  const sections = document.querySelectorAll('main section');
  const navLinks = document.querySelectorAll('.nav a');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      if (entry.isIntersecting) {
        navLinks.forEach((l) => {
          l.classList.toggle('active', l.getAttribute('href') === '#' + id);
        });
        sessionLog.sectionEnter(id);
      } else {
        sessionLog.sectionLeave(id);
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });

  sections.forEach((s) => observer.observe(s));

  // ============================
  // PROMPT COPY BUTTONS
  // ============================
  function copyPrompt(btn, idx) {
    const block = btn.previousElementSibling;
    const text = block.innerText.replace(/\s+/g, ' ').trim();
    sessionLog.log('prompt_copy', { idx: idx, length: text.length });
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1800);
    }).catch(() => {
      const range = document.createRange();
      range.selectNode(block);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = 'Select & copy manually';
    });
  }

  // ============================
  // SETUP CHECKLIST — tappable
  // ============================
  document.querySelectorAll('#setupChecklist li').forEach((li) => {
    li.addEventListener('click', () => {
      li.classList.toggle('checked');
      sessionLog.log('checklist_toggle', { item: li.dataset.check, checked: li.classList.contains('checked') });
    });
  });

  // ============================
  // CHECK-YOUR-WORK — tappable verification boxes, persisted to localStorage
  // ============================
  const CHECKWORK_KEY = 'm2_checkwork_v1';
  function loadCheckwork() {
    try { return JSON.parse(localStorage.getItem(CHECKWORK_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveCheckwork(state) {
    try { localStorage.setItem(CHECKWORK_KEY, JSON.stringify(state)); } catch (e) {}
  }
  const checkworkState = loadCheckwork();

  document.querySelectorAll('.checkwork').forEach((box) => {
    const boxId = box.dataset.checkwork;
    box.querySelectorAll('li').forEach((li) => {
      const itemId = li.dataset.id;
      const key = boxId + '::' + itemId;
      if (checkworkState[key]) li.classList.add('checked');
      li.addEventListener('click', () => {
        li.classList.toggle('checked');
        checkworkState[key] = li.classList.contains('checked');
        saveCheckwork(checkworkState);
        sessionLog.log('checkwork_toggle', { box: boxId, item: itemId, checked: checkworkState[key] });
        // Mark complete if all items checked
        const items = box.querySelectorAll('li');
        const allChecked = Array.from(items).every((x) => x.classList.contains('checked'));
        box.classList.toggle('complete', allChecked);
      });
    });
    // Initial complete check
    const items = box.querySelectorAll('li');
    if (items.length && Array.from(items).every((x) => x.classList.contains('checked'))) {
      box.classList.add('complete');
    }
  });

  // ============================
  // SAVE-YOUR-ANSWER — persist text inputs to localStorage + session log
  // ============================
  const ANSWER_KEY = 'm2_answers_v1';
  function loadAnswers() {
    try { return JSON.parse(localStorage.getItem(ANSWER_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveAnswers(state) {
    try { localStorage.setItem(ANSWER_KEY, JSON.stringify(state)); } catch (e) {}
  }
  const answerState = loadAnswers();

  document.querySelectorAll('.answer-input').forEach((input) => {
    const key = input.dataset.answer;
    if (answerState[key]) input.value = answerState[key];
    const savedFlag = document.getElementById(input.id + 'Saved');
    let savedTimer = null;
    input.addEventListener('input', () => {
      answerState[key] = input.value;
      saveAnswers(answerState);
      if (savedFlag) {
        clearTimeout(savedTimer);
        savedFlag.classList.add('show');
        savedTimer = setTimeout(() => savedFlag.classList.remove('show'), 1500);
      }
    });
    input.addEventListener('blur', () => {
      sessionLog.log('answer_save', { key: key, length: (input.value || '').length });
    });
  });

  // ============================
  // EXAMPLE CARDS — Pick Your Thing selection
  // ============================
  const PICK_KEY = 'm2_pick_v1';
  let pickedExample = (function() {
    try { return localStorage.getItem(PICK_KEY); } catch (e) { return null; }
  })();
  document.querySelectorAll('#examplesGallery .example-card').forEach((card) => {
    if (card.dataset.example === pickedExample) card.classList.add('selected');
    card.addEventListener('click', () => {
      const id = card.dataset.example;
      document.querySelectorAll('#examplesGallery .example-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      try { localStorage.setItem(PICK_KEY, id); } catch (e) {}
      sessionLog.log('example_pick', { example: id });
    });
  });

  // ============================
  // SESSION SUMMARY
  // ============================
  function maybeShowSessionSummary() {
    // Reveal once the final section ('beyond') is unlocked
    const finalSection = document.getElementById('beyond');
    if (finalSection && !finalSection.classList.contains('locked')) {
      const summary = document.getElementById('sessionSummary');
      if (summary && !summary.classList.contains('show')) {
        summary.classList.add('show');
        renderSessionLog();
      }
    }
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function fmtDuration(ms) {
    if (ms < 60000) return Math.round(ms / 1000) + 's';
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return m + 'm ' + s + 's';
  }

  function buildSessionLogText() {
    // Flush any in-progress section view
    Object.keys(sessionLog._viewStart).forEach((id) => sessionLog.sectionLeave(id));

    const start = sessionLog.startedAt || Date.now();
    const end = Date.now();
    const total = end - start;

    let out = '';
    out += '## Module Session Log\n';
    out += `**Attendee:** ${sessionLog.name || 'Anonymous'}\n`;
    out += `**Date:** ${fmtDate(start)}\n`;
    out += `**Started:** ${fmtTime(start)}\n`;
    out += `**Last activity:** ${fmtTime(end)}\n`;
    out += `**Total session time:** ${fmtDuration(total)}\n\n`;

    out += '### Section flow\n';
    sessionLog.events.forEach((e) => {
      const t = fmtTime(e.ts);
      let label = '';
      switch (e.type) {
        case 'module_open':           label = 'Entered the module'; break;
        case 'section_unlock':        label = 'Unlocked: ' + (e.meta.id || ''); break;
        case 'section_unlock_failed': label = 'Tried to open (wrong code): ' + (e.meta.id || ''); break;
        case 'prompt_copy':           label = 'Copied a prompt (#' + (e.meta.idx + 1) + ')'; break;
        case 'checklist_toggle':      label = (e.meta.checked ? 'Checked: ' : 'Unchecked: ') + (e.meta.item || ''); break;
        default:                      label = e.type;
      }
      out += `- ${t} — ${label}\n`;
    });

    out += '\n### Time spent per section\n';
    const sortedSections = Object.entries(sessionLog.sectionTime).sort((a, b) => b[1] - a[1]);
    if (sortedSections.length === 0) {
      out += '_(no section view data captured)_\n';
    } else {
      sortedSections.forEach(([id, ms]) => {
        out += `- ${id}: ${fmtDuration(ms)}\n`;
      });
    }

    out += '\n### Engagement summary\n';
    const promptCopies = sessionLog.events.filter(e => e.type === 'prompt_copy').length;
    const failedUnlocks = sessionLog.events.filter(e => e.type === 'section_unlock_failed').length;
    const unlocked = sessionLog.events.filter(e => e.type === 'section_unlock').length;
    out += `- Sections unlocked during session: ${unlocked}\n`;
    out += `- Prompts copied: ${promptCopies}\n`;
    out += `- Failed unlock attempts: ${failedUnlocks}\n`;

    // ============================
    // WHAT SHE TYPED — the heart of the log for Erika
    // Surfaces the example she picked + every answer-block textarea
    // ============================
    let storedAnswers = {};
    let storedPick = null;
    try { storedAnswers = JSON.parse(localStorage.getItem(ANSWER_KEY) || '{}'); } catch (e) {}
    try { storedPick = localStorage.getItem(PICK_KEY); } catch (e) {}

    const exampleLabels = {
      candidates: 'Candidate Tracker',
      clients: 'Client Check-In Log',
      leads: 'Lead Pipeline',
      shoots: 'Shoot Log',
      content: 'Content Calendar',
      inventory: 'Inventory or Stock List'
    };

    const fmt = (val) => (val && val.trim()) ? val.trim() : '_(not filled in)_';

    out += '\n### What she typed\n';
    out += `**Tracker type picked:** ${storedPick ? (exampleLabels[storedPick] || storedPick) : '_(none selected)_'}\n`;
    out += `**Her description of what she's tracking:** ${fmt(storedAnswers.tracker_purpose)}\n\n`;
    out += `**The question she asked her Project:**\n> ${fmt(storedAnswers.claude_question).replace(/\n/g, '\n> ')}\n\n`;
    out += `**Claude's answer / what surprised her:**\n> ${fmt(storedAnswers.claude_answer).replace(/\n/g, '\n> ')}\n`;

    return out;
  }

  function renderSessionLog() {
    const preview = document.getElementById('sessionLogPreview');
    if (preview) preview.textContent = buildSessionLogText();
  }

  document.getElementById('copyLogBtn').addEventListener('click', function(ev) {
    const btn = ev.currentTarget;
    const text = buildSessionLogText();
    sessionLog.log('session_share');
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.dataset.originalText || btn.textContent;
      btn.dataset.originalText = original;
      btn.textContent = 'Copied — paste into your email';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 3000);
    }).catch(() => {
      const preview = document.getElementById('sessionLogPreview');
      const range = document.createRange();
      range.selectNode(preview);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    renderSessionLog();
  });

  document.getElementById('downloadLogBtn').addEventListener('click', function() {
    const text = buildSessionLogText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = (sessionLog.name || 'attendee').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `claude-module-log_${safeName}_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sessionLog.log('session_download');
  });

  // Refresh the preview every 20s if the summary is showing
  setInterval(() => {
    const summary = document.getElementById('sessionSummary');
    if (summary && summary.classList.contains('show')) renderSessionLog();
  }, 20000);

  // ============================
  // OS DETECTION — highlights cheat sheet column
  // ============================
  (function detectOS() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const plat = (navigator.platform || '').toLowerCase();
    const table = document.getElementById('cheatTable');
    const note = document.getElementById('cheatDetected');
    if (!table) return;

    const isMac = plat.includes('mac') || ua.includes('macintosh') || ua.includes('mac os');
    const isPC = plat.includes('win') || ua.includes('windows');
    const isIOS = /ipad|iphone/.test(ua);

    if (isMac || isIOS) {
      table.classList.add('detect-mac');
      if (note) note.textContent = "Looks like you're on a Mac — that column is highlighted for you.";
    } else if (isPC) {
      table.classList.add('detect-pc');
      if (note) note.textContent = "Looks like you're on a PC — that column is highlighted for you.";
    } else {
      if (note) note.textContent = 'Both columns are shown — pick the one that matches your computer.';
    }
  })();

  // Auto-focus name input on load
  window.addEventListener('load', () => {
    setTimeout(() => codeInput.focus(), 100);
  });

  // Save session log progress periodically (in case of refresh)
  setInterval(() => {
    if (sessionLog.startedAt) {
      try {
        storage.set('sessionLog', JSON.stringify({
          name: sessionLog.name,
          startedAt: sessionLog.startedAt,
          events: sessionLog.events,
          sectionTime: sessionLog.sectionTime
        }));
      } catch (e) { /* ignore */ }
    }
  }, 15000);
</script>

</body>
</html>
