# Haven — PG / Hostel Management System

A medium-sized undergraduate project for managing a hostel using a React + Vite client, an Express REST API, and MySQL 8. It includes role-based login, tenant and inventory management, bed check-in/check-out, manual rent payments, calendar-month dues, complaints, maintenance records, and reports. Business data is loaded from MySQL; the UI does not use mock records.

## Requirements

- macOS, Node.js 20 or newer, and npm (pnpm also works)
- MySQL 8 server, either installed locally or run with Docker Compose
- A terminal in the project folder

## Setup on macOS

```sh
test -e .env || cp .env.example .env
# Edit .env: set DB_PASSWORD and a random JWT_SECRET of at least 32 characters.
npm install
```

### Option A: Homebrew MySQL

```sh
brew install mysql@8.4
brew services start mysql@8.4
export PATH="$(brew --prefix mysql@8.4)/bin:$PATH"
mysql --version
mysql -h 127.0.0.1 -u root -p < database/schema.sql
mysql -h 127.0.0.1 -u root -p < database/views.sql
mysql -h 127.0.0.1 -u root -p < database/routines.sql
mysql -h 127.0.0.1 -u root -p < database/triggers.sql
mysql -h 127.0.0.1 -u root -p < database/seed.sql
npm run admin
npm run dev
```

Use the database credentials in `.env` for the app. If your local root account has no password, set `DB_PASSWORD=` accordingly. The SQL scripts create the `pg_hostel` database. They do not drop tables or delete existing records. The schema script is intended for a new database; it does not migrate a previous schema version.

### Option B: Docker Compose database

Docker Compose was not installed in the implementation environment, so this setup is provided but not executed here.

```sh
# Set DB_PASSWORD in .env first; use a strong local-only value.
docker compose up -d mysql
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < database/schema.sql
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < database/views.sql
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < database/routines.sql
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < database/triggers.sql
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < database/seed.sql
npm run admin
npm run dev
```

Stop the local DB container with `docker compose down`; persistent database files remain in the named volume. Do not use `docker compose down -v` if you need to keep its data.

The application starts at http://localhost:5173 and the API at http://localhost:4000. Check http://localhost:4000/api/health for API status. Run `npm run build` for the production frontend build and `npm test` for automated checks. After MySQL setup and demo-account creation, run `npm run test:integration` for the opt-in database-backed workflow test; it creates uniquely named test records and cleans up those records afterward.

## Environment variables

See `.env.example`:

- `PORT`: Express port, default 4000.
- `CLIENT_ORIGIN`: allowed browser origin, default `http://localhost:5173`.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: MySQL connection.
- `JWT_SECRET`: random secret of 32+ characters; never commit `.env`.
- `JWT_EXPIRES_IN`: token lifetime, default `8h`.

## Demo accounts

After the SQL scripts and `npm run admin` succeed, the CLI creates/refreshes `admin@haven.local` and `tenant@haven.local`, both with temporary password `ChangeMe123!`. Change them before sharing the environment. The sample seed creates `tenant01@haven.local` through `tenant20@haven.local`, each with temporary password `TenantDemo123!`. The MySQL 8.4.13 seed was executed and all 20 sample tenant rows were verified; the seed bcrypt hash was checked against this password. The CLI creates the admin user hash using bcryptjs and does not store plaintext passwords.

## Workflows

- **Administrator:** create/edit tenant contacts, activate/deactivate accounts, manage rooms and beds, inspect occupancy, check tenants in/out, record full or partial payments, review dues, update complaints, and open reports.
- **Tenant:** view current stay, own payment history and dues, submit a complaint, and track only their own complaints/profile.
- Tenant routes derive tenant identity from the signed token. A deactivated tenant is rejected on subsequent authenticated API requests.
- Bed allocation is wrapped in an InnoDB transaction with tenant/bed row locks. Unique generated columns on active allocation rows are a database-level concurrency guard.
- Checkout sets `end_date`, retaining the historical allocation and releasing the bed for a future allocation.
- Rent uses a simple billing policy: a full monthly rent is charged for every calendar month overlapping an allocation, including partial start/end months. Payments identify their `rent_period` (`YYYY-MM`) and partial payments are summed for that period. The API rejects an overpayment in a rent period and checks payment date/allocation consistency.

## API

All endpoints are prefixed with `/api`. Login returns a JWT; send it as `Authorization: Bearer <token>`. JSON bodies use the field names below.

| Method and path | Access | Purpose |
|---|---|---|
| `POST /auth/login` | Public | `{email,password}` |
| `GET /auth/me` | Signed in | Authenticated profile |
| `GET /dashboard` | Signed in | Role-specific database totals |
| `GET /tenants?q=&active=` | Admin | Search/list tenants |
| `POST /tenants` | Admin | `{full_name,email,phone,password}` |
| `GET /tenants/:id` | Admin | Details, allocation and payment history |
| `PUT /tenants/:id` | Admin | `{full_name,email,phone}` |
| `PATCH /tenants/:id/active` | Admin | `{is_active}`; active occupants must check out first |
| `GET /rooms`, `GET /rooms/:id` | Admin | Room occupancy and bed detail |
| `POST /rooms` | Admin | `{room_number,floor}` |
| `PUT /rooms/:id` | Admin | `{room_number,floor}` |
| `PATCH /rooms/:id/active` | Admin | `{is_active}`; active room allocations prevent deactivation |
| `GET /beds` | Admin | Inventory, availability, current occupant |
| `POST /beds` | Admin | `{room_id,label,monthly_rent}` |
| `PUT /beds/:id` | Admin | `{label,monthly_rent}` |
| `PATCH /beds/:id/active` | Admin | `{is_active}`; occupied beds cannot be deactivated |
| `GET/POST /allocations` | Admin | History / `{tenant_id,bed_id,start_date,agreed_rent}` |
| `POST /allocations/:id/checkout` | Admin | `{end_date}` |
| `GET/POST /payments` | Admin | History / `{allocation_id,amount,payment_date,method,reference,rent_period}` |
| `GET /payments/mine` | Tenant | Own payment history |
| `GET /reports/dues` | Admin | Month-based balances by tenant |
| `GET /reports/occupancy` | Admin | Room capacity and occupancy |
| `GET /reports/tenants` | Admin | Account, allocation, and payment summary |
| `GET /reports/payments` | Admin | Collection grouped by rent period |
| `GET /reports/complaints` | Admin | Complaint counts by state and priority |
| `GET/POST /complaints` | Admin/tenant | List all/own complaints; tenant submits `{category,description,priority}` |
| `PATCH /complaints/:id` | Admin | `{status,resolution_notes}` |
| `GET/POST /maintenance` | Admin | Maintenance records and `{room_id,complaint_id,description,cost,completed_on}` |

Example login:

```sh
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@haven.local","password":"ChangeMe123!"}'
```

## Database and DBMS concepts

`database/schema.sql` defines eight normalized relations: users, tenants, rooms, beds, allocations, rent_payments, complaints, and maintenance_records. It uses primary/foreign keys, unique constraints, checks, generated-column unique indexes, and indexes for search/report joins. `database/er_diagram.md` contains the Mermaid ERD, relationships, normalization notes, and functional dependencies.

- `views.sql`: bed occupancy, payment totals, open complaints.
- `routines.sql`: transactional allocation and checkout procedures.
- `triggers.sql`: payment-date and rent-period integrity.
- `dbms_queries.sql`: 20 commented queries for joins, aggregation, grouping, HAVING, subqueries, occupancy, history, payments, dues and maintenance.
- `seed.sql`: 20 fictional tenants, 10 rooms with 3 beds each, active and historic allocations, full/partial payments, open/in-progress/resolved complaints, and maintenance data.

See [`docs/implementation_status.md`](docs/implementation_status.md) for the completion checklist.

## Tests and verification status

MySQL 8.4.13 was installed with Homebrew and started locally. The schema, seed (including a repeat run), views, routines, and trigger were installed successfully; the 20 DBMS query script executed without errors. `npm run test:integration` passed against the local database, including concurrency, checkout, partial/full payment, dues, tenant privacy, complaints, reports, procedures, and trigger checks. `npm test` passes the non-database suite; its opt-in integration test is skipped unless enabled. The production build and API health check also passed. Docker Compose remains unverified because Docker is unavailable. See `docs/test_plan.md` for the recorded results.

Final acceptance audit on 2026-10-27 reran `npm test` (8 passed, 1 opt-in integration test skipped), `npm run test:integration` (passed), `npm run build` (passed), and a live `/api/health` request (HTTP 200). The documented demo password hashes were checked read-only. The audit also fixed the tenant Payments view so it does not make an administrator-only API request. Manual browser workflows, Docker Compose, and a high-volume allocation stress test remain unverified.

## Troubleshooting

- `ECONNREFUSED`: start MySQL/Compose and confirm `DB_HOST` and `DB_PORT`.
- Access denied: check credentials and MySQL grants in `.env`.
- `ER_NO_SUCH_TABLE`: execute schema before views, procedures, trigger, seed, and CLI.
- Port conflict: change `PORT` or the Vite port in `client/vite.config.js`.
- Login says server auth is not configured: set a JWT secret at least 32 characters long and restart the API.
- A unique email/reference error means that value is already in use; payment reference may be left blank.
