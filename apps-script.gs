/* DJ Training — Google Sheet receiver for the workout + food logs.
   Paste this into Extensions > Apps Script on a Google Sheet, then deploy it as a Web App.
   See README.md "Google Sheet sync" section for the full step-by-step.

   IMPORTANT when upgrading: redeploy via Deploy > Manage deployments > edit (pencil) >
   Version: New version — that KEEPS the existing /exec URL. A brand-new deployment would
   mint a different URL than the one pasted into the phone.

   v3: dedup by entry id. Both the phone ("End Day") and Claude (server-side export) can
   push the same rows — whichever arrives second gets skipped, so a row can never appear
   twice no matter the ordering or how stale either side's bookkeeping is. The sheet itself
   is the one place both writers converge, so it's the only race-free spot for this check.
   Old rows (pre-v3, blank Id) are left alone and never counted in the dedup set.
   v2: files workout/food rows into separate "Workouts"/"Food" tabs.
   v1 back-compat: a bare {rows:[...]} body is still accepted as workout rows. */

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);
  const now = new Date();
  let added = 0, skipped = 0;

  const workoutRows = data.workoutRows || data.rows || [];
  if (workoutRows.length) {
    const r = appendUnique(ss, "Workouts",
      ["Date", "Day", "Exercise", "Weight (lb)", "Sets", "Reps", "Synced At", "Id"],
      workoutRows, r => [r.date, r.day, r.exercise, r.weight, r.sets, r.reps, now, r.id || ""]);
    added += r.added; skipped += r.skipped;
  }

  const foodRows = data.foodRows || [];
  if (foodRows.length) {
    const r = appendUnique(ss, "Food",
      ["Date", "Food", "Calories", "Protein (g)", "Carb (g)", "Fat (g)", "Synced At", "Id"],
      foodRows, r => [r.date, r.n, r.kcal, r.p, r.c, r.f, now, r.id || ""]);
    added += r.added; skipped += r.skipped;
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, added: added, skipped: skipped }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendUnique(ss, name, headers, rows, toRow) {
  const sheet = getOrCreateSheet(ss, name, headers);
  const idCol = ensureIdColumn(sheet, headers);
  const seen = new Set();
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, idCol, last - 1, 1).getValues().forEach(v => {
      const id = String(v[0]).trim();
      if (id) seen.add(id);
    });
  }
  let added = 0, skipped = 0;
  rows.forEach(r => {
    if (r.id && seen.has(String(r.id))) { skipped++; return; }
    sheet.appendRow(toRow(r));
    if (r.id) seen.add(String(r.id));
    added++;
  });
  return { added: added, skipped: skipped };
}

function ensureIdColumn(sheet, headers) {
  const idCol = headers.length; // Id is always the last header
  const width = sheet.getLastColumn();
  if (width < idCol || String(sheet.getRange(1, idCol).getValue()).trim() !== "Id") {
    sheet.getRange(1, idCol).setValue("Id"); // pre-v3 tab: add the missing header cell
  }
  return idCol;
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}
