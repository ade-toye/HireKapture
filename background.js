// Service worker — handles OAuth, duplicate detection, and Google Sheets saves.

const SHEET_ID   = "YOUR_SHEET_ID_HERE"; // Paste your Google Sheet ID (from its URL)
const SHEET_NAME = "Sheet1";
// ↑ CHANGE THIS if your sheet tab has a different name.
// Open the sheet and look at the tab label at the bottom of the page.

// ── Message router ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  if (message.type === "SAVE_JOB") {
    console.log("[BG] SAVE_JOB received:", message.data);
    handleSaveJob(message.data)
      .then(result  => { console.log("[BG] SAVE_JOB success"); sendResponse({ success: true, result }); })
      .catch(err    => { console.error("[BG] SAVE_JOB failed:", err.message); sendResponse({ success: false, error: err.message }); });
    return true;
  }

  if (message.type === "CHECK_DUPLICATE") {
    console.log("[BG] CHECK_DUPLICATE received:", message.data?.jobLink);
    checkDuplicateJob(message.data)
      .then(result  => { console.log("[BG] CHECK_DUPLICATE result:", result); sendResponse({ success: true, ...result }); })
      .catch(err    => {
        // A failed duplicate check must NOT block saving — return isDuplicate: false
        console.warn("[BG] CHECK_DUPLICATE failed (non-blocking):", err.message);
        sendResponse({ success: false, isDuplicate: false, error: err.message });
      });
    return true;
  }
});

// ── OAuth token ─────────────────────────────────────────────────────────────
async function getAuthToken() {
  console.log("[BG] Requesting OAuth token...");
  const result = await new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (tokenOrDetails) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tokenOrDetails);
      }
    });
  });
  // Chrome 105+ returns { token, grantedScopes }; older versions return a plain string.
  const token = (typeof result === 'object' && result !== null) ? result.token : result;
  if (!token) throw new Error("OAuth: no token returned. Ensure the extension ID is registered in Google Cloud Console.");
  console.log("[BG] OAuth token obtained.");
  return token;
}

function removeCachedToken(token) {
  if (!token) return;
  const t = (typeof token === 'object') ? token.token : token;
  if (t) chrome.identity.removeCachedAuthToken({ token: t }, () => {});
}

// ── Save job to Google Sheets ────────────────────────────────────────────────
async function handleSaveJob(data) {
  const token = await getAuthToken();
  await appendRowToSheet(token, data);
}

async function appendRowToSheet(token, data) {
  // Column order must match the sheet exactly (12 columns A–L):
  // Company Name | Job Link | Job Title | Date Applied | Deadline |
  // Type of Job | Salary (Annual) | Contact Email/LinkedIn |
  // Location | Application Status | Interview Date | Notes
  const row = [
    data.company       ?? '',
    data.jobLink       ?? '',
    data.jobTitle      ?? '',
    data.dateApplied   ?? '',
    data.deadline      ?? '',
    data.jobType       ?? '',
    data.salary        ?? '',
    data.contact       ?? '',
    data.location      ?? '',
    data.status        ?? '',
    data.interviewDate ?? '',
    data.notes         ?? '',
  ];

  console.log("[BG] Appending row:", row);

  const range = encodeURIComponent(SHEET_NAME) + "!A:L";
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  console.log("[BG] Sheets API URL:", url);

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });

  const body = await resp.text();
  console.log(`[BG] Sheets API response ${resp.status}:`, body);

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) removeCachedToken(token);
    throw new Error(buildSheetError(resp.status, body));
  }
  return JSON.parse(body);
}

// ── Duplicate detection ─────────────────────────────────────────────────────
async function checkDuplicateJob(data) {
  const token = await getAuthToken();
  // Read only columns A–C (Company, Job Link, Job Title) — minimal API data
  const range = encodeURIComponent(SHEET_NAME) + "!A:C";
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 401 || resp.status === 403) removeCachedToken(token);
    throw new Error(`Sheet read failed ${resp.status}: ${body}`);
  }

  const sheetData = await resp.json();
  const rows = (sheetData.values || []).slice(1); // skip header row

  const incomingUrl  = (data.jobLink  || '').trim();
  const incomingNorm = normalizeUrl(incomingUrl);
  const incomingCo   = (data.company  || '').toLowerCase().trim();
  const incomingRole = (data.jobTitle || '').toLowerCase().trim();

  for (const row of rows) {
    const rowCo    = (row[0] || '').toLowerCase().trim();
    const rowLink  = (row[1] || '').trim();
    const rowRole  = (row[2] || '').toLowerCase().trim();

    if (rowLink && rowLink === incomingUrl) {
      return { isDuplicate: true, reason: 'exact-url', company: row[0], title: row[2] };
    }
    if (rowLink && normalizeUrl(rowLink) === incomingNorm) {
      return { isDuplicate: true, reason: 'normalized-url', company: row[0], title: row[2] };
    }
    if (incomingCo && incomingRole && rowCo === incomingCo && rowRole === incomingRole) {
      return { isDuplicate: true, reason: 'company-title', company: row[0], title: row[2] };
    }
  }

  return { isDuplicate: false };
}

// ── URL normalization (strips tracking params) ───────────────────────────────
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term',
     'ref','referer','referrer','source','trackingId','tracking_id',
     'sid','cid','currentJobId','trk','trkInfo','gh_src'].forEach(p => u.searchParams.delete(p));
    u.searchParams.sort();
    return u.origin + u.pathname + (u.search.length > 1 ? u.search : '');
  } catch (_) { return url; }
}

// ── Human-readable API errors ────────────────────────────────────────────────
function buildSheetError(status, body) {
  if (status === 401) return (
    '401 Unauthorized — token was rejected. Make sure this extension\'s Chrome ID is ' +
    'registered in your Google Cloud OAuth client, then reload the extension and try again.'
  );
  if (status === 403) return (
    '403 Forbidden — your Google account does not have edit access to this sheet.'
  );
  if (status === 400) return (
    `400 Bad Request — the sheet range was rejected. ` +
    `Your tab is probably not named "${SHEET_NAME}". ` +
    `Open the sheet, check the tab name at the bottom, and update SHEET_NAME in background.js. ` +
    `Detail: ${body}`
  );
  if (status === 404) return `404 Not Found — check SHEET_ID in background.js. Current: ${SHEET_ID}`;
  return `Sheets API error ${status}: ${body}`;
}
