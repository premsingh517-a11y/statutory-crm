# NeuSource Statutory CRM — Auditor Appointment

Team portal for NeuSource executives: save client and CA firm details once, then generate
auditor appointment documents on letterhead (Word .docx) with the e-Form ADT-1 data sheet.

**Cases covered** (16)
1. Auditor — First Auditor (Sec 139(6)), Appointment at AGM (Sec 139(1)), Casual Vacancy (Sec 139(8)) → ADT-1
2. Director — Appointment (Sec 152 / 161, DIR-2, DIR-8, MBP-1) and Resignation (Sec 168) → DIR-12
3. Annual filing — Board's Report (Rule 8 / 8A) with AOC-2, AGM notice with MGT-11, resolutions, shareholder list → AOC-4, MGT-7 / 7A
4. Share capital — Rights issue & allotment with SH-1 certificates (Sec 62(1)(a)) → PAS-3; Increase in authorised capital (Sec 61) → SH-7; Share transfer SH-4 (Sec 56)
5. ROC — Shifting of registered office (Sec 12) → INC-22; Commencement of business (Sec 10A) → INC-20A; DPT-3; MSME-1
6. Strike off (Sec 248(2)) with STK-3, STK-4 and statement of accounts → STK-2; LLP Form 11 & Form 8; Registers (MGT-1, Register of Directors & KMP)

**Smart defaults:** AGM number (from the last AGM in the client master, or from the date of incorporation), AGM date (30 September, or the earlier due date),
AGM notice (21 clear days before), Board meeting and its notice, EGM dates, offer periods etc. are filled automatically. They are shown with a light
gold background and can be changed; changing one date updates the dates that depend on it.

**Excel import:** Clients page → "Excel template", fill one company per row, then "Import from Excel". Existing CINs are skipped or updated.

**Letterheads and signatures**
- Upload a Word (.docx) letterhead for each CA firm and each company. Documents are generated inside it — same header, footer, logo and margins.
  Put the letterhead in the Word header if it should repeat on every page.
- Upload a signature image for each director (client master) and for a new director (appointment case). It is printed above the name.

**Built with:** Node.js 20+, Express, PostgreSQL, `docx` (Word files are made on the server).

---

## Features

- Login for every team member. **Admin** and **Executive** roles.
- One shared client list and CA firm list for the whole team (stored in PostgreSQL).
- Meeting details are auto-saved per client and per case, so anyone in the team can continue the work.
- Client-first workflow: open a client from **Clients**, pick a case and download the documents. Each case shows its compliance timeline (Board meeting within 30 days, ADT-1 within 15 days, 21-day notice, etc.).
- **Edit Templates** (admin): change the wording of any document per case and option, with `{{placeholders}}` filled from the client, CA firm and case details. "Reset to standard" brings back the built-in wording.
- Preview every document before downloading. Download one Word file, or all of them in a ZIP.
- Company letterhead and CA letterhead (with logo), or blank space for pre-printed letterhead.
- Admin only: delete records, add and disable team members, reset passwords, activity log, data backup.

## Project structure

```
server.js                 Express server, login, API, Word download
lib/db.js                 PostgreSQL connection and tables (created automatically)
lib/docx-builder.js       Builds the .docx files (letterhead, tables, page numbers)
public/js/docs-content.js Wording of all documents + deadlines (used by server AND browser preview)
public/js/app.js          Frontend (clients, client workspace, CA firms, templates, team, activity)
public/css/app.css        NeuSource theme (maroon #8A1412, gold #E6A65A, green #28A745)
public/index.html         Page shell
render.yaml               One-click Render setup (web app + database)
```

To change the wording of any document, edit `public/js/docs-content.js`. Preview and Word files both update.

## Logo

The header shows `public/img/logo.png` if you add it. If that file is not there, it loads the logo from
neusourcestartup.com, and if that also fails it shows the text "NeuSource".
For best results, put your logo (PNG, transparent or white background, ~300 px wide) at `public/img/logo.png`.

---

## Run on your computer (no database to install)

Without a `DATABASE_URL`, the portal uses a **built-in database** saved in the `data` folder.

**Windows (easiest)**
1. Install **Node.js LTS** from nodejs.org (one time).
2. Unzip this project, then double-click **`START.bat`**.
   The first run installs packages (needs internet, about a minute), then the portal opens at http://localhost:3000.
3. Create the admin account on the first screen.
4. Keep the black window open while using the portal. Close it to stop.

**Mac / Linux**
```
npm install
npm start
```
then open http://localhost:3000.

**Team use in the office:** other computers on the same Wi-Fi/LAN can open `http://<this-computer's-IP>:3000`
(find the IP with `ipconfig` on Windows). Windows may ask to allow Node.js through the firewall — allow it for private networks.

**Your data** is in the `data` folder. Back it up by copying that folder (with the portal closed),
or use **Team & Access → Download data backup**. Do not delete the `data` folder.

Using your own PostgreSQL instead: set `DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/neusource_crm` before starting.

## Deploy for FREE (Render free app + Neon free database)

**Step 1 — Free database (Neon)**
1. Sign up at neon.tech (free plan) and create a project (region: Singapore or Mumbai if available).
2. Copy the **connection string** — it looks like
   `postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

**Step 2 — Code on GitHub**
1. Create a new repository on GitHub.
2. Click "uploading an existing file", drag all files and folders from this project (not the ZIP itself), and commit.

**Step 3 — Free app (Render)**
1. On render.com: **New → Blueprint →** choose the repository → it reads `render.yaml`.
2. When asked for `DATABASE_URL`, paste the Neon connection string → **Apply**.
3. When the deploy finishes, open the `...onrender.com` link and create the admin account.
4. Go to **Team & Access** and add your executives.

**Free plan limits (check current terms on each website):**
- Render free apps go to sleep after some minutes without visitors; the first visit after that takes about a minute to wake up.
- Neon free plan has a storage limit, which is plenty for client masters and meeting details (logos take the most space).
- Download a backup from **Team & Access → Download data backup** regularly.

Paid setup later: change `plan: free` to a paid plan in `render.yaml` (or in the Render dashboard) so the app never sleeps.

## Backups

Admins can download a JSON backup from **Team & Access → Download data backup**.
Neon also keeps a short history of your database (see Neon's restore options).

## Security notes

- Passwords are stored hashed (bcrypt). Sessions are stored in the database; cookies are HTTP-only and secure in production.
- Repeated wrong passwords are blocked for 15 minutes.
- Disabling a team member logs them out immediately.

## Disclaimer

Document wording follows the Companies Act 2013, the Companies (Audit and Auditors) Rules 2014,
ICSI Secretarial Standards and ICAI requirements as understood at the time of writing.
All drafts must be reviewed by a Chartered Accountant / Company Secretary before signing or filing.
