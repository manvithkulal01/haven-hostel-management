USE pg_hostel;
-- 1 Available beds (LEFT JOIN).
SELECT * FROM v_bed_occupancy WHERE availability='Available';
-- 2 Current tenants (INNER JOIN).
SELECT t.full_name,r.room_number,b.label,a.start_date,a.agreed_rent FROM allocations a JOIN tenants t ON t.id=a.tenant_id JOIN beds b ON b.id=a.bed_id JOIN rooms r ON r.id=b.room_id WHERE a.end_date IS NULL;
-- 3 Occupancy by room.
SELECT room_number,COUNT(bed_id) beds,SUM(availability='Occupied') occupied FROM v_bed_occupancy GROUP BY room_id,room_number;
-- 4 Occupancy percentage with safe divide.
SELECT room_number,ROUND(100*SUM(availability='Occupied')/NULLIF(COUNT(*),0),1) occupancy_pct FROM v_bed_occupancy GROUP BY room_id,room_number;
-- 5 Monthly collection.
SELECT rent_period,SUM(amount) collected FROM rent_payments GROUP BY rent_period ORDER BY rent_period;
-- 6 Outstanding dues by tenant, using the documented full calendar-month policy.
WITH RECURSIVE months AS (
  SELECT a.id allocation_id,a.tenant_id,a.agreed_rent,CAST(DATE_FORMAT(a.start_date,'%Y-%m-01') AS DATE) month_start,a.start_date,a.end_date
  FROM allocations a WHERE a.start_date<=CURDATE()
  UNION ALL
  SELECT allocation_id,tenant_id,agreed_rent,DATE_ADD(month_start,INTERVAL 1 MONTH),start_date,end_date
  FROM months WHERE DATE_ADD(month_start,INTERVAL 1 MONTH)<=CAST(DATE_FORMAT(COALESCE(end_date,CURDATE()),'%Y-%m-01') AS DATE)
), paid AS (SELECT allocation_id,rent_period,SUM(amount) amount FROM rent_payments GROUP BY allocation_id,rent_period)
SELECT t.full_name,SUM(m.agreed_rent) billed,COALESCE(SUM(p.amount),0) paid,GREATEST(SUM(m.agreed_rent)-COALESCE(SUM(p.amount),0),0) due
FROM months m JOIN tenants t ON t.id=m.tenant_id LEFT JOIN paid p ON p.allocation_id=m.allocation_id AND p.rent_period=DATE_FORMAT(m.month_start,'%Y-%m')
GROUP BY t.id,t.full_name HAVING due>0 ORDER BY due DESC;
-- 7 Complaints by status.
SELECT status,COUNT(*) total FROM complaints GROUP BY status;
-- 8 Tenants with no payments (subquery).
SELECT t.id,t.full_name FROM tenants t WHERE NOT EXISTS(SELECT 1 FROM allocations a JOIN rent_payments p ON p.allocation_id=a.id WHERE a.tenant_id=t.id);
-- 9 Rooms with no available beds (HAVING).
SELECT r.room_number FROM rooms r LEFT JOIN beds b ON b.room_id=r.id AND b.is_active=1 LEFT JOIN allocations a ON a.bed_id=b.id AND a.end_date IS NULL WHERE r.is_active=1 GROUP BY r.id,r.room_number HAVING COUNT(b.id)=SUM(a.id IS NOT NULL);
-- 10 Previous allocations.
SELECT t.full_name,r.room_number,b.label,a.start_date,a.end_date FROM allocations a JOIN tenants t ON t.id=a.tenant_id JOIN beds b ON b.id=a.bed_id JOIN rooms r ON r.id=b.room_id WHERE a.end_date IS NOT NULL ORDER BY a.end_date DESC;
-- 11 Monthly revenue trend.
SELECT DATE_FORMAT(payment_date,'%Y-%m') month,SUM(amount) revenue FROM rent_payments GROUP BY month ORDER BY month;
-- 12 Payment history by tenant.
SELECT t.full_name,p.payment_date,p.rent_period,p.amount,p.method,p.reference FROM rent_payments p JOIN allocations a ON a.id=p.allocation_id JOIN tenants t ON t.id=a.tenant_id ORDER BY p.payment_date DESC;
-- 13 Average agreed rent.
SELECT AVG(agreed_rent) average_rent FROM allocations;
-- 14 Highest payment (MAX).
SELECT MAX(amount) highest_payment FROM rent_payments;
-- 15 Tenant summary with count and sum.
SELECT t.id,t.full_name,COUNT(DISTINCT a.id) allocations,COALESCE(SUM(p.amount),0) paid FROM tenants t LEFT JOIN allocations a ON a.tenant_id=t.id LEFT JOIN rent_payments p ON p.allocation_id=a.id GROUP BY t.id,t.full_name;
-- 16 Rooms whose average bed rent exceeds property average.
SELECT r.room_number,AVG(b.monthly_rent) avg_rent FROM rooms r JOIN beds b ON b.room_id=r.id GROUP BY r.id,r.room_number HAVING AVG(b.monthly_rent)>(SELECT AVG(monthly_rent) FROM beds);
-- 17 Open complaint details.
SELECT * FROM v_open_complaints ORDER BY created_at;
-- 18 Total billed and paid by month (payments grouped by stored rent period).
SELECT rent_period,SUM(amount) paid FROM rent_payments GROUP BY rent_period ORDER BY rent_period;
-- 19 Maintenance expenditure by room.
SELECT r.room_number,COUNT(m.id) jobs,SUM(m.cost) total_cost FROM rooms r LEFT JOIN maintenance_records m ON m.room_id=r.id GROUP BY r.id,r.room_number;
-- 20 Allocations ordered by most recent start.
SELECT id,tenant_id,bed_id,start_date,end_date,agreed_rent FROM allocations ORDER BY start_date DESC;