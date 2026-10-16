# NeuSource Statutory CRM — Auditor Appointment

Team portal for NeuSource executives: save client and CA firm details once, then generate
auditor appointment documents on letterhead (Word .docx) with the e-Form ADT-1 data sheet.

**Cases covered**
1. First Auditor — Board appoints within 30 days of incorporation (Sec 139(6))
2. Appointment at AGM — 5-year term (Sec 139(1))
3. Casual Vacancy — resignation (with EGM) or other reason (Sec 139(8))

**Built with:** Node.js 20+, Express, PostgreSQL, `docx` (Word files are made on the server).

---

## Features

- Login for every team member. **Admin** and **Executive** roles.
- One shared client list and CA firm list for the whole team (stored in PostgreSQL).
- Meeting details are auto-saved per client and per case, so anyone in the team can continue the work.
- Dashboard with deadlines: Board meeting within 30 days, ADT-1 within 15 days, 21-day notice, members' approval within 3 months, ADT-3, first AGM.
- Preview every document before downloading. Download one Word file, or all of them in a ZIP.
- Company letterhead and CA letterhead (with logo), or blank space for pre-printed letterhead.
- Admin only: delete records, add and disable team members, reset passwords, activity log, data backup.

## Project structure

```
server.js                 Express server, login, API, Word download
lib/db.js                 PostgreSQL connection and tables (created automatically)
lib/docx-builder.js       Builds the .docx files (letterhead, tables, page numbers)
public/js/docs-content.js Wording of all documents + deadlines (used by server AND browser preview)
public/js/app.js          Frontend (dashboard, generate, clients, CA firms, team, activity)
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

## Run on your computer

1. Install **Node.js 20 or newer** and **PostgreSQL**.
2. Create a database:
   ```
   createdb neusource_crm
   ```
3. In the project folder:
   ```
   npm install
   cp .env.example .env        (edit DATABASE_URL and SESSION_SECRET)
   ```
4. Start:
   ```
   DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/neusource_crm SESSION_SECRET=anything npm start
   ```
   (On Windows PowerShell set the variables with `$env:DATABASE_URL="..."` first.)
5. Open http://localhost:3000 — the first screen asks you to create the **admin** account.

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
