CREATE VIEW "v_sales_daily_facts" AS
WITH proportions AS (
  SELECT i.id, i.sale_id, i.product_id, s.location_id,
    (s.sold_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS business_date,
    i.quantity, i.line_total, COALESCE(i.promotion_flag, false) AS promotion_flag,
    COALESCE(s.discount_amount, 0) * 100 AS invoice_cents,
    CASE WHEN s.subtotal > 0 THEN COALESCE(s.discount_amount, 0) * 100 * i.line_total / s.subtotal ELSE 0 END AS exact_cents
  FROM sales s JOIN sale_items i ON i.sale_id = s.id
  WHERE s.status = 'COMPLETED'
), ranked AS (
  SELECT *, FLOOR(exact_cents) AS base_cents,
    SUM(FLOOR(exact_cents)) OVER (PARTITION BY sale_id) AS allocated_cents,
    ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY exact_cents - FLOOR(exact_cents) DESC, id) AS remainder_rank
  FROM proportions
)
SELECT location_id, product_id, business_date,
  SUM(quantity) AS quantity_sold,
  SUM(line_total) AS gross_revenue,
  SUM(base_cents + CASE WHEN remainder_rank <= invoice_cents - allocated_cents THEN 1 ELSE 0 END) / 100 AS discount_amount,
  BOOL_OR(promotion_flag) AS promotion_flag,
  ROUND(SUM(line_total) / NULLIF(SUM(quantity), 0), 4) AS average_unit_price
FROM ranked GROUP BY location_id, product_id, business_date;
