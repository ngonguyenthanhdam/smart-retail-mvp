# PROJECT_STATE

> **Project:** RetailSense AI  
> **Purpose:** Track current implementation status, Git state, known issues, and next task  
> **Status:** ACTIVE  
> **Update rule:** Update this file after every meaningful coding task or milestone

---

# 1. Current Phase

```text
PHASE:
Project Foundation / Pre-Implementation

STATUS:
READY TO START PROJECT SKELETON
```

The project design foundation is complete.

Coding has not started yet.

---

# 2. Source-of-Truth Documents

The project currently uses these primary documents:

```text
1. PROJECT_MASTER_RETAIL_AI_v1.0.md
2. DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
3. ML_AND_DATA_SPEC_RETAIL_AI_v1.0.md
4. PROJECT_STATE.md
```

Responsibilities:

```text
PROJECT_MASTER_RETAIL_AI_v1.0.md
→ Overall scope, UI direction, architecture, roles, coding rules.

DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
→ Database tables, PK/FK, relationships, constraints, DB rules.

ML_AND_DATA_SPEC_RETAIL_AI_v1.0.md
→ Dataset, preprocessing, features, models, metrics, inference rules.

PROJECT_STATE.md
→ Current implementation status, Git checkpoint, known issues, next task.
```

---

# 3. Git State

Current state:

```text
Repository Initialized:
NO

Current Branch:
N/A

Base Branch:
main

Last Stable Commit:
N/A

Last Stable Tag:
N/A

Uncommitted Changes:
N/A
```

## Required first Git milestone

When coding begins:

```text
1. Initialize Git repository.
2. Create main branch.
3. Add .gitignore.
4. Add project documentation.
5. Create initial project skeleton.
6. Run initial build/checks.
7. Commit stable foundation.
```

Recommended first commit:

```text
chore: initialize RetailSense AI project foundation
```

Recommended first tag after the skeleton works:

```text
v0.1-foundation
```

---

# 4. Implementation Status

Legend:

```text
NOT_STARTED
IN_PROGRESS
DONE
BLOCKED
OPTIONAL
```

| Module | Status | Notes |
|---|---|---|
| Project Skeleton | NOT_STARTED | Next task |
| Git Repository | NOT_STARTED | Initialize before feature development |
| Docker Compose | NOT_STARTED | PostgreSQL + app services |
| Frontend Base | NOT_STARTED | Next.js + TypeScript + Tailwind |
| Backend Base | NOT_STARTED | NestJS + Prisma |
| PostgreSQL | NOT_STARTED | Based on Database Spec v1.1 MVP |
| ML Service Base | NOT_STARTED | FastAPI |
| Authentication | NOT_STARTED | Login/logout/forgot password/RBAC |
| User Management | NOT_STARTED | Admin only |
| Location Management | NOT_STARTED | Warehouse + Stores |
| Category Management | NOT_STARTED | Multi-level category |
| Product Management | NOT_STARTED | Global product master |
| Store Product Settings | NOT_STARTED | Price/safety stock/min stock |
| Inventory | NOT_STARTED | Lots + expiry |
| Purchase Management | NOT_STARTED | DRAFT → RECEIVED |
| Sales Management | NOT_STARTED | Transactional sale + stock deduction |
| Expense Management | NOT_STARTED | Basic operational expenses |
| Dashboard | NOT_STARTED | Admin + Store Manager |
| Excel/CSV Import | NOT_STARTED | Preview/validate/confirm |
| ML Data Preparation | NOT_STARTED | FreshRetailNet preprocessing |
| ML Baseline | NOT_STARTED | Naive or Moving Average |
| ML Candidate Models | NOT_STARTED | RF/XGBoost/LightGBM |
| ML Evaluation | NOT_STARTED | MAE/RMSE/WAPE |
| ML Inference API | NOT_STARTED | FastAPI |
| Forecast Integration | NOT_STARTED | NestJS ↔ FastAPI |
| Revenue Forecast | NOT_STARTED | Demand × estimated price |
| Replenishment | NOT_STARTED | Accept/Adjust/Reject |
| Purchase from Recommendation | NOT_STARTED | Create Purchase Draft |
| Inventory Alerts | NOT_STARTED | Stockout/Overstock/Expiry |
| Testing | NOT_STARTED | Critical business rules |
| Final Integration | NOT_STARTED | End-to-end verification |
| Deployment | NOT_STARTED | After MVP is stable |

---

# 5. Completed Work

The following design work is complete:

```text
DONE
- Project scope defined.
- MVP scope reduced and locked.
- User roles defined.
- UI direction defined.
- Tech stack selected.
- Backend architecture selected.
- Database MVP designed.
- 18 core database tables defined.
- Database relationships defined.
- FreshRetailNet usage strategy defined.
- ML problem defined.
- ML target/features/split/model candidates defined.
- Git workflow rules defined.
- AI coding rules defined.
```

No implementation module is marked DONE yet.

---

# 6. Current Architecture

```text
Next.js Frontend
       │
       │ REST
       ▼
NestJS Backend
   │        │
   │        └──────────► FastAPI ML Service
   │                         │
   ▼                         ▼
PostgreSQL               Saved ML Model
```

Architecture style:

```text
Frontend:
Next.js

Backend:
NestJS modular monolith

Database:
PostgreSQL + Prisma

ML:
Python + FastAPI

Development:
Docker Compose + Git
```

---

# 7. Current Database Version

```text
Database Spec:
DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md

Status:
LOCKED FOR MVP

Core Tables:
18

Views:
2
```

AI must not change database structure without updating the database specification first.

---

# 8. Current ML Version

```text
ML Spec:
ML_AND_DATA_SPEC_RETAIL_AI_v1.0.md

Dataset:
FreshRetailNet-50K

Primary Task:
Demand Forecasting

Prediction Unit:
Store × Product

Forecast Horizons:
1 month
3 months

Target:
sale_amount

Split:
Chronological

Metrics:
MAE
RMSE
WAPE
```

Final model has **not** been selected yet.

The following remain intentionally open until EDA/experiments:

```text
Exact train date range
Exact validation date range
Exact test date range
Final feature subset
Final model
Final hyperparameters
Final metric values
```

---

# 9. Known Issues / Open Decisions

Current known issues:

```text
NONE BLOCKING IMPLEMENTATION
```

Open items that will be decided later:

```text
1. Final visual brand/name may change from RetailSense AI.

2. Exact UI component details will be decided during frontend implementation.

3. Exact REST endpoint naming will be finalized as modules are implemented.

4. Exact FreshRetailNet train/validation/test dates will be decided after EDA.

5. Final ML model will be selected from measured experiment results.

6. Final deployment target has not yet been selected.
```

These are not blockers for starting the project skeleton.

---

# 10. Current Risks

## Scope Creep

Risk:

```text
Adding non-MVP features too early.
```

Rule:

```text
Do not implement deferred features until MVP is complete.
```

## AI Over-Modification

Risk:

```text
AI changes unrelated files or architecture.
```

Rule:

```text
One task at a time.
Small commits.
Review changed files.
No architecture/schema change without approval.
```

## Git Safety

Risk:

```text
AI uses destructive commands.
```

Rule:

AI must not run without explicit user approval:

```text
git reset --hard
git clean -fd
git push --force
git checkout -- .
git restore . on broad scope
```

## ML Data Leakage

Risk:

```text
Future demand leaks into model features.
```

Rule:

```text
Chronological split only.
Lag/rolling features use past data only.
```

---

# 11. Next Task

## NEXT TASK: Initialize Project Skeleton

Goal:

Create the initial repository structure without implementing business features yet.

Target structure:

```text
retail-ai-system/
│
├── docs/
│   ├── PROJECT_MASTER_RETAIL_AI_v1.0.md
│   ├── DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
│   ├── ML_AND_DATA_SPEC_RETAIL_AI_v1.0.md
│   └── PROJECT_STATE.md
│
├── frontend/
│
├── backend/
│
├── ml-service/
│
├── .gitignore
├── docker-compose.yml
└── README.md
```

The skeleton task should include:

```text
1. Initialize Git.
2. Configure .gitignore.
3. Create Next.js frontend.
4. Create NestJS backend.
5. Create FastAPI ML service skeleton.
6. Configure PostgreSQL in Docker Compose.
7. Add environment templates.
8. Verify all services start.
9. Run lint/build/basic health checks.
10. Commit the stable foundation.
11. Tag v0.1-foundation.
12. Update PROJECT_STATE.md.
```

No product, inventory, sales, purchase or ML business logic should be implemented in this first task.

---

# 12. Planned Implementation Order

```text
Foundation
   ↓
Authentication + RBAC
   ↓
Locations
   ↓
Categories + Products
   ↓
Store Product Settings
   ↓
Inventory
   ↓
Purchases
   ↓
Sales
   ↓
Expenses
   ↓
Dashboard
   ↓
Excel/CSV Import
   ↓
ML Data Preparation
   ↓
ML Model Training/Evaluation
   ↓
FastAPI Inference
   ↓
Forecast Integration
   ↓
Replenishment
   ↓
Alerts
   ↓
Testing / Integration
   ↓
Deployment
```

Do not skip forward unless there is a clear reason.

---

# 13. Stable Milestone Plan

Recommended Git milestone tags:

```text
v0.1-foundation
v0.2-auth
v0.3-products
v0.4-inventory
v0.5-sales-purchases
v0.6-dashboard-import
v0.7-ml-model
v0.8-forecast-integration
v0.9-mvp
v1.0-final
```

Tags are created only when the corresponding milestone is stable.

---

# 14. AI Task Start Checklist

Before AI starts a coding task:

```text
[ ] Read PROJECT_MASTER_RETAIL_AI_v1.0.md
[ ] Read PROJECT_STATE.md

If DB-related:
[ ] Read DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md

If ML-related:
[ ] Read ML_AND_DATA_SPEC_RETAIL_AI_v1.0.md

[ ] Check current Git branch
[ ] Check git status
[ ] Confirm previous work is committed
[ ] Identify exact task scope
[ ] Identify files expected to change
[ ] Identify required tests
```

---

# 15. AI Task Completion Checklist

Before AI says a task is complete:

```text
[ ] Requested behavior implemented
[ ] No unrelated architecture changes
[ ] No unauthorized database changes
[ ] Relevant lint passes
[ ] Relevant tests pass
[ ] Type-check passes where applicable
[ ] Build passes where applicable
[ ] Changed files reviewed
[ ] Commit message proposed/created
[ ] PROJECT_STATE.md updated
```

---

# 16. How To Update This File

After each task update at least:

```text
Current Phase
Git State
Implementation Status
Completed Work
Known Issues
Next Task
```

When a stable commit is created, update:

```text
Last Stable Commit:
<real commit hash>

Last Stable Tag:
<tag if created>
```

Never invent a Git hash.

---

# 17. Current Snapshot

```text
PROJECT:
RetailSense AI

PHASE:
Foundation / Pre-Implementation

DATABASE:
Designed and locked

ML/DATA:
Designed and locked for MVP

UI/UX:
Direction locked

BACKEND:
Architecture locked

GIT:
Not initialized yet

CODE:
Not started

BLOCKERS:
None

NEXT:
Initialize repository and project skeleton
```

---

# 18. Document Status

```text
Version:
PROJECT_STATE v1.0

Last Updated:
Initial pre-implementation state

Status:
ACTIVE
```

This file is expected to change frequently.

Unlike the Project Master, Database Spec and ML/Data Spec, this document is a **living project status document**.
