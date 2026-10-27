USE pg_hostel;
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_allocate_bed$$
CREATE PROCEDURE sp_allocate_bed(IN p_tenant BIGINT UNSIGNED, IN p_bed BIGINT UNSIGNED, IN p_start DATE, IN p_rent DECIMAL(10,2))
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  DECLARE EXIT HANDLER FOR NOT FOUND BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  IF p_start > CURDATE() OR p_rent <= 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Check-in date or rent is invalid'; END IF;
  SELECT id INTO v_id FROM tenants WHERE id=p_tenant AND is_active=1 FOR UPDATE;
  SELECT b.id INTO v_id FROM beds b JOIN rooms r ON r.id=b.room_id WHERE b.id=p_bed AND b.is_active=1 AND r.is_active=1 FOR UPDATE;
  -- Unique generated active keys are the final race-safe duplicate guard.
  INSERT INTO allocations(tenant_id,bed_id,start_date,agreed_rent) VALUES(p_tenant,p_bed,p_start,p_rent);
  COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_checkout$$
CREATE PROCEDURE sp_checkout(IN p_allocation BIGINT UNSIGNED, IN p_end DATE)
BEGIN
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  DECLARE EXIT HANDLER FOR NOT FOUND BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT start_date,end_date INTO v_start,v_end FROM allocations WHERE id=p_allocation FOR UPDATE;
  IF p_end IS NULL OR v_end IS NOT NULL OR p_end < v_start OR p_end > CURDATE() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Active allocation not found or checkout date is invalid'; END IF;
  UPDATE allocations SET end_date=p_end WHERE id=p_allocation;
  COMMIT;
END$$
DELIMITER ;
