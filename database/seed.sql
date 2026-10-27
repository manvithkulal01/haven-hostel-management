USE pg_hostel;
-- Reproducible fictional inventory and resident sample. `npm run admin` creates the administrator and extra demo tenant login.
INSERT IGNORE INTO rooms(room_number,floor) VALUES ('101',1),('102',1),('103',1),('201',2),('202',2),('203',2),('301',3),('302',3),('303',3),('304',3);
INSERT IGNORE INTO beds(room_id,label,monthly_rent) SELECT r.id,x.label,8500+(r.floor*500) FROM rooms r JOIN (SELECT 'A' label UNION ALL SELECT 'B' UNION ALL SELECT 'C') x;
-- Optional tenant demo account; the CLI also creates or refreshes it.
INSERT INTO tenants(user_id,full_name,email,phone) SELECT u.id,'Demo Tenant','tenant@haven.local','+91 90000 00000' FROM users u WHERE u.email='tenant@haven.local' AND NOT EXISTS(SELECT 1 FROM tenants t WHERE t.user_id=u.id);-- Twenty fictional tenant accounts. Shared demonstration password: TenantDemo123!
-- The hash is bcrypt; use only for local classroom demonstration.
INSERT INTO users(email,password_hash,role) VALUES
('tenant01@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant02@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant03@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant04@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant05@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant06@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant07@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant08@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant09@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant10@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant11@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant12@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant13@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant14@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant15@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant16@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant17@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant18@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant19@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant'),('tenant20@haven.local','$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6','tenant')
ON DUPLICATE KEY UPDATE role=VALUES(role);
INSERT INTO tenants(user_id,full_name,email,phone)
SELECT u.id,CONCAT('Sample Tenant ',LPAD(n.n,2,'0')),u.email,CONCAT('+91 90000 ',LPAD(n.n,5,'0'))
FROM users u JOIN (SELECT 1 n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19 UNION SELECT 20) n ON u.email=CONCAT('tenant',LPAD(n.n,2,'0'),'@haven.local')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);
-- Ten active allocations; remaining fictional tenants are eligible for assignment.
INSERT IGNORE INTO allocations(tenant_id,bed_id,start_date,agreed_rent)
SELECT t.id,b.id,DATE_SUB(CURDATE(),INTERVAL 3 MONTH),b.monthly_rent
FROM tenants t JOIN beds b ON b.id=(SELECT MIN(b2.id) FROM beds b2 WHERE b2.is_active=1)
WHERE t.email='tenant01@haven.local';
INSERT IGNORE INTO allocations(tenant_id,bed_id,start_date,agreed_rent)
SELECT t.id,b.id,DATE_SUB(CURDATE(),INTERVAL 2 MONTH),bed.monthly_rent
FROM tenants t JOIN (SELECT id,ROW_NUMBER() OVER(ORDER BY id) AS bed_num FROM beds WHERE is_active=1) b ON b.bed_num=CAST(SUBSTRING(t.email,7,2) AS UNSIGNED) JOIN beds bed ON bed.id=b.id
WHERE t.email BETWEEN 'tenant02@haven.local' AND 'tenant10@haven.local';
INSERT IGNORE INTO rent_payments(allocation_id,amount,payment_date,method,reference,rent_period)
SELECT a.id,IF(t.email='tenant01@haven.local',3000,a.agreed_rent),CURDATE(),'UPI',CONCAT('SEED-',t.email),DATE_FORMAT(CURDATE(),'%Y-%m')
FROM allocations a JOIN tenants t ON t.id=a.tenant_id WHERE t.email BETWEEN 'tenant01@haven.local' AND 'tenant10@haven.local';
INSERT INTO complaints(tenant_id,category,description,priority,status)
SELECT t.id,'Maintenance','Sample request for demonstration: inspect the room fixture.','Medium',CASE WHEN MOD(t.id,3)=0 THEN 'In Progress' ELSE 'Open' END FROM tenants t WHERE t.email BETWEEN 'tenant01@haven.local' AND 'tenant04@haven.local' AND NOT EXISTS(SELECT 1 FROM complaints c WHERE c.tenant_id=t.id AND c.category='Maintenance' AND c.description='Sample request for demonstration: inspect the room fixture.');

-- One checkout history record, inserted idempotently.
INSERT INTO allocations(tenant_id,bed_id,start_date,end_date,agreed_rent)
SELECT t.id,b.id,'2025-03-01','2025-06-01',b.monthly_rent
FROM tenants t JOIN beds b ON b.id=(SELECT MAX(b2.id) FROM beds b2 WHERE b2.is_active=1)
WHERE t.email='tenant20@haven.local' AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.tenant_id=t.id AND a.start_date='2025-03-01');
-- A second part-payment for the first tenant; together the two rows remain below a month's rent.
INSERT IGNORE INTO rent_payments(allocation_id,amount,payment_date,method,reference,rent_period)
SELECT a.id,1500,CURDATE(),'Cash','SEED-PARTIAL-2',DATE_FORMAT(CURDATE(),'%Y-%m')
FROM allocations a JOIN tenants t ON t.id=a.tenant_id WHERE t.email='tenant01@haven.local';
INSERT INTO maintenance_records(room_id,description,cost,completed_on)
SELECT id,'Routine inspection sample',0,CURDATE() FROM rooms WHERE room_number='101'
AND NOT EXISTS(SELECT 1 FROM maintenance_records m WHERE m.room_id=rooms.id AND m.description='Routine inspection sample');

UPDATE complaints c JOIN tenants t ON t.id=c.tenant_id SET c.status='Resolved',c.resolution_notes='Sample resolved request',c.resolved_at=COALESCE(c.resolved_at,CURRENT_TIMESTAMP) WHERE t.email='tenant04@haven.local' AND c.description='Sample request for demonstration: inspect the room fixture.';
