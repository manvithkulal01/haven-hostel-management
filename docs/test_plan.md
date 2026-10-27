# Test plan and verification record

## Verification record

Environment: bundled Node.js 24, pnpm-installed project dependencies, Homebrew MySQL 8.4.13. Docker is unavailable. The local MySQL database is a new Homebrew instance; no pre-existing data directory was present.

Final acceptance audit rerun: 2026-10-27. The demo credential audit verified both CLI accounts and all 20 seeded tenant password hashes against their documented temporary passwords without displaying secret values. A frontend authorization-noise defect was fixed: tenant Payments no longer requests the administrator-only allocations list.

| Test | Result | Scope |
|---|---|---|
| MySQL connection/version | Passed | Connected as local root; MySQL 8.4.13 |
| Schema initialization | Passed | Eight base tables installed |
| Views/procedures/trigger | Passed | Three views, two routines, one trigger visible in MySQL metadata |
| Seed data | Passed | 20 sample tenants, 10 rooms, 30 beds, 10 active and 1 historical allocation; seed rerun remained consistent |
| DBMS query script | Passed | All 20 SELECT examples executed without errors |
| MySQL-backed tenant/inventory/allocation/payment/complaint/report workflow | Passed | `npm run test:integration`; isolated test rows cleaned up |
| Simultaneous same-bed allocation | Passed | Two concurrent API calls; exactly one allocation succeeded |
| Stored routines and trigger | Passed | Both allocation/checkout procedures executed; mismatched payment period rejected by trigger |
| Billing month boundaries and partial payment aggregation | Passed | Node unit tests with fixed cases |
| API health and authorization | Passed | Express HTTP: health 200, anonymous 401, role denial 403 |
| Frontend production build | Passed | Vite build |
| Standard `npm test` suite | Passed | 8 passed; one opt-in integration test skipped because it is disabled by default |
| Final audit live API health | Passed | Started Express from `.env`; `GET /api/health` returned HTTP 200; server stopped after check |
| Documented demo credential hashes | Passed | Read-only bcrypt verification for admin, demo tenant, and 20 seeded tenant accounts; values and hashes were not printed |
| Tenant Payments authorization path | Passed after fix | Allocation list request is disabled for tenant role; no unauthorized admin call is made by that view |
| Manual browser workflow | Unverified | No browser interaction was claimed during this audit |
| Docker Compose startup | Unverified | Docker is not installed |

`npm` was not on the interactive PATH, so the npm CLI at `/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js` was invoked with bundled Node.js to run the requested npm script. This ran the same package script and completed successfully. The MySQL integration command used the configured `.env` and the fresh local database.

## Additional MySQL integration coverage

| Case | Result | Evidence |
|---|---|---|
| Login success and failure | Passed | Demo administrator login returned JWT; incorrect password returned 401 |
| Tenant CRUD/search/privacy | Passed | Created, searched, edited, detailed, deactivated; duplicate email returned 409 |
| Room and bed operations | Passed | Created/edited; room/bed activation guards and available status checked |
| Allocation concurrency | Passed | Two simultaneous allocations for one bed returned one 201 and one 409; one active row remained |
| Duplicate allocation and rollback | Passed | Same tenant and occupied bed conflicts returned 409; active allocation count remained one |
| Checkout and history | Passed | Invalid checkout date rejected; valid checkout kept historical row and released bed |
| Procedures | Passed | `sp_allocate_bed` and `sp_checkout` created and closed a test allocation |
| Payments | Passed | Two partial payments and remainder produced correct totals; duplicate reference, negative amount, invalid rent period, and overpayment were rejected |
| Payment privacy/history | Passed | Tenant payment endpoint returned only owned payments, with no password hashes |
| Outstanding dues | Passed | Calculated 7,000 outstanding after partial payments and zero after full payment |
| Payment trigger | Passed | Direct insert with a rent period inconsistent with payment date was rejected |
| Complaint privacy/workflow | Passed | Tenant saw only its complaint; admin resolution and notes were visible to that tenant |
| Reports | Passed | Tenant paid total, period collection, zero outstanding, complaint state, and room occupancy were checked |
| Maintenance | Passed | Zero-cost record created and listed |
| Integration cleanup | Passed | Test-created tenant accounts were absent after completion; FK-dependent rows were removed |

The integration test creates randomly named records and cleans only those records. No database reset/drop command was run. A longer stress test with many competing allocation requests and Docker Compose startup remain unverified.
