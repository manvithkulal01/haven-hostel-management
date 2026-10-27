# PG / Hostel Management System — Project Report

**Student:** [Enter student name]  
**Register number:** [Enter register number]  
**Department / College:** [Enter department and college]  
**Project guide:** [Enter guide name]  
**Academic year:** [Enter academic year]

## Abstract
The PG / Hostel Management System is a web application for managing tenants, rooms, beds, allocations, checkout, rent payments, dues, complaints, maintenance records, and operational reports. A React/Vite client communicates with a Node/Express REST API backed by MySQL 8. Role-based access, database constraints, parameterized queries, and transactions protect resident records and allocation integrity.

## Introduction and problem statement
Hostel operations maintained in paper registers and separate spreadsheets make it difficult to confirm vacancies, preserve allocation history, reconcile partial rent payments, and track maintenance requests. This application records the operations in related tables and offers the administrator and each tenant an appropriate interface.

## Objectives and scope
The project demonstrates a normalized relational schema and functioning database-backed workflows for tenant accounts, inventory, check-in/check-out, manual payments, dues, complaints, and reports. It is an academic project and does not process payments through a gateway, issue legal tenancy contracts, or replace a production accounting system.

## Existing and proposed systems
An existing manual process may depend on registers and spreadsheets. The proposed system uses a single MySQL source of truth, JWT-authenticated API access, a responsive web interface, allocation/payment history, and database-generated reports.

## Requirements
Node.js 20+, npm, MySQL 8, and a modern browser. Docker Compose can run the MySQL service locally. Core requirements include administrator and tenant roles, password hashing, server-side authorization, SQL parameterization, transaction-safe allocation, and history-preserving checkout.

## Architecture
React + Vite frontend → Express REST API → `mysql2/promise` connection pool → MySQL 8. JWT carries signed user identity/role claims; bcryptjs hashes passwords. See [ER diagram and relationship notes](../database/er_diagram.md).

## Database schema and normalization
The schema has eight relations: users, tenants, rooms, beds, allocations, rent_payments, complaints, and maintenance_records. Keys and dependencies are documented in the ERD. Entity attributes are stored once; generated active allocation keys enforce one active tenant and one active occupant per bed. The design satisfies 1NF, 2NF, and 3NF for the listed functional dependencies.

## Implementation
The backend contains authentication/authorization middleware, express-validator request validation, parameterized SQL, database transactions for tenant creation/editing, allocation/check-out, and payment insertion, plus centrally handled API errors. The frontend includes admin and tenant dashboards and dedicated screens for each management workflow. Tenants can only see their own payments and complaints; tenant identity comes from the token rather than a request body.

Rent follows a simple documented policy: a full calendar month is charged for every month overlapping an allocation, including partial first and last months. Each partial payment stores the rent period (`YYYY-MM`); payment totals are summed per allocation and month. The API prevents payments beyond the agreed rent for that period and checks that payment date, period, and allocation dates agree.

## Testing and results
The source workspace was built and tested with bundled Node.js 24 and MySQL 8.4.13. In the final acceptance audit, the Vite production build succeeded, the standard suite reported 8 passed and 1 opt-in test skipped, the MySQL integration suite passed, and a live API health request returned HTTP 200. The schema, seed, views, procedures, trigger, and 20 DBMS queries executed against the local MySQL instance. Integration coverage includes a simultaneous same-bed allocation race, checkout history, partial/full payments and dues, tenant complaint privacy, status changes, and reports. Documented demo credentials were checked against stored bcrypt hashes. Docker Compose and manual browser workflows were not tested; this report does not assert screenshot or browser testing.

## Limitations and future enhancements
The included demo seed uses shared temporary classroom passwords and should only be used in a local demo; replace them before sharing. Docker Compose startup and high-volume concurrency stress testing remain unverified. Potential future work includes password reset/change, audit logging, automatic monthly invoices, daily proration, exportable reports, and multi-property support.

## Conclusion
The application demonstrates relational design, normalization, foreign-key integrity, generated-column uniqueness, transactions, prepared statements, views, procedures, a trigger, role-based authentication, and a database-connected frontend.

## References
- MySQL 8 Reference Manual
- Node.js documentation
- Express documentation
- React documentation
- JSON Web Token introduction and specification
