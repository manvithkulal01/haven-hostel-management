USE pg_hostel;
DELIMITER $$
DROP TRIGGER IF EXISTS trg_validate_payment_allocation$$
CREATE TRIGGER trg_validate_payment_allocation BEFORE INSERT ON rent_payments FOR EACH ROW
BEGIN
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  SELECT start_date,end_date INTO v_start,v_end FROM allocations WHERE id=NEW.allocation_id;
  IF NEW.payment_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment date cannot be in the future';
  END IF;
  IF NEW.payment_date < v_start OR (v_end IS NOT NULL AND NEW.payment_date > v_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment date must fall within allocation dates';
  END IF;
  IF DATE_FORMAT(NEW.payment_date,'%Y-%m') <> NEW.rent_period THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment date must be in the selected rent period';
  END IF;
  IF NEW.payment_date < STR_TO_DATE(CONCAT(NEW.rent_period,'-01'),'%Y-%m-%d') OR
     NEW.payment_date > LAST_DAY(STR_TO_DATE(CONCAT(NEW.rent_period,'-01'),'%Y-%m-%d')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment date does not match the rent period';
  END IF;
END$$
DELIMITER ;
