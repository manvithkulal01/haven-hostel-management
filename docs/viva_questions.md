# Viva questions and short answers

1. What is the purpose of this system? — To manage hostel occupants, beds, rent, payments and complaints in one relational application.
2. What is a primary key? — A column or set of columns that uniquely identifies a row.
3. What is a foreign key? — A constraint that requires a referenced row to exist.
4. Why use InnoDB? — It supports transactions, row locks and foreign keys.
5. What is 1NF? — Each field holds one atomic value and there are no repeating groups.
6. What is 2NF? — 1NF plus no partial dependency on part of a composite key.
7. What is 3NF? — 2NF plus no transitive dependency among non-key attributes.
8. Why separate users and tenants? — Login credentials and resident profile have different responsibilities.
9. How is password safety handled? — Passwords are stored as bcrypt hashes.
10. What is JWT used for? — It carries signed identity and role claims for authenticated requests.
11. Why validate roles on the server? — A browser control can be bypassed; APIs must enforce access.
12. What does a transaction provide? — An all-or-nothing group of database changes.
13. Why lock rows during allocation? — To serialize competing requests for the same tenant or bed.
14. How is only one active allocation enforced? — Unique indexes on generated nullable active tenant and bed IDs.
15. Why are old allocations retained? — For occupancy and audit history.
16. What is an index? — A data structure that speeds selected lookups at the cost of storage and writes.
17. What is an INNER JOIN? — It returns matching rows from both relations.
18. What is a LEFT JOIN? — It retains every left-side row even without a match.
19. What does GROUP BY do? — It groups rows for aggregate calculations.
20. What is HAVING? — A filter applied after grouping and aggregation.
21. Why use prepared statements? — They separate SQL code from user values and mitigate injection.
22. How are partial payments represented? — Several payment rows can reference the same allocation and rent period.
23. What is a view? — A named query presented like a virtual table.
24. What is a stored procedure? — A reusable sequence of SQL statements stored in the database.
25. Why use a trigger? — To enforce a database rule consistently at insert time.
26. What does referential integrity mean? — Foreign keys prevent invalid references between related tables.
27. Why is payment reference nullable and unique? — A reference may not be supplied, but a supplied one must be unique.
28. What is an API? — A defined interface through which the frontend requests backend operations.
29. Why must tenant endpoints use the token identity? — So users cannot change an ID in the request to access someone else’s data.
30. What are current limitations? — The system uses full-month billing without daily proration; Docker Compose and longer concurrency stress runs were not verified.
