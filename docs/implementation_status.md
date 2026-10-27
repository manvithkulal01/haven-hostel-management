# Implementation status

## Completed in this workspace

- [x] Existing React/Vite project retained and expanded; React Router navigation uses browser paths.
- [x] Login/logout, authenticated user profile, and role-specific dashboards.
- [x] Tenant listing/search/filter, create, edit, details/history, activate/deactivate with active-allocation guard.
- [x] Room and bed CRUD/status, room occupancy, bed availability, and race-safe inventory activation/deactivation.
- [x] Tenant check-in and checkout with transactions, locking, uniqueness constraints, and preserved allocation history.
- [x] Manual rent recording, full/partial payments, payment history, calendar-month dues and reports.
- [x] Tenant-scoped complaint submission/listing, administrator status/resolution updates.
- [x] Occupancy, tenant, payment, dues, and complaint report endpoints/screens.
- [x] MySQL schema, repeatable sample seed, views, stored procedures, trigger, 20 DBMS queries, ERD, setup and course documents.
- [x] MySQL 8.4.13 Homebrew service running locally; new `.env` created because none existed, with a generated JWT secret and blank password for the fresh local root account. Secret values were not displayed.
- [x] Schema installed; eight expected base tables and primary/foreign/unique/check constraints verified through `information_schema`.
- [x] Seed installed and rerun successfully: 20 sample tenants, 10 rooms, 30 beds, 10 active allocations, 1 historical allocation, 11 sample payments, 4 complaints spanning all three states, and 1 maintenance record.
- [x] Three views, two stored procedures, and the payment trigger installed and verified in MySQL metadata.
- [x] All 20 statements in `database/dbms_queries.sql` executed without error.
- [x] `npm run test:integration` passed against MySQL 8.4.13: tenant CRUD/privacy, room/bed management, same-bed concurrent allocations (one winner), duplicate allocations, checkout history, partial and completed rent, dues, complaints, reports, stored procedures, and trigger rejection. Test-owned records were cleaned up; no integration tenant rows remain.
- [x] Standard automated suite: 8 passed, 1 opt-in MySQL test skipped when integration mode is off.
- [x] Vite production build passed; API started from `.env`; `/api/health` returned HTTP 200.
- [x] Final acceptance audit (2026-10-27): rechecked API/UI contracts and security boundaries, verified the documented demo passwords against all 20 seeded tenant hashes plus the two CLI-created accounts without printing hashes or secrets, and reran the regular suite, MySQL integration suite, production build, and live HTTP health check.
- [x] Fixed the tenant Payments screen so it no longer calls the administrator-only `/allocations` endpoint; the allocation list is fetched only for administrators.

## Remaining verification

- [ ] Docker Compose path remains unverified because Docker is not installed.
- [ ] A separate long-running concurrency stress test is not included; the two-request concurrent allocation race passed in the database integration test.
- [ ] Manual browser interaction and Docker Compose startup remain unverified. The live verification in this audit exercised the API over HTTP and ran the database-backed integration workflow; it did not claim browser testing.

The local MySQL service is still running. Stop it with `brew services stop mysql@8.4` when it is no longer needed. The application `.env` was newly created and is ignored by Git; no pre-existing secret or database was overwritten.
