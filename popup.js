// Runs in the popup window.

const SAVE_TIMEOUT_MS = 20000; // 20 s safety net
const STORAGE_KEY     = "hirekapture_savedLinks"; // chrome.storage.session

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[POPUP] Opened.");
  prefillDateApplied();
  await prefillFromTab();

  document.getElementById("job-form").addEventListener("submit", handleSubmit);
  document.getElementById("save-anyway-btn").addEventListener("click", onSaveAnywayClick);
  document.getElementById("dismiss-dup-btn").addEventListener("click", hideDuplicatePanel);
});

// ── Prefill today's date ─────────────────────────────────────────────────────
function prefillDateApplied() {
  document.getElementById("dateApplied").value = new Date().toISOString().split("T")[0];
}

// ── Prefill form from the current tab ────────────────────────────────────────
async function prefillFromTab() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (err) {
    console.warn("[POPUP] tabs.query failed:", err.message);
    return;
  }
  if (!tab?.url) return;

  console.log("[POPUP] Tab URL:", tab.url);
  document.getElementById("jobLink").value = tab.url;

  // Non-blocking session duplicate check on open
  checkSessionDuplicate(tab.url);

  // Inject content script, then read extracted data
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__jobTrackerData || null,
    });
    const d = results?.[0]?.result;
    console.log("[POPUP] Page data:", d);
    if (d) {
      setIfNotEmpty("jobTitle",  d.jobTitle);
      setIfNotEmpty("company",   d.companyName);
      setIfNotEmpty("location",  d.location);
      setIfNotEmpty("salary",    d.salary);
      setIfNotEmpty("deadline",  d.deadline);
      if (d.jobType) {
        const sel = document.getElementById("jobType");
        // Only set if the value is one of the dropdown options
        const opts = [...sel.options].map(o => o.value);
        if (opts.includes(d.jobType)) sel.value = d.jobType;
      }
<<<<<<< HEAD
      setIfNotEmpty("notes", d.notes);
=======
>>>>>>> 675c2d1c226b107a5b9f477145ac0a9d53d557f5
      if (d.platform && d.platform !== "Other") showPlatformBadge(d.platform);
    }
  } catch (err) {
    console.warn("[POPUP] Content script injection skipped:", err.message);
  }
}

function setIfNotEmpty(fieldId, value) {
  if (value?.trim()) document.getElementById(fieldId).value = value.trim();
}

// ── Platform badge ───────────────────────────────────────────────────────────
function showPlatformBadge(platform) {
  const badge = document.getElementById("platform-badge");
  badge.textContent = "⬡  " + platform;
  badge.classList.remove("hidden");
}

// ── Session-level duplicate check (local, no API) ────────────────────────────
async function checkSessionDuplicate(url) {
  const saved = await getSessionLinks();
  if (saved.includes(url)) {
    showStatus("error", "You already saved a job from this URL this session.");
  }
}

async function getSessionLinks() {
  try {
    const r = await chrome.storage.session.get(STORAGE_KEY);
    return r[STORAGE_KEY] || [];
  } catch (_) { return []; }
}

async function recordSessionLink(url) {
  const saved = await getSessionLinks();
  if (!saved.includes(url)) {
    saved.push(url);
    await chrome.storage.session.set({ [STORAGE_KEY]: saved });
  }
}

// ── Form submit handler ──────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearStatus();
  hideDuplicatePanel();
  console.log("[POPUP] Save button clicked.");
  await performSave(collectFormData(), false);
}

// ── Save Anyway (bypasses duplicate check) ────────────────────────────────────
async function onSaveAnywayClick() {
  hideDuplicatePanel();
  clearStatus();
  console.log("[POPUP] Save Anyway clicked.");
  await performSave(collectFormData(), true);
}

// ── Core save flow ───────────────────────────────────────────────────────────
async function performSave(data, forceOverride) {
  let settled = false;

  // Safety-net timeout — button NEVER stays stuck forever
  const timeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      setButtonState("idle");
      showStatus("error",
        "Timed out after 20 s. Open chrome://extensions → Service Worker to see background errors."
      );
      console.error("[POPUP] performSave timed out.");
    }
  }, SAVE_TIMEOUT_MS);

  try {
    // ── Step 1: duplicate check (skip if forceOverride) ────────────────────
    if (!forceOverride) {
      setButtonState("checking");
      let dupResult = null;
      try {
        dupResult = await sendMessage({ type: "CHECK_DUPLICATE", data });
        console.log("[POPUP] Duplicate check:", dupResult);
      } catch (dupErr) {
        // A failed check must not block saving
        console.warn("[POPUP] Duplicate check failed — proceeding to save:", dupErr.message);
      }

      if (dupResult?.isDuplicate) {
        clearTimeout(timeoutId);
        settled = true;
        setButtonState("idle");
        showDuplicatePanel(dupResult);
        return;
      }
    }

    // ── Step 2: save ────────────────────────────────────────────────────────
    setButtonState("saving");
    console.log("[POPUP] Sending SAVE_JOB:", data);
    const saveResult = await sendMessage({ type: "SAVE_JOB", data });
    console.log("[POPUP] Save result:", saveResult);

    clearTimeout(timeoutId);
    settled = true;

    if (saveResult?.success) {
      await recordSessionLink(data.jobLink);
      setButtonState("success");
      const statusLabel = data.status || 'Applied';
      showStatus("success", `Saved to Google Sheets as ${statusLabel}.`);
      resetFormAfterSave(data.jobLink);
    } else {
      setButtonState("idle");
      showStatus("error", buildErrorMessage(saveResult?.error));
    }

  } catch (err) {
    if (!settled) {
      clearTimeout(timeoutId);
      settled = true;
      setButtonState("idle");
      showStatus("error", "Unexpected error: " + err.message);
      console.error("[POPUP] performSave threw:", err);
    }
  }
}

// ── Collect all form values ──────────────────────────────────────────────────
function collectFormData() {
  return {
    company:       document.getElementById("company").value.trim(),
    jobLink:       document.getElementById("jobLink").value.trim(),
    jobTitle:      document.getElementById("jobTitle").value.trim(),
    dateApplied:   document.getElementById("dateApplied").value,
    deadline:      document.getElementById("deadline").value,
    jobType:       document.getElementById("jobType").value,
    salary:        document.getElementById("salary").value.trim(),
    contact:       document.getElementById("contact").value.trim(),
    location:      document.getElementById("location").value.trim(),
    status:        document.getElementById("status").value,
    interviewDate: document.getElementById("interviewDate").value,
    notes:         document.getElementById("notes").value.trim(),
  };
}

// ── Reset form after successful save ─────────────────────────────────────────
function resetFormAfterSave(jobLink) {
  document.getElementById("job-form").reset();
  document.getElementById("jobLink").value = jobLink;
  prefillDateApplied();
}

// ── Duplicate panel ──────────────────────────────────────────────────────────
function showDuplicatePanel(dupResult) {
  const panel  = document.getElementById("duplicate-panel");
  const detail = document.getElementById("dup-detail");

  const company = dupResult.company || '';
  const title   = dupResult.title   || '';

  if (dupResult.reason === "exact-url") {
    detail.textContent = "This exact URL is already in your tracker.";
  } else if (dupResult.reason === "normalized-url") {
    detail.textContent = "A very similar link is already saved (differs only in tracking parameters).";
  } else if (dupResult.reason === "company-title") {
    const label = [company, title].filter(Boolean).join(" — ");
    detail.textContent = label
      ? `"${label}" is already in your tracker.`
      : "A job with the same company and title is already saved.";
  } else {
    detail.textContent = "This job may already be in your tracker.";
  }

  panel.classList.remove("hidden");
}

function hideDuplicatePanel() {
  document.getElementById("duplicate-panel").classList.add("hidden");
}

// ── Button state machine ─────────────────────────────────────────────────────
function setButtonState(state) {
  const btn     = document.getElementById("save-btn");
  const text    = document.getElementById("btn-text");
  const spinner = document.getElementById("btn-spinner");

  btn.disabled = false;
  btn.classList.remove("btn-success", "btn-error");
  spinner.classList.add("hidden");

  switch (state) {
    case "idle":
      text.textContent = "Save to Google Sheet";
      break;
    case "checking":
      text.textContent = "Checking...";
      spinner.classList.remove("hidden");
      btn.disabled = true;
      break;
    case "saving":
      text.textContent = "Saving...";
      spinner.classList.remove("hidden");
      btn.disabled = true;
      break;
    case "success":
      text.textContent = "Saved!";
      btn.classList.add("btn-success");
      btn.disabled = true;
      setTimeout(() => setButtonState("idle"), 3000);
      break;
    case "error":
      text.textContent = "Save to Google Sheet";
      btn.classList.add("btn-error");
      setTimeout(() => btn.classList.remove("btn-error"), 1800);
      break;
  }
}

// ── Status banner ────────────────────────────────────────────────────────────
function showStatus(type, message) {
  const banner = document.getElementById("status-banner");
  banner.className = `status-banner ${type}`;
  banner.textContent = (type === "success" ? "✓  " : "✕  ") + message;
}

function clearStatus() {
  const banner = document.getElementById("status-banner");
  banner.className = "status-banner hidden";
  banner.textContent = "";
}

// ── User-facing error messages ───────────────────────────────────────────────
function buildErrorMessage(msg) {
  if (!msg) return "An unknown error occurred.";
  if (msg.includes("401") || msg.includes("Unauthorized"))
    return "Sign-in required — click Save again to re-authenticate.";
  if (msg.includes("403") || msg.includes("Forbidden"))
    return "Permission denied — ensure your Google account has edit access to the sheet.";
  if (msg.includes("400") || msg.includes("Bad Request") || msg.includes("range"))
    return msg; // background.js provides a detailed message with instructions
  if (msg.includes("404"))
    return "Sheet not found — check SHEET_ID in background.js.";
  if (msg.includes("NetworkError") || msg.includes("Failed to fetch"))
    return "Network error — check your internet connection and try again.";
  return msg;
}

// ── Promisified sendMessage ──────────────────────────────────────────────────
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
