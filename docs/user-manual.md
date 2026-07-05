# User Manual — DoCC M&E Monitoring Platform (DMP)

**For:** DoCC officers, project managers, and field staff using the MERL
Dashboard for the Vanuatu Loss and Damage Fund Development Project.

This manual covers day-to-day use. Administrator tasks (creating users,
managing projects) are in the [Administrator Manual](admin-manual.md).

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [Your Role and What You Can See](#2-your-role-and-what-you-can-see)
3. [Dashboard](#3-dashboard)
4. [Projects](#4-projects)
5. [Datasets — Uploading Data](#5-datasets--uploading-data)
6. [Dataset Approval Workflow](#6-dataset-approval-workflow)
7. [Analysis and Maps](#7-analysis-and-maps)
8. [Reports](#8-reports)
9. [Language: English / French](#9-language-english--french)
10. [Getting Help](#10-getting-help)

---

## 1. Logging In

You need: a modern web browser (Chrome, Edge, Firefox, or Safari), the
platform address, and the username and password given to you by the system
administrator.

1. Open the platform address in your browser.
2. Enter your username and password and press **Sign in**.
3. If your account has MFA (multi-factor authentication) enabled, enter the
   6-digit code from your authenticator app.

**Forgotten password?** Use the reset link on the login page, or contact the
system administrator to send you a reset email.

**Log out** with the button at the bottom of the sidebar when finished,
especially on shared computers.

## 2. Your Role and What You Can See

The sidebar only shows the modules your role can access:

| Role | Dashboard | Projects | Datasets | Analysis | Reports | Admin |
|---|---|---|---|---|---|---|
| System Administrator | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| DoCC Senior Officer | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| DoCC M&E Officer | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Project Manager | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Field Staff | — | — | ✔ | ✔ | — | — |

If you believe you have the wrong role, contact the system administrator.

## 3. Dashboard

The Dashboard is the landing page for office-based roles. It shows:

- **KPI cards** — headline totals for the L&D Fund project.
- **Indicator progress** — achievement toward targets, drawn from approved
  data only.
- **Trend charts** — indicator values over reporting periods.
- **Recent activity** — latest uploads, approvals, and events.

Data updates automatically as new datasets are approved — no refresh needed.

## 4. Projects

Lists the projects configured on the platform with their RBM results chain
— goal, outcomes, outputs, activities, and indicators (with baselines and
targets). Use it to check which indicator a dataset should feed before
uploading.

## 5. Datasets — Uploading Data

Open **Datasets** and press **Upload**. Three kinds of input are supported:

### 5.1 CSV / Excel files

For bulk indicator data (`.csv`, `.xlsx`, `.xls`):

1. Choose the file (or drag it onto the upload area).
2. The platform reads the columns and proposes a mapping to indicator
   fields — check each column is matched correctly.
3. Fix any rows flagged red (missing values, wrong data types) — either in
   the preview or by correcting the file and re-uploading.
4. Press **Submit**. The dataset enters the approval queue (§6).

Keep one header row, one record per row. Include the disaggregation columns
(sex, age, disability, location) wherever the indicator requires them —
submissions without required disaggregation are rejected by the reviewer.

### 5.2 Photos and documents (evidence)

Field photos (`.jpg`, `.png`), PDF reports, and signed community agreements
can be attached as **Means of Verification** and linked to an indicator.
Add a caption and date; GPS coordinates are recorded when available. Files
are stored privately — only logged-in users with access to the project can
open them.

### 5.3 Manual entry forms

For single indicator updates, use the on-screen form: choose the indicator,
reporting period, value, disaggregation fields, and location, then submit.
An internet connection is required.

## 6. Dataset Approval Workflow

Every submitted dataset goes through review before it counts:

```
 submitted ──► under review ──► approved ✔ (data appears everywhere)
                     │
                     └────────► returned ✖ (fix and resubmit)
```

- Reviewers (M&E Officers and above) receive an in-app notification when
  you submit.
- You receive a notification when your dataset is approved or returned;
  returned datasets show the reviewer's comment explaining what to fix.
- Approved data feeds the Dashboard, Analysis, and Reports immediately.

## 7. Analysis and Maps

The **Analysis** module lets you:

- Plot indicator trends across reporting periods (line/bar charts).
- **Disaggregate** results by sex, age, disability, or location to check
  GEDSI reach.
- View the **map** (Leaflet): loss & damage events, community engagements,
  and indicator coverage by province/island. Zoom with the +/− controls or
  pinch on touch screens; click/tap a marker for details; toggle layers
  with the layer control.

## 8. Reports

The **Reports** module generates documents aligned to DoCC and MFAT
reporting templates:

1. Choose the report type and reporting period.
2. Preview on screen.
3. Download as **PDF** (for circulation/signature) or **Excel** (for
   further analysis).

Reports only include approved data, so generate them after the relevant
datasets have cleared review.

## 9. Language: English / French

Use the language switcher (EN/FR) in the header to change the interface
language at any time. Your choice is remembered on that browser.

## 10. Getting Help

1. **Returned dataset or data question** → your M&E Officer.
2. **Cannot log in / wrong role / MFA problems** → the system
   administrator (see admin-manual.md §2).
3. **Something looks broken** → note what you did, the time, and take a
   screenshot if possible; report it to the system administrator so it can
   be raised in the issue tracker.
