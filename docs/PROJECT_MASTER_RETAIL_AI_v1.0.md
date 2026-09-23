# PROJECT_MASTER_RETAIL_AI_v1.0

> **Project Name (temporary):** RetailSense AI  
> **Project Type:** Graduation Project – Web Application + Machine Learning  
> **Primary Domain:** Multi-branch mini-mart / convenience-store management  
> **Default UI Language:** English  
> **i18n:** Codebase must be ready for Vietnamese translation  
> **Status:** LOCKED FOR MVP  
> **Related Database Source of Truth:** `DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md`

---

# 1. Project Vision

RetailSense AI is an internal B2B web system for a small retail chain with one central warehouse and multiple mini-mart / convenience-store branches.

The system is **not an e-commerce website** and does not provide a shopping interface for end customers.

Its purpose is to help the business:

- manage products;
- manage inventory;
- record purchasing;
- record sales;
- manage revenue and expenses;
- compare branch performance;
- import historical Excel/CSV data;
- forecast demand for each product at each store using Machine Learning;
- forecast expected revenue;
- recommend replenishment quantities;
- warn about stockout, overstock and expiry risks.

The project should look and behave like a professional internal business application while intentionally remaining small enough for a graduation project.

---

# 2. Core Business Problem

Different branches can have different demand for the same product.

Example:

```text
Store A
Product X
High demand

Store B
Product X
Low demand

Store B
Product Y
High demand
```

The system should help answer:

```text
How much did we sell?
What is likely to be sold next?
Which store needs more stock?
How much should the store replenish?
Which products are at risk of stockout?
Which products may become overstocked?
Which lots may expire before being sold?
```

Machine Learning predicts demand. Application business logic converts prediction into operational recommendations.

---

# 3. MVP Functional Scope

## 3.1 Authentication

- Login using username/email and password.
- Logout.
- Forgot-password flow.
- Role-based access control.
- User activation/deactivation.
- No 2FA in MVP.

## 3.2 Branch / Location Management

Admin manages:

- central warehouse;
- branches/stores;
- store code/name;
- address/district/city;
- active/inactive status.

Common concept:

```text
Location
├── CENTRAL_WAREHOUSE
└── STORE
```

## 3.3 Product Management

Admin can:

- create/edit/deactivate product;
- assign category;
- configure base selling unit;
- configure default purchase unit;
- configure purchase-to-base ratio;
- configure expiry tracking;
- configure shelf-life information.

Store Manager may configure for their own store:

- product active/inactive;
- selling price;
- safety stock;
- minimum stock level.

Store Manager cannot create global master products.

## 3.4 Inventory Management

Inventory is managed by:

```text
Location × Product × Lot
```

For expiry-tracked products:

```text
FEFO
First Expired, First Out
```

For non-expiry products:

```text
FIFO / oldest stock first
```

Manual stock adjustment is **not included in MVP**.

Inventory changes mainly come from:

```text
Purchase RECEIVED → stock increases
Sale COMPLETED    → stock decreases
Imported inventory → initial/seed inventory
```

## 3.5 Purchase Management

MVP workflow:

```text
DRAFT → RECEIVED
DRAFT → CANCELLED
```

Functions:

- create purchase order;
- add product items;
- enter purchase quantity;
- convert to base quantity;
- enter cost;
- enter lot/expiry;
- mark as received;
- update inventory;
- view purchase history.

No Supplier module and no multi-level approval in MVP.

## 3.6 Sales Management

Sales come from:

### Direct Web Sale

Staff/Manager creates a sale.

```text
Sale
├── SaleItem
├── SaleItem
└── SaleItem
```

When completed:

```text
Create Sale
+ Create SaleItems
+ Reduce Inventory
```

must execute in one database transaction.

If stock update fails:

```text
ROLLBACK
```

Normal sales cannot exceed available inventory.

### Historical Import

Historical sales can be imported from Excel/CSV.

## 3.7 Expense Management

Supported expense types:

```text
RENT
SALARY
ELECTRICITY
WATER
TRANSPORT
MARKETING
OTHER
```

Expense may belong to a store or the whole business.

The project is not accounting software.

## 3.8 Dashboard

### Admin Dashboard

Show:

- total revenue;
- total operating expenses;
- gross profit;
- estimated operating profit;
- inventory summary;
- revenue trend;
- branch comparison;
- top-selling products;
- inventory-risk summary.

### Store Manager Dashboard

Only current store:

- revenue;
- expenses;
- estimated profit;
- sales trend;
- top products;
- low-stock products;
- forecast summary;
- replenishment recommendations;
- inventory alerts.

## 3.9 Excel / CSV Import

Supported types:

```text
PRODUCT
INVENTORY
SALE
PURCHASE
EXPENSE
```

UX:

```text
Upload
→ Validate
→ Preview
→ Show errors
→ Confirm
→ Import
→ Result summary
```

Requirements:

- duplicate-file detection;
- clear validation errors;
- success/failed row counts;
- no silent failures.

## 3.10 Machine Learning Forecast

Model is trained offline by the project team.

The web app **does not train models in MVP**.

Runtime:

```text
Admin clicks Run Forecast
→ Backend
→ ML Service
→ Load trained model
→ Inference
→ Save forecast
```

Forecast horizons:

```text
1 month
3 months
```

Default run may cover all active Store × Product pairs.

Forecast screen supports filtering by store, product and period.

Primary ML output:

```text
predicted_quantity
```

for:

```text
Store × Product × Forecast Period
```

## 3.11 Revenue Forecast

No separate revenue model in MVP.

```text
Predicted Revenue
=
Predicted Demand
×
Estimated Selling Price
```

## 3.12 Replenishment Recommendation

Core formula:

```text
Recommended Quantity
=
MAX(
    0,
    Predicted Demand
    + Safety Stock
    - Current Stock
    - Incoming Stock
)
```

Manager actions:

```text
ACCEPT
ADJUST
REJECT
```

If `ADJUST`:

- manager quantity is required;
- adjustment reason is required.

If accepted or adjusted, UI provides:

```text
Create Purchase Draft
```

End-to-end workflow:

```text
Forecast
→ Recommendation
→ Manager Decision
→ Purchase Draft
→ Purchase Received
→ Inventory Updated
```

## 3.13 Inventory Alerts

MVP:

```text
STOCKOUT_RISK
OVERSTOCK_RISK
EXPIRY_RISK
```

Alerts are shown in an in-app Alert Center.

No email/SMS/push and no daily scheduler in MVP.

---

# 4. User Roles

## ADMIN

Can access and manage the full chain:

- users;
- stores;
- products/categories/units;
- inventory;
- purchases;
- sales;
- expenses;
- imports;
- global dashboard;
- forecasts;
- recommendations;
- alerts.

## STORE_MANAGER

Belongs to exactly one store in MVP.

Can:

- view own-store dashboard;
- configure store product price/safety stock;
- view own inventory;
- manage own purchases;
- view/create own sales;
- manage own expenses;
- view own forecasts;
- accept/adjust/reject recommendations;
- create purchase draft from recommendation;
- view own alerts.

Cannot:

- access another store's private operational data;
- create global product master data;
- globally administer users.

## STAFF

Belongs to exactly one store.

Can:

- view sellable products;
- view basic stock availability;
- create sales;
- view permitted sales history.

Cannot access:

- profit;
- expenses;
- forecast management;
- replenishment decisions;
- global administration.

---

# 5. Authorization Principle

Authorization is enforced in Backend, not only Frontend.

For Store Manager / Staff:

```text
resource.location_id
=
current_user.location_id
```

Admin may access all locations.

---

# 6. UI / UX Direction

## 6.1 Overall Style

```text
Enterprise Admin Dashboard
+
Light POS/Retail influence
```

Characteristics:

- clean;
- modern;
- professional;
- data-focused;
- intuitive;
- consistent;
- restrained use of color;
- minimal unnecessary animation.

MVP uses **Light Mode only**.

## 6.2 Main Layout

```text
┌──────── Sidebar ────────┬──────────────────────────┐
│ Dashboard               │ Topbar                   │
│ Stores                  ├──────────────────────────┤
│ Products                │                          │
│ Inventory               │       Page Content       │
│ Purchases               │                          │
│ Sales                   │                          │
│ Expenses                │                          │
│ Import Data             │                          │
│ AI Forecast             │                          │
│ Replenishment           │                          │
│ Alerts                  │                          │
└─────────────────────────┴──────────────────────────┘
```

Sidebar uses clear icons + text labels.

## 6.3 Responsive Strategy

Priority:

```text
Desktop / Laptop first
```

Tablet/mobile must remain usable for basic viewing.

## 6.4 Language / i18n

Default UI:

```text
English
```

Code must be i18n-ready.

Expected future locales:

```text
en
vi
```

Do not scatter hard-coded user-facing text throughout components.

## 6.5 UI Quality Rules

Where appropriate, tables support:

- search;
- filter;
- pagination;
- sorting.

Forms require:

- clear labels;
- required indicators;
- validation;
- useful error messages;
- disabled/loading state while submitting.

Pages must consider:

```text
Loading
Empty
Error
Success
```

Dangerous actions require confirmation.

Successful/failed actions use toast or equivalent feedback.

---

# 7. Main Screens

```text
Login
Forgot Password

Dashboard

Stores
Store Detail

Products
Product Create/Edit
Categories

Inventory
Inventory Detail / Lots

Purchases
Purchase Create
Purchase Detail

Sales
New Sale
Sales History
Sale Detail

Expenses

Import Data

AI Forecast
Forecast Results

Replenishment Recommendations

Inventory Alerts

User Management
Profile
```

Do not create screens for deferred features.

---

# 8. Locked Tech Stack

```text
Frontend:
Next.js
TypeScript
Tailwind CSS

Backend:
NestJS
TypeScript

Database:
PostgreSQL

ORM:
Prisma

Machine Learning:
Python
FastAPI
Pandas
scikit-learn
LightGBM / XGBoost candidates

Development:
Docker Compose
Git
```

Do not introduce another major framework without explicit approval.

---

# 9. Backend Architecture

Use a **modular monolith**.

Suggested NestJS modules:

```text
auth
users
locations
categories
products
inventory
purchases
sales
expenses
imports
dashboard
forecasts
replenishment
alerts
```

Do not split these into microservices.

Only the Python ML Service is separate.

NestJS owns:

- authentication;
- authorization;
- validation;
- business rules;
- database access;
- inventory logic;
- transactions;
- dashboard queries;
- imports;
- forecast orchestration;
- replenishment;
- alerts;
- ML Service calls.

FastAPI owns:

- loading trained model;
- inference preprocessing;
- model inference;
- returning predicted demand.

FastAPI must not become a second business backend.

---

# 10. Database Source of Truth

Database details live in:

```text
DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
```

AI must not silently:

- add tables;
- rename fields;
- change PK/FK;
- alter relationships;
- alter database business rules.

Database changes require updating the database spec first.

---

# 11. FreshRetailNet-50K Strategy

FreshRetailNet-50K is a **public ML training/evaluation dataset**, not the operational DB schema.

Model v1 may use:

```text
store_id
product_id
dt
sale_amount
discount
holiday_flag
activity_flag
precpt
avg_temperature
avg_humidity
avg_wind_level
stock_hour6_22_cnt
```

Feature engineering may include:

```text
day_of_week
month
lag_1
lag_7
lag_14
lag_30
rolling_mean_7
rolling_mean_30
```

Target:

```text
sale_amount
```

Fields not needed in model v1 may be ignored:

```text
hours_sale
hours_stock_status
management_group_id
```

Do not build a complex data platform in MVP.

---

# 12. Demo Data Strategy

Recommended UI seed size:

```text
3 stores
30–50 products
several categories
sample inventory lots
sample purchases
sample sales
sample expenses
sample forecasts
```

ML may still train on a much larger FreshRetailNet subset or the full usable dataset.

FreshRetail entities are anonymized.

Friendly demo names may be assigned, e.g.:

```text
Store 105 → MiniMart – Area A
Product 4821 → Green Mustard
```

These are display/demo names only and must not be presented as the original dataset's true entity identities.

Temporary brand:

```text
RetailSense AI
```

---

# 13. Machine Learning MVP

Primary problem:

```text
Demand Forecasting
```

Prediction unit:

```text
Store × Product
```

Horizons:

```text
1 month
3 months
```

Candidate models:

```text
Baseline:
Naive / Moving Average

ML:
Random Forest
XGBoost
LightGBM
```

Evaluation:

```text
MAE
RMSE
WAPE
```

Choose final model using measured performance.

Deep Learning is optional and not required.

---

# 14. Training vs Inference

Training is offline:

```text
Dataset
→ Preprocess
→ Feature Engineering
→ Train
→ Evaluate
→ Select Model
→ Save Model Artifact
```

Inference:

```text
Web
→ NestJS
→ FastAPI
→ Load Saved Model
→ Predict
→ NestJS saves demand_forecasts
```

Never train the model when a user clicks Forecast.

---

# 15. Critical End-to-End Workflow

```text
Admin runs forecast
→ Demand Forecast
→ Revenue Forecast
→ Replenishment Recommendation
→ Store Manager reviews
→ ACCEPT / ADJUST / REJECT
→ Create Purchase Draft
→ Purchase RECEIVED
→ Inventory increases
```

This workflow should be demonstrable during defense.

---

# 16. Critical Database Transaction Rules

## Sale

Atomic transaction:

```text
Create Sale
Create SaleItems
Reduce Inventory
```

Failure anywhere:

```text
ROLLBACK
```

## Purchase Receipt

Atomic transaction:

```text
Validate Purchase
Mark RECEIVED
Create/update Inventory Lots
```

Failure anywhere:

```text
ROLLBACK
```

---

# 17. AI Coding Rules

Any AI coding assistant must follow these rules.

## Before Coding

Always inspect:

```text
PROJECT_MASTER_RETAIL_AI_v1.0.md
PROJECT_STATE.md
```

For DB tasks also inspect:

```text
DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
```

For ML tasks also inspect:

```text
ML_AND_DATA_SPEC.md
```

## Scope Discipline

AI must:

- implement only requested scope;
- preserve current architecture;
- reuse existing services/components where appropriate;
- avoid unrelated refactoring;
- avoid rewriting whole modules unnecessarily.

AI must not:

- add DB tables without approval;
- silently change schema;
- invent unnecessary APIs;
- duplicate services;
- add dependencies merely for convenience;
- introduce Kafka/Kubernetes;
- introduce additional microservices;
- replace working code without clear justification.

## Before Non-trivial Changes

AI should first state:

```text
1. What will change.
2. Which files will change.
3. What existing behavior may be affected.
4. How the change will be tested.
```

Then implement.

---

# 18. Code Quality Rules

Prefer:

```text
clarity
consistency
maintainability
small functions
explicit naming
typed interfaces
validation
separation of concerns
```

Avoid:

```text
premature abstraction
unnecessary patterns
very large files
business logic in UI components
duplicated business rules
```

Business rules belong in Backend services.

Frontend validation is for UX; Backend validates again.

---

# 19. Error Handling

Backend should use predictable application errors, e.g.:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
INSUFFICIENT_STOCK
DUPLICATE_IMPORT
FORECAST_FAILED
```

Do not expose raw stack traces to normal users.

Frontend converts technical errors into understandable UI messages.

---

# 20. Testing Strategy

Testing is focused on critical business behavior.

Required priorities:

```text
Authentication / authorization

Store Manager cannot access another store

Sale reduces inventory

Sale cannot exceed available stock

Failed Sale transaction rolls back

Purchase RECEIVED increases inventory

FEFO for expiry-tracked products

Duplicate import file rejected

Replenishment formula

ADJUSTED recommendation requires reason
```

No requirement to unit-test every visual component.

---

# 21. Definition of Done for AI Tasks

AI must not declare a task complete merely because code was generated.

Run when applicable:

```text
lint
relevant tests
type check
build
```

Completion report:

```text
Changed files
Implemented behavior
Tests/checks run
Remaining issue, if any
```

---

# 22. Git Discipline

Use small, task-oriented commits.

Examples:

```text
feat(products): add product management
feat(inventory): add inventory lot view
feat(sales): add transactional sale creation
feat(forecast): integrate demand inference
fix(auth): enforce store-level access
```

Avoid unrelated changes in one commit.

---

# 23. Explicitly Deferred Features

Not part of MVP:

```text
Customer e-commerce website
Mobile application
Customer accounts / loyalty
Customer recommendation
Supplier management
Store-to-store transfer
Warehouse allocation optimization
Detailed promotion engine
Historical price engine
Manual inventory adjustment
Advanced audit log
Email / SMS alerting
Daily alert scheduler
Automatic model retraining
Explainable AI
What-if simulation
Data warehouse
Feature store
Kafka
Kubernetes
Additional microservices
```

AI must not add these automatically.

---

# 24. Project Documentation Set

Only four primary project documents are expected:

```text
1. PROJECT_MASTER_RETAIL_AI_v1.0.md
   Product, UI, architecture and AI coding rules.

2. DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
   Tables, keys, relationships and DB rules.

3. ML_AND_DATA_SPEC.md
   Dataset, preprocessing, features, training and evaluation.

4. PROJECT_STATE.md
   Current code status, active APIs, completed modules,
   known issues and next task.
```

Do not create extra specification files unless truly needed.

---

# 25. Source-of-Truth Priority

If documentation conflicts:

```text
Database structure
→ DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md

ML/data behavior
→ ML_AND_DATA_SPEC.md

Current implementation status
→ PROJECT_STATE.md

Overall behavior/architecture/UI
→ PROJECT_MASTER_RETAIL_AI_v1.0.md
```

Do not silently guess. Flag the conflict.

---

# 26. Professional Quality Goal

The goal is **not** a nationwide-retailer ERP.

The goal is:

```text
A small but believable professional internal retail-management product
```

Professionalism comes from:

- consistent UI;
- clear roles;
- reliable workflows;
- validation;
- database constraints;
- backend transactions;
- clean architecture;
- predictable APIs;
- focused testing;
- measured ML performance;
- coherent flow from data → forecast → recommendation.

---

# 27. MVP Success Criteria

### Sales

```text
Staff logs in
→ creates Sale
→ inventory decreases
→ revenue appears on dashboard
```

### Purchase

```text
Manager creates Purchase
→ marks RECEIVED
→ inventory increases
```

### Import

```text
Upload historical CSV
→ preview/validation
→ confirm
→ import
→ duplicate file blocked
```

### Forecast

```text
Admin runs forecast
→ ML predicts demand
→ forecast saved
→ revenue forecast displayed
```

### Recommendation

```text
Forecast exists
→ recommendation generated
→ Manager accepts/adjusts
→ Purchase Draft created
```

### Alerts

```text
Stockout/overstock/expiry risk detected
→ Alert Center shows it
```

### Authorization

```text
Store Manager A
→ cannot access Store B operational data
```

If these scenarios work reliably, the graduation-project core is complete.

---

# 28. Document Status

```text
Version:
PROJECT_MASTER v1.0

Status:
LOCKED FOR MVP
```

Any major scope, architecture, UI-direction or AI-coding-rule change must update this file before implementation.


# 29. Git Workflow Rules

Git is mandatory for this project.

The purpose of Git is:
- track project history;
- create safe checkpoints;
- allow rollback when AI-generated changes break the project;
- keep each feature isolated and reviewable.

Main branch:
main

Rules:

1. Never code directly on main for a non-trivial feature.

2. Before starting a task:
   - check current branch;
   - check git status;
   - ensure previous work is committed.

3. Create one branch per feature/fix.

Examples:

feature/auth
feature/products
feature/inventory
feature/sales
feature/purchases
feature/dashboard
feature/import
feature/ml-forecast
feature/replenishment

fix/inventory-stock
fix/store-authorization

4. One task should produce small, focused commits.

5. Do not combine unrelated changes in one commit.

6. Before commit:
   - run lint;
   - run relevant tests;
   - run type-check/build when appropriate.

7. Never use destructive Git commands automatically.

AI MUST NOT run without explicit approval:

git reset --hard
git clean -fd
git push --force
git rebase --onto
git checkout -- .
git restore . on large scopes

8. AI must not rewrite or delete existing Git history.

9. Before a risky refactor, create a checkpoint commit.

Example:

git commit -m "chore: checkpoint before inventory refactor"

10. If a task fails, prefer reverting to a known good commit rather than trying random fixes repeatedly.

11. AI must report:
   - current branch;
   - files changed;
   - commit proposed;
   - tests performed.

12. AI may suggest Git commands, but destructive rollback commands require user confirmation.
