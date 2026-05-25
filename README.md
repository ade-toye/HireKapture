<img width="1380" height="752" alt="New HK Logo" src="https://github.com/user-attachments/assets/19a81f56-0baf-43c6-9bf1-80c7a9487b75" />


# HireKapture

HireKapture is a Chrome extension that helps job seekers track applications across multiple platforms in one place.

Instead of manually copying job details from LinkedIn, Simplify, Greenhouse, Lever, Workday, Handshake, GitHub, and company career pages, HireKapture captures key job information and saves it directly to a connected Google Sheet.

## What it does

- Extracts job title, company name, location, salary, job type, and job link from job posting pages
- Saves application data directly to Google Sheets
- Tracks application status, deadlines, interview dates, contact info, and notes
- Detects duplicate applications to prevent repeated entries
- Supports major job boards and generic company career pages
- Uses Google OAuth for secure Google Sheets access
- Provides a clean, branded popup UI for quick review before saving

## Why I built it

I built HireKapture because I was applying to roles across many platforms, including LinkedIn, Simplify, GitHub, Handshake, and company websites. Tracking everything manually in a spreadsheet became repetitive and easy to mess up.

HireKapture solves that by letting me save job applications to my Google Sheet directly from the job posting page, while still giving me control to review and edit the details before saving.

## Tech Stack

- JavaScript
- HTML/CSS
- Chrome Extension Manifest V3
- Google Sheets API
- Google OAuth
- Google Cloud Console

## Google Sheet Format

The tracker uses 12 columns (A–L):

| Column | Field |
|--------|-------|
| A | Company Name |
| B | Job Link |
| C | Job Title |
| D | Date Applied |
| E | Deadline |
| F | Type of Job |
| G | Salary (Annual) |
| H | Contact Email / LinkedIn |
| I | Location |
| J | Application Status |
| K | Interview Date |
| L | Notes |

Create your own copy of the sheet and paste its ID into `background.js` (see Setup below).

## Setup

To use this extension yourself you need a Google Cloud project and a personal Google Sheet:

1. **Create a Google Sheet** with the 12-column format above. Copy the Sheet ID from its URL (`/spreadsheets/d/<SHEET_ID>/edit`).
2. **Create a Google Cloud project** at [console.cloud.google.com](https://console.cloud.google.com). Enable the Google Sheets API.
3. **Create OAuth credentials** → "OAuth 2.0 Client ID" → Application type: "Chrome Extension". Add your unpacked extension's Chrome ID.
4. **Clone this repo** and fill in your values in two files:
   - `background.js` line 3: replace `YOUR_SHEET_ID_HERE` with your Sheet ID.
   - `manifest.json`: replace `YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com` with your OAuth client ID.
5. Load the extension in Chrome at `chrome://extensions` → "Load unpacked".

## Current Status

HireKapture is still actively being improved. I am releasing updates periodically to make the scraping, duplicate detection, Google Sheets integration, and overall user experience more efficient.

My goal is to have it running smoothly for my friends and me in time for recruiting season, so we can track applications faster and stay more organized across different job platforms.
