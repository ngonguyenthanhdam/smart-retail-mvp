# RetailSense AI

A retail operations application for a small chain of stores, with demand forecasting and replenishment decision support. The current version provides authentication, administration, product catalog, store pricing, purchase orders and receiving, sales with automatic lot consumption, operating expenses, inventory by location and lot, CSV/XLSX imports, historical reporting, calendar-month quantity forecasts, reviewed replenishment drafts and inventory alerts. The October upgrade adds Vietnamese screens, local product illustrations, an image-based sales counter and a versioned quantity-model training workflow. Forecasting accuracy and ordering quality on real RetailSense quantities are not established.

This is a **local graduation-project demonstration**. Start with [Local setup](#local-setup), use [Daily operation](#daily-operation) to run an installed copy, and follow [Demonstration walkthrough](#demonstration-walkthrough) for the presentation. [Backup and recovery](#backup-and-recovery), [Troubleshooting](#troubleshooting) and [Handover checklist](#handover-checklist) cover maintenance and delivery.

Forecast screens display approximate quantities (whole counted units, one decimal for fractional units), an average per calendar day and revenue rounded to the nearest thousand VND. Stored quantities, prices and transaction precision remain unchanged. Unit labels come from product configuration. Replenishment and inventory alerts use illustrated product cards with reasons and explicit actions: review/adjust/reject, confirm a separate purchase draft, inspect lots, or open recommendations for that store and SKU. Counters cover all filtered pages; alerts prioritize open/high-severity conditions. Refresh alerts to evaluate current stock; the initial detection time is not a last-checked timestamp. No database migration is needed for this display update.

## Architecture

```text
Next.js frontend → NestJS backend → PostgreSQL
                         └───────→ FastAPI service
```

The backend is a modular monolith responsible for business rules and database access. The separate Python service serves experimental quantity forecasts. AI Center starts a bounded Python training process on explicit request and queries local Ollama through authorized, read-only business tools.

| Component | Stack |
| --- | --- |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, Prisma |
| Database | PostgreSQL 17 |
| Model service | Python 3.11, FastAPI, Uvicorn |
| Development | Local processes, npm, Git / GitHub |

## Repository

```text
frontend/           Authentication, retail operations, import center and dashboard
backend/            Business modules, authorization, migrations and database access
ml-service/         Offline demand experiments and model service
.env.example        Backend environment template
Setup-SmartRetail.bat First-time Windows installation (double-click once)
Setup-AI.bat         Optional one-time Ollama + Qwen3 4B installation
setup-ai.ps1         Verified local model setup; does not change retail data
setup.ps1           Download tools, install dependencies and initialize local configuration
scripts/            Windows setup/runtime helpers and pinned download manifest
Start-SmartRetail.bat Windows development launcher (double-click)
start-dev.ps1       Launcher checks and service consoles
```

## Local setup

### Automatic setup on Windows 10/11 (64-bit Intel/AMD)

1. Clone or download and **extract the complete repository** to a writable local folder, for example `D:\RetailSense`. Keep the project in that folder after installation; Python virtual environments and local database paths are tied to it.
2. With an Internet connection, double-click **`Setup-SmartRetail.bat`**. Wait for **SMART RETAIL SETUP COMPLETE**. The first run downloads the required tools and libraries; leave its window open. If Windows requests approval for the Microsoft Visual C++ runtime, approve that installer. The rest of setup runs in the current user account.
3. Open **`.local\first-login.txt`** in the project folder for the initial `admin` account and its randomly generated password. Keep this file private. Each new installation gets different database passwords, an ADMIN password and a JWT secret.
4. Double-click **`Start-SmartRetail.bat`** to open [localhost:3000](http://localhost:3000). Use only this launcher for daily operation; setup is not required every time.

Setup installs project-local Node.js 22 (including npm), Python 3.11, PostgreSQL 17 and Mailpit. It runs `npm ci` for both applications, creates the Python virtual environment, installs the pinned runtime and offline-training requirements, checks the included model artifacts, applies migrations and builds both applications. Tools and downloads live under ignored `.local/`; it does not require Node, Python, PostgreSQL, Docker, winget or Git to already be installed. Git is only needed if you choose to clone/update using Git commands. The download URLs and SHA-256 checksums are pinned in [the Windows tool manifest](scripts/windows-tools.json); downloads come from the [Node.js distribution](https://nodejs.org/dist/), [CPython's documented NuGet distribution](https://docs.python.org/3.11/using/windows.html#the-nuget-org-packages), [PostgreSQL's Windows binary distributor](https://www.postgresql.org/download/windows/) and [Mailpit releases](https://github.com/axllent/mailpit/releases/tag/v1.31.2). A missing Visual C++ runtime uses the signed [Microsoft installer](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).

The new application database contains **three roles and one ADMIN only**. No stores, products, inventory, sales or synthetic history are added. A separate empty `retailsense_test` database is created for developer tests; it is not the application database. Create stores, accounts, units, categories and products through the website, or import your own history. Forecasting will require sufficient confirmed sales history; an empty database cannot demonstrate forecasts immediately. Setup never trains or replaces the included models.

PostgreSQL listens on loopback only. Setup chooses an unused port between **5432 and 5442** and writes it into private `backend/.env`; daily startup uses that same port. Frontend, backend, model service and local mail retain ports **3000, 3001, 8000, 1025 and 8025**. An unrelated listener on those ports must be stopped by its owner before launching; no process is killed automatically. Mailpit keeps password-recovery emails on this machine, visible at [localhost:8025](http://localhost:8025).

If a download or dependency install fails, fix the reported error and run the **same setup file again**. Verified downloads are cached, unchanged Node dependencies are reused, and applied migrations are not repeated. Existing configuration, ADMIN passwords and business data are preserved. Setup refuses to replace an existing database whose matching configuration is missing, or to clear a partially initialized data directory. Logs are in `.local\setup.log`; do not publish private configuration or the first-login file. Stop application service commands before rerunning setup after dependency/schema updates. Re-cloning into a new folder is a new installation; preserve/restore a database backup separately if existing data is needed.

For a read-only prerequisite check, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -CheckOnly`. The source package must include the `.bat`, `.ps1`, `scripts/` and application directories together. `docs/` is not needed. macOS/Linux continue to use the manual instructions below; the automatic installer targets Windows only.

### Manual installation

Prerequisites: Node.js 22.13 or later in the 22.x line, npm, Python 3.11, and PostgreSQL 17 running locally. Each application runs in its own terminal.

### 1. PostgreSQL

Install PostgreSQL using the [official download page](https://www.postgresql.org/download/). On Windows, add its `bin` directory to PATH or run the commands below from that directory. Start the local PostgreSQL service and use port `5432` unless another instance already occupies it.

Create a dedicated development role and database using an administrative PostgreSQL account:

```sh
createuser --host localhost --port 5432 --username postgres --pwprompt retailsense
createdb --host localhost --port 5432 --username postgres --owner retailsense retailsense
```

`createuser` prompts for the new role's password. Use that password in `DATABASE_URL`; do not use a superuser account for the application. Skip creation if this role/database already exists.

If this checkout already has a project-local installation under `.local/postgresql/`, its role and database have been initialized. From the repository root on Windows, manage that instance with:

```powershell
& .\.local\postgresql\pgsql\bin\pg_ctl.exe -D .\.local\postgresql\data -l .\.local\postgresql\server.log start
& .\.local\postgresql\pgsql\bin\pg_isready.exe -h localhost -p 5432
# Run when you want to stop the database:
& .\.local\postgresql\pgsql\bin\pg_ctl.exe -D .\.local\postgresql\data -m fast stop
```

The binaries, database files, and local credentials under `.local/` are excluded from Git. The automatic Windows setup creates this installation on a fresh clone; manual installations must provision PostgreSQL themselves. Keep an existing `backend/.env` when it already contains the matching local credentials. If automatic setup chose another port, use the port from `DATABASE_URL` for manual PostgreSQL commands.

### 2. Backend

For a fresh setup, copy the environment template from the repository root:

```powershell
Copy-Item .env.example backend/.env
```

On macOS or Linux, use `cp .env.example backend/.env`. Edit `backend/.env` so `DATABASE_URL` matches the local role, password, database, and port. URL-encode reserved password characters. This private file is ignored by Git. Do not overwrite an existing configuration.

Prisma CLI and the NestJS process both read `backend/.env`. The `PORT` variable controls the backend HTTP port; `ML_SERVICE_URL` points to the local Python service. Set these authentication variables before starting:

| Variable | Value |
| --- | --- |
| `JWT_SECRET` | Random secret of at least 32 bytes |
| `JWT_EXPIRES_IN` | `8h` by default; supported range `1s` to `24h` |
| `FRONTEND_ORIGIN` | `http://localhost:3000` |
| `NODE_ENV` | `development` locally |
| `INITIAL_ADMIN_USERNAME` | Initial administrator username |
| `INITIAL_ADMIN_EMAIL` | Initial administrator email |
| `INITIAL_ADMIN_PASSWORD` | Private password between 12 and 72 UTF-8 bytes |
| `INITIAL_ADMIN_FULL_NAME` | Administrator display name |

Generate a JWT secret locally and paste it into the private environment file:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

```sh
cd backend
npm ci
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

The fifteen migrations create 19 business tables: `roles`, `locations`, `users`, `categories`, `units`, `products`, `store_products`, `inventory_lots`, `purchase_orders`, `purchase_order_items`, `sales`, `sale_items`, `expenses`, `import_jobs`, `forecast_runs`, `demand_forecasts`, `replenishment_recommendations`, `sales_history_coverage`, and `inventory_alerts`, plus the `v_inventory_balance` and `v_sales_daily_facts` views and Prisma's migration history. AI Center adds seven separate metadata tables: `ai_datasets`, `ai_dataset_files`, `ai_training_jobs`, `ai_deployments`, `ai_chat_sessions`, `ai_chat_messages`, and `ai_audit_events`. The authentication seed creates the three roles and one ADMIN with a bcrypt password hash. Running it again preserves the existing administrator and password; changing the bootstrap identity does not create another administrator. It does not create stores or staff accounts. Application and seed connections use UTC; screens and business-date filters use Vietnam time.

### Products and inventory demo

ADMIN manages categories, units and the global product catalog under **Products**. Use **Store settings** to select a store and configure its products. Managers manage only their assigned store; staff can view sellable products and basic stock. Product/lot costs are visible to ADMIN and the manager of the relevant store, and omitted from staff responses.

Inventory shows the sum of lot quantities, including expired physical stock. Configured products without lots show zero. Low stock means quantity is less than or equal to the store minimum. Lot details show FEFO ordering for expiry-tracked products and FIFO ordering otherwise. Expiry uses Vietnam business dates; `INVENTORY_EXPIRY_WARNING_DAYS` defaults to 7 (valid range 0–365). A lot expires after its expiry date ends. Inventory screens remain read-only; receiving and sales update lot quantities transactionally. Expired stock is excluded from sales even though it remains part of physical stock.

Optional small demo, run from `backend/` after migrations:

```sh
npm run seed:demo
```

This creates two sample stores, two categories, three units, three products, four store configurations and five lots with reserved `RETAIL-*` codes. The seed runs in one transaction and preserves existing records on rerun, including edited quantities and expiry dates. It creates no accounts, purchase documents or sales. Assign a manager/staff account to a sample store using **Người dùng** when testing those roles. The normal authentication seed remains separate. Sample dates are relative to the first run; rerunning does not refresh or replenish existing lots.

Category deactivation is blocked while active child categories or products remain. Move or deactivate them first. Product base units cannot change after inventory or transaction references exist; purchase units cannot change after purchase references exist. Received lots link to their purchase item through a foreign key. Older/demo lots retain a nullable source reference.

### Retail operations

1. Create an active store, category, units and product. The product ratio is the number of base units in one purchase unit. Configure the store's selling price under **Products → Store settings**.
2. Open **Purchases**, create a draft for the location, enter quantities in purchase units and costs per purchase unit. Enter expiry dates for tracked products; lot numbers are optional and generated on receipt when omitted. Save the draft, review its details, then choose **Receive goods → Confirm**.
3. Open **Inventory** to see the received base quantities and lots. For example, two boxes at 25.00 per box with a ratio of 12 add 24 base units at 2.08 cost each. Receipt uses the draft's stored conversion, even if the product ratio later changes. Costs are rounded HALF_UP to two decimals.
4. Open **Sales**, select products and base-unit quantities, optionally enter one invoice discount, and confirm. ADMIN selects a STORE; manager/staff use their assigned store. Prices come from current store settings. Discount cannot exceed subtotal; item discounts are zero. Stock consumption and invoice creation either both commit or both roll back.
5. Open **Expenses** to record an amount, date, type and description. Managers record only their own store's expenses. ADMIN can select a location or company-wide expense. STAFF cannot access purchases or expenses.

Tracked products consume non-expired lots by earliest expiry, then receipt date and ID (FEFO). Other products consume non-expired lots by oldest receipt date and ID (FIFO). A sale may consume multiple lots. COGS is the sum of consumed base quantities multiplied by lot costs, rounded to two decimals per sale line. Historical sale prices and COGS remain fixed. STAFF responses omit costs. An insufficient-stock or concurrent-update response leaves no partial invoice or stock change; refresh before trying again. If a connection fails during completion, check Sales history before retrying.

Purchase drafts may be edited or cancelled; received/cancelled orders are immutable. Receipt rejects already-expired goods and requires dates for tracked products. Completed sales cannot be edited, cancelled or restored to inventory in this release. `VOIDED` is retained only as a database status. No manual stock adjustment, returns, payments, customer management or accounting ledger is included.

| Endpoint | Behavior |
| --- | --- |
| `GET /purchases`, `GET /purchases/:id` | Scoped purchase history and details |
| `POST /purchases`, `PATCH /purchases/:id` | Create or replace a draft; backend calculates conversions and totals |
| `POST /purchases/:id/receive`, `POST /purchases/:id/cancel` | Receive atomically or cancel a draft |
| `GET /sales`, `GET /sales/:id`, `POST /sales` | Scoped invoice history/details and atomic sale completion |
| `GET /expenses`, `GET /expenses/:id`, `POST /expenses`, `PATCH /expenses/:id` | Scoped operating expense management |

Transaction lists support `search`, `locationId`, `from`, `to`, `page`, and `pageSize`; purchases/sales also accept their document `status`, and expenses accept `expenseType`. Date filters are inclusive Vietnam business dates in `YYYY-MM-DD` form. Purchase writes accept `locationId`, an ISO `orderedAt` timestamp, optional `note`, and 1–100 `items` containing `productId`, `purchaseQuantity`, `unitCost`, optional `lotNumber` and `expiryDate`. Sales accept `locationId`, optional `discountAmount`, and 1–100 distinct product lines with `productId` and `quantity`. Quantities allow four decimal places and money allows two; derived base quantities that need more than four decimal places are rejected. Do not supply prices, totals, COGS or status on sale creation.

The development command generates the Prisma client and watches TypeScript source files. The backend verifies the database connection before listening. Use `npm run prisma:status` to check migration status. Migrations are applied with `migrate deploy`, so the application role does not need permission to create a shadow database.

### 3. Frontend

In a separate terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign in with the administrator username or email and the password configured above. Use **Cửa hàng** to create a store, then **Người dùng** to create individual manager/staff accounts assigned to that store. The interface defaults to Vietnamese; product illustrations are served locally. The forecasting and demonstration sections below cover calendar-month forecasts and the sales counter.

The frontend defaults to `http://localhost:3001`. For another address, copy `frontend/.env.example` to `frontend/.env.local`, set `NEXT_PUBLIC_API_URL`, and restart the development server or rebuild. Use `localhost` consistently for the browser and API; mixing it with `127.0.0.1` prevents the intended local cookie behavior. Keep the backend `FRONTEND_ORIGIN` equal to the browser origin.

### Import existing data

Only ADMIN can use **Import Data**. Create the referenced stores, categories and units first. Choose an import type, download its CSV header template, fill it with business codes, and upload CSV or XLSX. Review recognized columns, row counts, sample data and errors before selecting **Confirm valid import**. Closing the review leaves it pending; **Cancel import** ends it without business writes. History retains the importer, filename, type, status, row counts and errors.

Files are limited to 2 MB and 1,000 data rows, with at most 100 lines per sales/purchase document. CSV must be UTF-8 with comma separators; XLSX must contain one worksheet and literal cells, without formulas or rich-text cells. Use text cells for identifiers with leading zeros. Dates use `YYYY-MM-DD`; transaction timestamps can also use ISO format with an explicit timezone. An Excel date cell is interpreted as a calendar date. Quantities allow four decimal places and money two. Use `true`/`false` for booleans.

| Type | Required columns | Behavior |
| --- | --- | --- |
| Products | `sku`, `name`, `category_code`, `base_unit_code`, `purchase_unit_code` | Create new products; reject existing SKU/barcode. Optional barcode, ratio, default cost, expiry tracking, shelf life and active status appear in the template. |
| Historical sales | `sale_reference`, `store_code`, `sale_date`, `product_sku`, `quantity`, `unit_price`, `cost_of_goods_sold` | COGS is the **total cost of the line**, required even when zero. Optional `discount_amount` is one invoice discount, repeated consistently on every line and applied once. |
| Opening inventory | `store_code`, `product_sku`, `lot_number`, `quantity_on_hand`, `unit_cost`, `received_date` | Base-unit quantities/costs; expiry-tracked products also require `expiry_date`. Reject any store/product pair with existing lots, even depleted lots. Multiple distinct lots for a new pair are allowed. |
| Historical purchases | `purchase_reference`, `location_code`, `ordered_at`, `status`, `product_sku`, `purchase_quantity`, `unit_cost` | Only RECEIVED/CANCELLED. RECEIVED also requires source `base_quantity` and `received_at`. Cost is per purchase unit. CANCELLED may omit base quantity, using current conversion for the cancelled line only. Optional lot and expiry fields follow the template. |
| Expenses | `expense_type`, `amount`, `expense_date` | The seven existing expense types only. Optional `location_code` is blank for company-wide expenses; optional `description`. |

One invalid sales/purchase line rejects its entire document; other valid documents in that file can still import. Repeated document headers must agree, and references must not already exist. Other import types validate each row. A critical failure rolls back all business writes from that confirmation. Underlying data is checked again before confirmation; if it changed, upload again for a new preview.

Historical sales and purchases never change current inventory. They link to their import job and show **Historical import** in transaction details. Imported purchases cannot be edited, cancelled or received through the live workflow. Load opening stock separately; existing stock is never merged or overwritten. Opening/history expiry dates can be in the past but cannot precede receipt. Historical records can reference existing inactive products/locations; opening stock requires active stores/products. Product import does not configure store selling prices: use **Products → Store settings** before live sales.

Exact file bytes are hashed with SHA-256 for each import type. COMPLETED/PARTIAL files cannot be imported again under another filename. A changed file still undergoes identifier validation; expenses have no business reference, so only exact-file duplication is detected for expenses. Preview expires after 30 minutes or a backend restart; re-uploading the same PENDING/FAILED file refreshes that job. At most 20 previews are held in memory. A cancelled job is recorded as FAILED with a cancellation explanation. If confirmation loses its response, refresh history before retrying.

| Endpoint | Behavior |
| --- | --- |
| `GET /imports/templates` | Column definitions, required fields and instructions |
| `POST /imports/preview` | Multipart `file` and `importType`: PRODUCT, SALE, INVENTORY, PURCHASE or EXPENSE |
| `GET /imports` | Paginated history; optional `importType` |
| `GET /imports/:id` | Results/errors and an available pending preview |
| `POST /imports/:id/confirm` | `{ "previewToken": "..." }` from the reviewed preview; atomically imports its valid data |
| `POST /imports/:id/cancel` | Empty JSON object; cancels a pending import |

### Business dashboard

ADMIN sees global metrics or a selected store; managers see only their assigned store. STAFF has no management dashboard. Choose Today, Last 7 days, Last 30 days or a custom inclusive range up to 366 days. The backend enforces scope and date boundaries. `GET /reports/dashboard` accepts `from`, `to` and ADMIN's optional `locationId`.

Revenue sums completed invoice totals after discount and excludes VOIDED sales. COGS sums stored sale-item costs. Gross profit is revenue minus COGS; **Estimated operating profit** also subtracts recorded operating expenses. Both profit values can be negative. Global expenses include every location and company-wide costs; a selected store includes only that store's costs.

Daily revenue includes dates without sales as zero. Top products rank by quantity sold. ADMIN's comparison always shows all stores for the selected dates, with revenue, quantity and gross profit; company-wide expenses are not allocated to stores. Inventory cards show current physical quantity/value, active products, low-stock store/product pairs, expired lots and lots expiring today through the next seven days. These current values do not follow the historical date filter, and physical stock includes expired lots. Depleted lots do not count as expiry warnings.

Reporting reads operational PostgreSQL data. The daily facts view allocates invoice discount cents proportionally across lines so allocations sum exactly to the invoice discount; stored item discounts remain zero. Training datasets are managed separately in AI Center; they do not appear in operational reports. Reporting does not schedule imports or run forecasts.

### Authentication and authorization

| Endpoint | Behavior |
| --- | --- |
| `POST /auth/login` | Accepts `{ "identifier": "...", "password": "..." }`; returns safe account details and sets an HttpOnly cookie |
| `GET /auth/me` | Returns the current account, role, and assigned location; requires authentication |
| `POST /auth/logout` | Expires the cookie and returns HTTP 204 |
| `POST /auth/forgot-password` | Accepts `{ "email": "..." }`; returns the same confirmation for known and unknown accounts |
| `POST /auth/reset-password` | Accepts `{ "token": "...", "newPassword": "..." }`; consumes a valid reset token and changes the password |

Identifiers match the stored username or email exactly after trimming surrounding whitespace. Inactive, deleted, unknown, or invalid accounts receive the same login error. Every protected request reloads the account, role, and location assignment from PostgreSQL. No password hash or token appears in the JSON response. Cookies use `SameSite=Lax` and become `Secure` with `NODE_ENV=production`.

ADMIN can access the chain. STORE_MANAGER and STAFF require exactly one STORE assignment. Managers see their store's operations; staff see Products, Inventory, and Sales. All backend routes require authentication unless explicitly marked public. Future controllers can use `@Roles(...)` and `@CurrentUser()`; store queries must use `resolveLocationScope(currentUser, requestedLocationId)` to enforce assignment. Frontend menu visibility is only a navigation aid.

Logout clears the browser cookie. This version uses a single expiring JWT without server-side session revocation. A password reset also clears the current browser cookie; separately held JWTs expire normally. Deactivation blocks protected requests immediately because account status is checked on every request. Role/store changes also take effect on the next protected request.

### Local password-recovery email

Password recovery uses Nodemailer and configurable SMTP. The local demo uses [Mailpit](https://github.com/axllent/mailpit/releases/tag/v1.31.2) as an inbox on this machine, without external email delivery. Download the native binary for your system; on Windows extract `mailpit-windows-amd64.zip` into `.local/mailpit/`. This directory and mailbox data are excluded from Git.

From the repository root, run Mailpit in its own terminal:

```powershell
& .\.local\mailpit\mailpit.exe --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --allowed-hosts localhost,127.0.0.1 --database .local/mailpit/mailpit.db --disable-version-check --smtp-disable-rdns
```

Use these values in the private `backend/.env`:

```dotenv
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=no-reply@retailsense.local
```

Open [the local inbox](http://localhost:8025), request a reset from the login page, and open the link in the received message. A token expires after 30 minutes, can be used once, and is replaced by a newer request. Only its SHA-256 hash is stored in PostgreSQL. A new password must contain at least eight characters and at most 72 UTF-8 bytes. Inactive or deleted accounts cannot reset passwords.

Reset links place their token after `#` so it is not sent in the page URL to the web server. The form consumes it into memory and removes it from the address bar; reopen the email link if the page is reloaded before completion. API responses never contain the token or password hash.

For an actual email provider, change the SMTP host/port, sender, and credentials. Use `SMTP_SECURE=true` for direct TLS (usually port 465); other non-local SMTP connections require STARTTLS. Keep certificate validation enabled. Automated tests replace the mail sender and do not send email.

### Location administration

ADMIN manages stores and the central warehouse from **Stores** (`/stores`). The screen supports search, type/status filters, pagination, creation, editing, and activation/deactivation. Deactivation requires confirmation and preserves the record.

| Endpoint | Access and behavior |
| --- | --- |
| `GET /locations` | ADMIN; paginated list with `search`, `type`, `status`, `page`, `pageSize` |
| `GET /locations/:id` | ADMIN; manager/staff can read only their assigned store |
| `POST /locations` | ADMIN; create a store or central warehouse |
| `PATCH /locations/:id` | ADMIN; edit details or active status |

Location writes accept `code`, `name`, `locationType` (`STORE` or `CENTRAL_WAREHOUSE`), optional `address`, `district`, `city`, and `isActive`. Code is unique. List responses contain `{items, total, page, pageSize}`; page size defaults to 20 and is limited to 100. Status accepts `all`, `active`, or `inactive`. Soft-deleted records are excluded.

There can be at most one active central warehouse. A location cannot be deactivated while active accounts are assigned to it. Transfer or deactivate those accounts first. A store cannot become a warehouse while a manager or staff account remains assigned, even if that account is inactive. Concurrent conflicting changes return HTTP 409 so the administrator can refresh and retry.

### User administration

Only ADMIN can access **Users** (`/users`) or its APIs. The screen supports search, role/status filters, pagination, creation, editing and activation/deactivation. Username is fixed after creation. Password is entered only when creating an account; later password changes use the recovery flow.

| Endpoint | Behavior |
| --- | --- |
| `GET /users` | Paginated list; `search`, `role`, `status`, `page`, `pageSize` filters |
| `GET /users/:id` | Account detail without password or reset-token fields |
| `POST /users` | Create an account with a bcrypt-hashed initial password |
| `PATCH /users/:id` | Edit full name, email, fixed role, assigned location or active status |

Creation accepts `username`, `email`, `fullName`, `password`, `role`, `locationId`, and optional `isActive` (defaults to true). The three roles are `ADMIN`, `STORE_MANAGER`, and `STAFF`. ADMIN can have no assigned location; manager/staff must have exactly one STORE. New assignments, role changes requiring a store, and account reactivation require an active, non-deleted store. The form offers only active stores. An inactive account may retain an inactive store while its contact details are edited.

When promoting a manager/staff account to ADMIN, omitting `locationId` clears its store assignment. Changing ADMIN to manager/staff requires a valid store. Roles themselves cannot be created or edited. An administrator cannot deactivate or demote their own account, and the last active administrator is protected. Deactivation preserves records and requires confirmation. Email changes and deactivation invalidate outstanding password-reset links.

Username and email are unique, including cross-column collisions that would make username/email login ambiguous. Duplicates return HTTP 409; invalid fields or assignments return 400. Password/reset fields never appear in administration responses. There are no public registration or DELETE endpoints.

### 4. Model service

In another terminal on Windows:

```powershell
cd ml-service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-inference.txt
.\.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

On macOS or Linux, replace `.\.venv\Scripts\python` with `.venv/bin/python`. If the virtual environment already exists, skip its creation. The service keeps the original research model for legacy requests and loads the active quantity-model version for website requests. It exposes `GET /health`, `GET /model-info` and `POST /predict`. Health is a liveness check; if model loading fails, prediction returns `MODEL_UNAVAILABLE` without internal paths or traces. The service listens on loopback and does not connect to PostgreSQL. Offline preparation/training commands are documented below.

### Quantity forecasts and store-history training

The website now uses a versioned model on quantity scale. The current M5 benchmark selected **RollingMean28** over trained LightGBM and SeasonalNaive using a chronological validation split. LightGBM remains saved as a candidate; do not describe current predictions as LightGBM output. Independent test period WAPE is 34.15% at 30 days and 43.31% at 90 days on the fixed 60-series M5 subset. These are error measures, not accuracy percentages or evidence for this project's stores or kg/can products.

Read [quantity training/activation commands](ml-service/QUANTITY_FORECASTING.md) and [the evaluation report](ml-service/reports/quantity_forecasting_report.md). Original normalized FreshRetailNet research is retained separately below.

Existing installations should back up their database, apply additive migrations with `npm run prisma:migrate` in `backend`, rebuild both applications and restart services. The catalog migration changes only matching original sample labels, retaining UUIDs, user edits and provenance. It does not reset data. New sample names use Vietnamese and codes `FC-*` / `RETAIL-*`.

For a new installation, `npm run seed:forecast-demo -- --end-date 2026-09-26` creates reproducible synthetic history for three stores and 12 products. The end date must be before today; an existing seed retains its original dates. Sample history is explicitly marked synthetic and does not establish real-world accuracy. No inventory is created by this history seed. Never rerun with a later date to pretend missing observations exist.

On **Dự báo bán hàng**, ADMIN selects a store and one or three complete calendar months after the history cutoff month. For example a September 26 origin produces separate October, November and December totals. Managers see only their own store; STAFF cannot access forecasts. Each forecast records its method, version, data source, cutoff, daily points and monthly totals. Revenue assumes the store price captured at run time stays constant. Monthly quantity is rounded to four decimals and revenue to two decimals.

The data panel shows eligible/skipped products. ADMIN confirms historical completeness for each store/product/date range, including genuine no-sale days. Only confirmed dates without invoices become zeros; missing unconfirmed history is never silently filled. At least 30 continuous recent days are required for inference. Imported or POS history can be used once covered. CSV export excludes synthetic histories by default and feeds the offline train/evaluate/version/activate workflow; the forecast button does not retrain. Default long-horizon training needs 308 days per eligible series; shorter evaluation must be explicitly chosen and provides less evidence.

| Endpoint | Behavior |
| --- | --- |
| `GET /forecasts/data` | Scoped coverage, origin and eligibility |
| `POST /forecasts/data/coverage` | ADMIN confirmation of complete historical date ranges |
| `GET /forecasts/data/export` | ADMIN CSV snapshot, checksum; synthetic excluded by default |
| `GET /forecasts/data/model` | Current quantity model and evaluation metadata |
| `POST /forecasts/runs` | ADMIN; horizonMonths 1 or 3 and optional locationId |
| `GET /forecasts/runs`, `GET /forecasts/runs/:id` | Scoped run history, monthly results and daily series |
| FastAPI `POST /predict` | STORE_HISTORY, dated quantities, horizon 1–124 days; up to 100 pairs |

Failed runs persist a safe error code with no forecast rows. Interrupted runs are failed on restart. Refresh run history after an ambiguous network failure. This remains a synchronous, single-instance local MVP. Legacy SYNTHETIC_DEMO requests and the old research/backtest reports remain for comparison and do not describe the current operational method.

### Replenishment and inventory alerts

The workflow is **Dự báo bán hàng → Đề xuất nhập hàng → Human decision → Purchase draft → Explicit receiving**. No purchase is placed automatically. ADMIN and store-scoped managers review recommendations; STAFF has no access.

A completed one- or three-month run can support replenishment when its saved daily points cover the next 30 days from today. The quantity is summed from those days, not obtained by treating every calendar month as 30 days. Old runs with missing dates must be refreshed from complete history. Recommendations preserve the demand, stock and safety-stock snapshot used at creation.

`recommended = max(0, next 30-day demand + safety stock - usable stock - confirmed incoming)`

Counted units round a positive recommendation up to a whole unit. Usable stock excludes expired lots and undated lots that require expiry tracking. A DRAFT purchase is an unconfirmed intention and is not deducted as incoming stock; the current purchase workflow has no confirmed-order/ETA state. Review existing drafts before ordering again. The dashboard inventory total still describes physical stock; the sales counter uses sellable stock.

Accept, adjust with a reason, or reject each recommendation. A positive approved amount can create one linked purchase draft, converting to whole purchase units with ceiling rounding. Receiving that draft uses the existing atomic stock workflow. Identical decisions/creation retries return the existing state. Managers remain scoped to their store on every backend write.

Alerts evaluate when explicitly refreshed, after forecast completion or recommendation generation. Stockout uses complete next 30-day predictions when available and falls back to the configured minimum stock threshold otherwise. Overstock requires a complete next 90-day series. Expiry warnings need no model. Conditions that disappear resolve the existing alert; there is no background scheduler or notification delivery.

| Endpoint | Behavior |
| --- | --- |
| `GET /replenishment`, `GET /replenishment/:id` | Scoped snapshots and linked purchase |
| `POST /replenishment/generate` | Completed run with adequate daily coverage |
| `POST /replenishment/:id/decision` | ACCEPTED/ADJUSTED/REJECTED; adjustment needs quantity and reason |
| `POST /replenishment/:id/purchase` | Reviewed unitCost; creates or returns one linked DRAFT |
| `GET /alerts`, `POST /alerts/evaluate` | Scoped list and synchronous reevaluation |

### Vietnamese sales counter and illustrations

STAFF uses an individual account assigned to one store to view products, prices, stock and sales history. The counter offers product pictures, name/SKU/barcode search, category filters, quantity controls, a cart and confirmation before saving. Whole-unit settings reject fractions; weight-based units can accept them. The backend fixes selling prices, checks price changes at checkout and prevents STAFF from applying manual invoice discounts. Saving an invoice and consuming eligible stock is atomic; a repeated checkout reference returns the saved invoice without consuming stock again.

Local WebP assets provide a retail hero and 12 category illustrations. No user image collection or paid runtime image API is required. These are category illustrations, not exact branded SKU photographs.

Chatbox is deferred. Promotion campaigns, payment-provider integration, receipt printing and returns/void-with-restock are not part of this upgrade. A manager's manual invoice discount is not a promotion campaign.

### Offline data preparation and EDA

FreshRetailNet-50K is used separately for demand-forecast research. It is never loaded into operational PostgreSQL. From `ml-service/`:

```powershell
.\.venv\Scripts\python -m pip install -r requirements-eda.txt
.\.venv\Scripts\python -m src.dataset
.\.venv\Scripts\python -m unittest discover -s tests -v
.\.venv\Scripts\python -m src.eda
```

The downloader verifies the pinned publisher revision and SHA-256 hashes in `dataset_manifest.json`. It downloads approximately 115 MB to ignored `data/raw/freshretailnet-50k/`. Preparation writes approximately 66 MB under ignored `data/processed/freshretailnet-50k/`; allow several GB of available RAM for the full 4.85-million-row Pandas analysis. The runtime requirements stay separate from the offline analysis dependencies.

Read [the EDA report](ml-service/reports/eda_report.md) for measured coverage, quality checks, feature rules and proposed evaluation dates. [The JSON summary](ml-service/reports/eda_summary.json) and [overview chart](ml-service/reports/eda_overview.png) are reproducible analysis outputs. Preparation creates daily features and eligibility labels; it does not train a model or enable web forecasting.

The source target is globally normalized sales, not directly identified physical units. Stockouts can suppress observed sales, and the official eval period contains only seven days. Operational unit conversion and longer-horizon reliability require further validation. Do not multiply these raw normalized values by store selling prices.

Dataset attribution: Dingdong-Inc, [FreshRetailNet-50K](https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); Wang et al., [2025 technical report](https://arxiv.org/abs/2505.16319). Raw data remains unchanged; the cleaned copy and derived features are local transformations.

### Offline model comparison

The [training report](ml-service/reports/training_report.md) compares Seasonal Naive and LightGBM using chronological, fixed-origin forecasts. LightGBM was selected on seven-day validation and refitted through June 25, 2024, before the final seven-day test. Test WAPE is **34.1745%**, compared with **41.8314%** for the baseline. MAE/RMSE and the separate 30-day validation results are recorded in [training_results.json](ml-service/reports/training_results.json).

The selected [model artifact](ml-service/models/demand_model.joblib) and [metadata](ml-service/models/model_metadata.json) are retained with the source; other candidate models and large prediction files are not. The model uses only lags, prior rolling means, weekday and month. It predicts recursively without using actual target-period sales. Period-total gains are modest and period-total RMSE is worse than the baseline; the report documents this limitation.

To reproduce after data preparation, run from `ml-service/`:

```powershell
.\.venv\Scripts\python -m pip install -r requirements-training.txt
.\.venv\Scripts\python -m unittest discover -s tests -v
.\.venv\Scripts\python -m src.train --report-dir data/processed/reproduction/reports --model-dir data/processed/reproduction/models
```

Use fresh output directories; the training command refuses to replace existing reports/model artifacts. Reproduction refreshes ignored row-level predictions under `data/processed/benchmark-predictions/`. The committed protocol in `experiment.json` fixes the split, parameters and validation-only selection rule. Model metadata records package versions and source/data fingerprints. Load only trusted model artifacts.

All Gate 2 results use the published normalized FreshRetailNet scale: **WAPE 34.17%, MAE 0.407719, RMSE 0.690328** on the seven-day final test. **This model is not validated for real RetailSense physical-unit quantities.** The web endpoint described above demonstrates synthetic integration only. Actual operational use requires separate validation on real sales/base-unit histories. Thirty days has FreshRetailNet validation evidence only, and three months remains unvalidated.

### Verify and stop

| Service | Default address | Expected response |
| --- | --- | --- |
| Frontend | [localhost:3000](http://localhost:3000) | Login, then authorized application shell |
| Backend | [localhost:3001/health](http://localhost:3001/health) | `{"status":"ok"}` |
| Model service | [localhost:8000/health](http://localhost:8000/health) | `{"status":"ok","service":"ml-service"}` |
| PostgreSQL | `localhost:5432` | Connection through Prisma |

Backend `/health` runs a database query. HTTP 200 confirms that the backend can reach PostgreSQL; HTTP 503 reports database unavailability without exposing the connection string. If backend startup fails, check the PostgreSQL process and `DATABASE_URL`.

Use `Ctrl+C` in each application terminal to stop it. PostgreSQL is managed separately using its local service controls or `pg_ctl`.

## Checks

On an automatically installed Windows copy, enable the project-local Node/npm in a developer PowerShell terminal before running manual npm commands:

```powershell
# From the project root; affects this terminal only.
. .\scripts\windows-runtime.ps1
Use-ProjectNode (Get-Location).Path
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-windows-setup.ps1
```

Run `npm run lint`, `npm run typecheck`, and `npm run build` in both `frontend/` and `backend/`. Backend builds generate the Prisma client. In `ml-service/`, run `.venv`'s Python with `-m pip check` and `-m compileall app.py src`, then verify `/health` while Uvicorn is running.

For backend integration tests, provision a separate database and role:

```sh
createuser --host localhost --port 5432 --username postgres --pwprompt retailsense_test
createdb --host localhost --port 5432 --username postgres --owner retailsense_test retailsense_test
```

Set `TEST_DATABASE_URL` in `backend/.env` using that role and database, then run from `backend/`:

```sh
npm run prisma:migrate:test
npm test
```

Tests require a separate database whose name ends in `_test`. They exercise the actual HTTP service and PostgreSQL and remove their own fixtures afterward. Use a dedicated test database without manually seeded accounts or demo records, and run browser verification separately from the automated suite. Coverage includes authentication/recovery, administration, catalog, inventory, FEFO/FIFO, live purchases/sales/expenses, import parsing/preview/confirmation/rollback, historical-stock isolation, report arithmetic, business-date boundaries, store/cost isolation, reproducible demo history, forecast persistence/rollback and forecast RBAC. Decision coverage adds immutable snapshots, usable/incoming stock, scoped final decisions, whole-unit purchase conversion, unique draft links, rollback/concurrency, alert lifecycle and unchanged receiving. Automated recovery tests replace the mail sender; backend forecast tests use a controlled HTTP prediction server for failure cases.

For the complete Python suite, install `requirements-training.txt` (including inference and preparation dependencies), then run `.venv`'s Python with `-m unittest discover -s tests -v` from `ml-service/`. Prediction tests start a temporary loopback Uvicorn server with the retained artifact; no extra HTTP testing library is required. The full demo backtest and browser checks additionally exercise the actual NestJS → FastAPI → PostgreSQL flow.

AI Center API tests are included in `npm test`. They run real Python training and test activation/rollback against a copied model directory, preserving the application's ACTIVE pointer. For its real-browser check on Windows, first build the frontend, start PostgreSQL and run `Setup-AI.bat`. With ports 3000/3001/9234 free and Chrome at its standard installation path, run `node test/ai-browser.cjs` from `backend/`. This uses `TEST_DATABASE_URL`, temporary accounts and synthetic facts; checks real Qwen tool calling, multi-file import, training, toggle independence, desktop/mobile and role restrictions; and removes its own database fixtures afterward. Browser screenshots/results are written to ignored `.test-artifacts/`. Run it separately from other backend tests.

## Daily operation

After the one-time Windows setup, **double-click `Start-SmartRetail.bat` in the project root**. No administrator terminal or manual execution-policy setup is required. The launcher uses its own directory and project-local Node/npm, so you can open it from Explorer or another working directory without changing PATH.

It checks existing tools/configuration, starts the project-local PostgreSQL in the background when needed, waits for database readiness, opens separate **Smart Retail - ML Service**, **Smart Retail - Backend** and **Smart Retail - Frontend** PowerShell windows, then checks service health for about 120 seconds. When Mailpit is installed, it also opens **Smart Retail - Local Mail**. After **SMART RETAIL READY**, it opens [localhost:3000](http://localhost:3000). The ML window runs the virtual-environment Python/Uvicorn command; the Node applications run `npm run dev` and retain their logs. The backend's predev hook generates the Prisma client; no migration or seed is run.

Ports checked: PostgreSQL's port in **backend/.env**, ML **8000**, backend **3001**, frontend **3000**, and local mail **1025/8025** when installed. Existing listeners are reused only after health checks pass; they are never killed or restarted. An occupied database port with no running project PostgreSQL produces an error. Existing service windows are also recognized while compiling, before they bind a port, and repeated clicks do not launch another active instance. Handle-based lock files under `.local/` are harmless after exit; do not delete them to stop a running service.

The launcher requires the `.local/postgresql/` installation, `ml-service/.venv/`, installed Node dependencies, project-local Node/npm (or a compatible Node 22 on PATH) and `backend/.env`. `Setup-SmartRetail.bat` prepares these on a new machine. Daily startup does not install dependencies, change configuration/schema, seed data or reset databases. Missing prerequisites, conflicts and failed health checks are reported; the `.bat` pauses on failure so you can read the error. Already started windows remain available for diagnosis after a timeout. Check them before retrying.

For a terminal-only readiness check without opening the browser, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-dev.ps1 -NoBrowser` from the root. Execution-policy bypass applies only to that PowerShell process. The manual startup/stop commands below remain available; stop the three service commands with Ctrl+C in their own windows, then stop PostgreSQL explicitly when finished.

On an installed machine, use the existing private configuration and database. Dependencies, migrations, bootstrap and demo seeds are setup steps, not daily startup steps. Start PostgreSQL first, then the local inbox (if demonstrating password recovery), FastAPI, backend and frontend. Keep each foreground process in its own terminal.

For a repeatable presentation, build the Node applications once after installation or source changes, then run the compiled applications:

```powershell
# Terminal 1, from the repository root
cd ml-service
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000

# Terminal 2, from the repository root
cd backend
npm run build
npm start

# Terminal 3, from the repository root
cd frontend
npm run build
npm start
```

The commands above use the local `NODE_ENV=development` backend configuration even though Next.js serves a compiled build. `NODE_ENV=production` sets Secure cookies and requires an HTTPS deployment; changing that flag alone is not a local HTTP setup. The model service stays on loopback. An internet-facing deployment is outside this delivery.

Check backend `/health`, the login page and the local inbox before presenting. FastAPI `/health` reports process health only; a completed Forecast run confirms that the artifact loaded and prediction works. Keep `ml-service/models/demand_model.joblib` and `model_metadata.json` together. FreshRetailNet downloads and training dependencies are not needed for inference or the synthetic demo.

Stop the frontend, backend, FastAPI and inbox with `Ctrl+C` in their terminals, then stop PostgreSQL with its service control or `pg_ctl -m fast stop`. Do not close the computer while a receipt, sale, import or forecast request is still pending. After an interrupted request, inspect the saved document/run/history before retrying. Restarting the backend marks interrupted forecast runs FAILED; restarting also expires in-memory import previews.

## AI Center: dữ liệu, training và trợ lý kinh doanh

Mở [AI Center](http://localhost:3000/ai-center) bằng tài khoản **ADMIN** hoặc **STORE_MANAGER**. STAFF không có quyền truy cập cả trang và API. Trang gồm dữ liệu, quy trình huấn luyện và chatbot. Công tắc **Hiển thị quy trình huấn luyện** chỉ ẩn/hiện khung training, nhớ lựa chọn theo tài khoản trên trình duyệt; không dừng job, đổi model hay xóa hội thoại.

**Cập nhật một bản đã cài:** sao lưu database, dừng các cửa sổ dịch vụ rồi chạy lại `Setup-SmartRetail.bat` để áp dụng migration bổ sung và build. Setup giữ tài khoản và dữ liệu hiện có. Không reset hoặc reseed database để nâng cấp. Nếu cài thủ công, chạy `npm ci`, `npm run prisma:migrate`, `npm run build` trong backend và `npm ci`, `npm run build` trong frontend; giữ môi trường Python theo các requirements của dự án.

**Chuẩn bị dữ liệu**

1. Đặt tên dataset, chọn CSV hoặc snapshot database. ADMIN có thể chọn dữ liệu ngoài hệ thống; mã cửa hàng/sản phẩm ngoài chỉ tồn tại trong dataset. STORE_MANAGER chỉ xử lý dữ liệu cửa hàng được giao.
2. Chọn nhiều CSV: tối đa **20 file, 10 MiB/file, 100 MiB và 400.000 dòng/batch**. CSV dùng UTF-8, dấu phẩy và ngày `YYYY-MM-DD`. Các nút tải mẫu trên trang tạo file ví dụ có nhãn `SYNTHETIC`; thay dữ liệu nguồn trước khi sử dụng thực tế.
3. Xem loại file, cột, dòng, nguyên nhân và cách sửa. Tên cột khác có mapping gợi ý, cần xác nhận các cột được dùng/bỏ qua. Thay thế hoặc loại bỏ riêng file lỗi; các file hợp lệ vẫn ở staging.
4. Bấm **Kiểm tra toàn bộ batch**. Xử lý trùng khóa, sai đơn vị, sai phạm vi và tham chiếu catalog. Chọn xác nhận rồi **Công bố dataset**. Sau công bố, snapshot là bất biến; tạo dataset mới cho lần sửa sau.

| Nhóm | Cột bắt buộc | Cột tùy chọn |
| --- | --- | --- |
| Sales History | `date,store_id,product_id,quantity,unit_code` | `transaction_id,line_id,source` |
| Product Catalog | `product_id,name,unit_code` | `store_id,source` |
| Opening Inventory | `date,store_id,product_id,quantity,unit_code` | `lot_number,source` |

`quantity` là **số lượng theo đơn vị cơ sở**, tối đa bốn số thập phân. Lịch sử bán có thể là tổng theo ngày hoặc dòng giao dịch có `transaction_id`; `line_id` phân biệt các dòng cùng sản phẩm trong một giao dịch. Các dòng giao dịch được tổng hợp theo ngày với kết quả và số dòng được công bố trong phần kiểm tra. Không trộn tổng ngày với giao dịch cho cùng khóa. Tồn đầu kỳ nên có `lot_number` hoặc ánh xạ rõ nhóm INVENTORY khi cấu trúc cột giống sales; không dùng lượng tồn làm lượng bán. Catalog và tồn đầu kỳ dùng đối chiếu, không thay thế Sales History.

Trạng thái file: `INVALID_FORMAT`, `MISSING_REQUIRED_FIELDS`, `NEEDS_MAPPING`, `UNSUPPORTED_DATASET`, `DUPLICATE_DATA`, `ACCESS_DENIED`, hoặc `VALID`. Không tự bỏ dòng lỗi, sửa đơn vị, khử trùng hay điền ngày thiếu. Ngày bán bằng 0 phải được khai báo rõ; snapshot database chỉ suy ra số 0 trong phạm vi lịch sử đã xác nhận đầy đủ. Dữ liệu mô phỏng phải được đánh dấu; nguồn demo đã biết trong database cũng tự được nhận diện và chặn kích hoạt model.

Staging hết hạn sau **7 ngày**, dọn khi khởi động, mỗi giờ và khi mở/tạo dataset. Metadata và audit được giữ; raw CSV và snapshot công bố nằm trong `.local/ai-center/`, không phục vụ trực tiếp qua web. Mỗi tài khoản tối đa 10 staging và 500 MiB file nguồn đang lưu. Bộ M5/FreshRetailNet nguyên bản lớn tiếp tục xử lý bằng script offline; upload snapshot số lượng đã chuẩn bị đúng định dạng. Không chuyển `sale_amount` chuẩn hóa của FreshRetailNet thành CAN/KG/PCS.

**Huấn luyện và phiên bản model**

- Chọn dataset đã công bố. Hai baseline **SeasonalNaive** và **RollingMean28** luôn chạy; **LightGBM** có thể chọn thêm với số cây, learning rate và số lá trong giới hạn. Job bất đồng bộ chạy một lần/installation, tối đa một giờ, hai luồng tính toán; không cần queue service. Backend dừng thì job bị đánh dấu gián đoạn khi mở lại, không tự chạy tiếp.
- Chia train/validation/test theo thời gian, mọi chuỗi phải có dữ liệu liên tục. Chọn 30 ngày mỗi cửa sổ cần tối thiểu **120 ngày** và chỉ phục vụ phân tích. Điều kiện kích hoạt hiện tại cần hai cửa sổ **124 ngày** độc lập, tối thiểu **308 ngày** mỗi chuỗi và không có dữ liệu synthetic. Không dùng test để chọn thuật toán.
- Kết quả gồm EDA, ngày bán bằng 0, outlier IQR được giữ nguyên, lag/rolling/calendar features, số dòng từng tập, metric từng đơn vị, actual/predicted, phân bố sai số và feature importance khi có LightGBM. WAPE/Bias là không xác định nếu tổng thực tế bằng 0. Dataset toàn số 0 không đủ bằng chứng chọn model.
- Model mới là `CANDIDATE`, không tự thay `m5-quantity-v2`. Chỉ ADMIN được xác nhận **Kích hoạt** hoặc rollback về phiên bản đã được đánh giá; lịch sử ghi phiên bản cũ/mới, người thực hiện và lý do. Phiên bản từng triển khai được hiển thị `ARCHIVED` khi không còn ACTIVE. Dự báo đã lưu giữ nguyên model gốc.
- Tối đa 100 lần training/tài khoản. Giữ metadata và artifact bất biến để truy vết; khi cần giải phóng dung lượng, quản trị viên phải sao lưu và xác định phiên bản không còn được sử dụng. Không xóa thư mục model ACTIVE.

**Thử training ngay bằng CSV mẫu:** đăng nhập ADMIN, tải ba mẫu trên trang (mẫu Sales có 140 ngày được tạo cố định, bao gồm ngày bằng 0). Tạo dataset CSV, chọn “Dữ liệu ngoài hệ thống” và “Dữ liệu demo / mô phỏng”, upload cả ba file, kiểm tra và công bố. Chọn đánh giá 30 ngày rồi xác nhận bắt đầu. Kết quả chỉ kiểm tra pipeline; model demo không được kích hoạt. STORE_MANAGER cần thay mã bằng cửa hàng/sản phẩm được giao và đúng đơn vị cơ sở.

**Cài và sử dụng chatbot**

Trên Windows 10 **22H2** / Windows 11 64-bit, sau bộ cài chính, chạy **`Setup-AI.bat` một lần**. Bộ cài tải Ollama 0.40.6 chính thức đã khóa SHA-256 và `qwen3:4b-instruct-2507-q4_K_M`; cần khoảng 10 GB dung lượng trống lúc cài, Internet để tải lần đầu và nên dùng máy 16 GB RAM. Thời gian trả lời phụ thuộc CPU/GPU. Không yêu cầu cloud API key. Các lần sau launcher chính mở Ollama đã cài; nếu Ollama thiếu hoặc lỗi, nghiệp vụ và training vẫn hoạt động.

Ollama mặc định ở `http://127.0.0.1:11434`. Binaries tại `.local/ollama/`, model tại `.local/ollama-models/`, log tại `.local/ollama-logs/`. Nếu máy đã chạy Ollama, setup dùng dịch vụ đó và kho model của nó. Cấu hình backend qua `OLLAMA_BASE_URL` (chỉ địa chỉ loopback) và `OLLAMA_MODEL` (model cục bộ hỗ trợ tool calling). Model thay thế phải được tải trước; mặc định [Qwen3 4B Instruct 2507 Q4_K_M](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M), dùng ngữ cảnh 4.096 token. Khóa rõ biến thể Instruct để tránh nhãn 4B chung chuyển sang biến thể suy luận dài. Kiểm tra bằng `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-ai.ps1 -CheckOnly`. Trên hệ điều hành khác có thể cài [Ollama](https://docs.ollama.com/windows) phù hợp, chạy `ollama serve` và `ollama pull qwen3:4b-instruct-2507-q4_K_M` thủ công.

Chọn phạm vi rồi bắt đầu hội thoại: doanh thu theo ngày, sản phẩm bán chạy, so sánh doanh thu, chi phí, cảnh báo tồn kho, đề xuất nhập, dự báo đã lưu 7/30 ngày và model hiện hành. Hội thoại chỉ thuộc tài khoản tạo ra; tạo hội thoại mới khi muốn đổi cửa hàng. Enter gửi, Shift+Enter xuống dòng. Bảng nguồn kèm phạm vi, ngày, đơn vị và thời điểm truy vấn là cơ sở đối chiếu. Cảnh báo/đề xuất/dự báo là snapshot đã lưu, không được tự tính lại trong chat. Nếu chưa có dự báo đủ ngày, mở trang Dự báo bán hàng để tạo riêng.

Backend cho phép tối đa sáu lời gọi công cụ đọc, kiểm tra lại quyền hiện tại, không cung cấp SQL hoặc công cụ ghi dữ liệu cho LLM. Nội dung HTML không được thực thi. Tin nhắn tối đa 2.000 ký tự; 100 tin nhắn/hội thoại, 100 hội thoại/tài khoản, tối đa hai lượt trả lời đồng thời toàn hệ thống. Các request thay đổi AI Center bị giới hạn 30/phút/tài khoản. Phản hồi không có nguồn hoặc chứa số không khớp nguồn dùng thông báo đối chiếu thay vì khẳng định số liệu. Kiểm tra nguồn trước khi quyết định; LLM vẫn có thể giải thích sai ngữ cảnh.

**Giới hạn bằng chứng:** kết quả FreshRetailNet giữ nguyên **WAPE 34.17%, MAE 0.407719, RMSE 0.690328** trên thang `sale_amount` chuẩn hóa. Synthetic/demo backtest — not evidence of real-world forecasting accuracy. Dữ liệu ngoài hệ thống có đơn vị phù hợp cũng chưa chứng minh độ chính xác tại cửa hàng RetailSense.

**Sao lưu bổ sung:** cùng bản dump PostgreSQL, lưu `.local/ai-center/`, `ml-service/models/active-model.json` và các phiên bản tương ứng trong `ml-service/models/operational/`. Dừng training/deployment khi sao lưu để có bộ nhất quán. Không commit file upload, nội dung chat, binary ứng viên hoặc model Ollama lên Git. Không tự xóa metadata database để xử lý lỗi file; khôi phục snapshot/artifact khớp checksum từ backup.

## Demonstration walkthrough

Allow about 25–35 minutes for the full demonstration. Use a dedicated demo database; purchases, sales and decisions persist. Record the demo seed end date and the accounts used. Do not run backend integration tests against this database.

Prepare the authentication seed, optionally `npm run seed:demo` for the small inventory example, and `npm run seed:forecast-demo` for the separate synthetic forecasting stores. On first creation, omitting `--end-date` uses yesterday in Vietnam. Keep the three `FC-ST*` stores for forecasting; use a different store for the live purchase/sale exercises so live transactions do not mix with the marked synthetic history. Create two managers assigned to different stores and one STAFF account through **Người dùng**, with privately chosen passwords. No sample seed creates these accounts.

| Step | Actor / action | Expected result |
| --- | --- | --- |
| 1. Sign in and recovery | Try an incorrect password, then ADMIN login; use Forgot Password for a disposable demo account and open the local inbox | Generic login error; reset email remains local; new password works and a used token cannot be reused |
| 2. Administration | Create/edit a store and assign manager/staff accounts; try deactivating a store with active assigned users | Store and account changes appear; deactivation is blocked until accounts are reassigned/deactivated; current/last ADMIN protections remain |
| 3. Catalog and pricing | Create a product with 12 base units per purchase unit and a store price of 10.00 | Store-specific price is visible; STAFF does not see purchase/lot cost; invalid category deactivation is blocked |
| 4. Purchase and inventory | Manager creates a draft for two purchase units at 25.00 each; review, then receive | Draft does not change stock; receipt adds 24 base units at 2.08 per base unit, with linked lots; repeat receipt cannot add stock twice |
| 5. Sale and reporting | STAFF sells two base units with one invoice discount of 1.00 | Total is 19.00, stock becomes 22; stored COGS is 4.16; manager dashboard for today shows revenue 19.00 and gross profit 14.84 if no other transactions exist |
| 6. Errors and expenses | Try a sale above available stock; manager records an expense of 3.00 | Failed sale leaves stock/invoices unchanged; estimated operating profit becomes 11.84 for the example; STAFF cannot access expenses |
| 7. Imports | ADMIN downloads a template, previews and confirms valid/invalid rows, then tries the same file again | Preview does not write business data; valid rows/documents import; one bad sales/purchase row rejects its whole document; duplicate file is blocked |
| 8. Historical isolation | Import historical sales/purchases; load opening inventory only for a new Store × Product pair | Historical transactions retain import links and leave current stock unchanged; existing lots prevent opening-inventory import |
| 9. Forecast | ADMIN runs one or three calendar months over covered sample history | 33 eligible pairs and three INSUFFICIENT_HISTORY pairs for the original sample; each month has its own quantities/revenue; source and history cutoff remain visible |
| 10. Replenishment | Generate from that completed run; manager reviews one recommendation | Demand, usable/incoming/safety stock and the zero-floor formula are visible; repeated generation reuses the snapshot |
| 11. Human decision and purchase | Accept one, Adjust another with a reason, Reject another; explicitly create a draft for a positive approved quantity | No order appears on generation/decision alone; approved base quantity is rounded up to whole purchase units; repeated creation returns the linked order; rejected/zero quantities cannot create a draft |
| 12. Alerts | Review stockout; run the 90-day planning estimate; receive enough demo stock to exceed its threshold; receive a tracked lot expiring within 30 days; refresh alerts | Stockout, planning-only overstock and expiry appear when their conditions hold; corrected conditions resolve; recurrence reuses the same alert |
| 13. Scope and layouts | Sign in as the other manager and STAFF; test prohibited pages/API scope, mobile width and retry after a temporary connection failure | Other-store access is denied; STAFF remains limited to products/inventory/sales; forms and tables remain usable on mobile |

For step 12, review actual displayed thresholds before entering a demo purchase. Stockout and overstock need not coexist for the same product. For expiry, choose an active expiry-tracked product and a future date within 30 days. A previously expired lot requires historical opening inventory on a new pair; live receiving rejects already-expired goods. Refresh Alerts after order or stock changes. Forecast stores may receive inventory for this exercise without inventing additional sales history.

On an old installed demo, the saved history end stays fixed. Once its forecast period expires, recommendation generation correctly refuses it. Rerunning the same seed does not advance dates. For a later presentation, provision a **new demo database**, apply migrations/initial seed, and run the synthetic seed with yesterday's date; preserve the old database or backup. Do not edit historical dates, delete application data, or retrain the model to make an old demonstration appear current.

When discussing results, separate verified business calculations from forecasting evidence: **WAPE 34.17%, MAE 0.407719 and RMSE 0.690328 are the normalized FreshRetailNet seven-day benchmark**. Synthetic forecasts and backtests establish integration behavior only. Ninety-day quantities are planning estimates; real physical-unit accuracy and optimal purchasing are not established.

## Backup and recovery

Keep a PostgreSQL custom-format backup before a demonstration that changes data, before applying migrations to an existing database, and before handing over an existing installation. Include private configuration and the matching source/model version through a separate private transfer. Database backups contain accounts and business data; they do not belong in the source archive or Git.

The following PowerShell example runs from the repository root using the project-local PostgreSQL 17 binaries. For a system installation, set `$pgBin` to its actual `bin` directory. Match the host, role and database to your private configuration; `-W` prompts for a password without putting it in the command.

```powershell
$pgBin = (Resolve-Path .local/postgresql/pgsql/bin).Path
New-Item -ItemType Directory -Force .local/backups | Out-Null
$backupPath = Join-Path (Get-Location) ('.local/backups/retailsense-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
& "$pgBin/pg_dump.exe" -h localhost -p 5432 -U retailsense -W -d retailsense -Fc --no-owner --no-privileges -f $backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
& "$pgBin/pg_restore.exe" --list $backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup archive cannot be read' }
```

A readable archive still needs a restoration check. Restore into a **new empty database**, using an unused name. These commands do not replace the active database:

```powershell
& "$pgBin/createdb.exe" -h localhost -p 5432 -U postgres -W -O retailsense retailsense_restore
if ($LASTEXITCODE -ne 0) { throw 'Create restore database failed; choose an unused name' }
& "$pgBin/pg_restore.exe" -h localhost -p 5432 -U retailsense -W -d retailsense_restore --no-owner --no-privileges --exit-on-error $backupPath
if ($LASTEXITCODE -ne 0) { throw 'Restore failed' }
```

The target owner role must already exist. PostgreSQL database dumps do not recreate login roles; provision a restricted application role separately on another machine. Stop the backend before editing its private `DATABASE_URL` to use the restored database. Preserve the previous URL privately. Run `npm run prisma:status` in `backend/`, start the matching application version, then check login, representative invoices/lots, dashboard totals, forecast history and recommendation links. Restored passwords are the ones in the backup; the bootstrap seed does not reset them. Switching back to the preserved original database is the fallback if validation fails. Do not use `migrate reset`, `--clean` restoration or blanket table deletion for routine recovery.

## Troubleshooting

| Symptom | Check / recovery |
| --- | --- |
| Setup stops with `Active model metadata integrity failure`, then startup reports missing `PG_VERSION` | Update branch `smart-retail-mvp` with `git pull --ff-only`, then rerun `Setup-SmartRetail.bat` to completion before starting the launcher. The earlier release hashed Windows CRLF metadata before Git normalized it to LF. The fix handles both newline styles while retaining model integrity checks. Keep `.local/` and private `.env` files; PostgreSQL has not been initialized if setup stopped at model verification. Do not reset the database or activate/retrain a model to bypass this error. |
| Backend cannot start or `/health` returns 503 | Confirm PostgreSQL is running with `pg_isready`; check private DATABASE_URL, port and URL-encoded password; run migration status |
| Port already in use | Stop the service in its own terminal, or choose a free port and update matching origins/URLs; do not terminate unrelated processes |
| Login succeeds but the browser returns to login | Use `localhost` consistently; verify FRONTEND_ORIGIN and NEXT_PUBLIC_API_URL; use the local backend environment for HTTP and rebuild the frontend after URL changes |
| Bootstrap refuses an account or old password remains | Initial seeding preserves the existing administrator; inspect identity conflicts and use Forgot Password for an existing account |
| Reset email is absent | Start Mailpit, confirm loopback SMTP settings and inspect the local inbox; the public response intentionally does not reveal whether an account exists |
| FastAPI health is OK but forecast fails | Check the model and metadata files, pinned inference dependencies and ML_SERVICE_URL; inspect the persisted failure code and rerun only after fixing the cause |
| INSUFFICIENT_HISTORY or INVALID_FORECAST_INPUT | Review data coverage and product/unit configuration; inference requires 30 continuous confirmed days. Imported store history is supported; unknown dates are not zeros |
| Forecast exists but recommendations are skipped | Select a completed run with saved daily predictions covering today through today+29; check active store/product settings. Complete missing history before forecasting again; do not shift an old seed's dates |
| Recommendation seems unchanged after receiving | It preserves its original snapshot. Review current inventory/order state and Refresh Alerts; repeated generation does not rewrite decisions |
| Import preview expired or confirmation conflicted | Review history first; re-upload for a fresh preview if still uncommitted; previews expire after 30 minutes or backend restart |
| Sale/receipt response was interrupted | The sales counter retains its pending checkout and offers to recover the same transaction after reload. Do not clear browser storage while a checkout is uncertain. Inspect purchase/receiving documents before retrying; completed sales have no cancellation/restoration workflow |
| Integration tests refuse the database | Set a separate TEST_DATABASE_URL ending in `_test`; keep it unseeded and run test suites sequentially against it |

## Handover checklist

- Deliver source directories `frontend/`, `backend/`, `ml-service/`, lockfiles, migration history, environment examples and this README. Retain the model artifact, metadata and benchmark/demo limitation reports. Internal `docs/` is optional and is not a runtime dependency.
- Exclude `.git/`, private `.env` files, `.local/`, database dumps, mailboxes, `.test-artifacts/`, dependency/build folders and raw/processed training data from the public source package. Install dependencies from the retained lockfiles and pinned requirements on the receiving machine.
- Record the source commit/tag, Node/npm/Python/PostgreSQL versions, demo history end date and checks executed. A new installation uses its own database, JWT secret and administrator password. Transfer an existing installation's credentials and backup privately, without embedding them in the README.
- Verify a clean installation, three-role access, the walkthrough above and backup restoration before acceptance. Keep deployment local; no cloud hosting, queues, automatic purchasing or automatic model retraining are required.
- Explain the release limits: no sale void/returns/stock adjustment; final recommendation decisions; one purchase per recommendation even after cancellation; synchronous alerts with manual refresh and no event-history/notification service. Quantity forecasts have external M5 evaluation, but accuracy at the user's stores is not established. Training/activation remains offline; short evaluations cannot activate a model for the long-horizon website.

### Historical v1.0 delivery environment

The local handover was verified on Windows with Node.js 22.17.0, npm 10.5.2, Python 3.11.0 and PostgreSQL 17.11. A fresh source copy without `docs/` installed from the lockfiles/pinned inference requirements, applied all twelve migrations, seeded one administrator and synthetic history, and completed the forecast-to-purchase and retail/reporting flows. Backup restoration preserved every row in all 18 business tables and migration history, and the restored application passed login/history/link checks.

Executed acceptance checks: **218 backend tests, 28 Python tests and 96 Chrome browser checks across eight groups**, plus lint/typecheck/build, seven clean-install/recovery groups, five restored-application checks and six original-application smoke groups. Desktop and 390px mobile layouts were checked. These are local functional results, not load testing, an external deployment certification or evidence of real-world forecasting accuracy. Other operating systems have setup instructions but were not exercised in this handover.

Maintainer: **phamhuuluan** — **huu12026@gmail.com**.
