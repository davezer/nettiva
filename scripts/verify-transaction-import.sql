-- Nettiva transaction import verification

SELECT
  COUNT(*) AS report_transactions,
  ROUND(SUM(CASE WHEN category = 'sale' THEN amount_cents ELSE 0 END) / 100.0, 2) AS ebay_sale_net,
  ROUND(SUM(CASE WHEN category = 'selling_fee' THEN amount_cents ELSE 0 END) / 100.0, 2) AS selling_fees,
  ROUND(SUM(CASE WHEN category = 'shipping_label' THEN amount_cents ELSE 0 END) / 100.0, 2) AS shipping_labels
FROM financial_transactions
WHERE source = 'ebay_csv';

SELECT
  COUNT(*) AS orders,
  ROUND(SUM(sale_price_cents + shipping_charged_cents) / 100.0, 2) AS gross_sales
FROM order_items;

SELECT
  category,
  COUNT(*) AS rows,
  ROUND(SUM(amount_cents) / 100.0, 2) AS net_amount
FROM financial_transactions
WHERE source = 'ebay_csv'
GROUP BY category
ORDER BY category;

SELECT
  ROUND(SUM(amount_cents) / 100.0, 2) AS unallocated_pnl_adjustment
FROM financial_transactions
WHERE source = 'ebay_csv'
  AND ebay_order_id IS NULL
  AND category IN (
    'selling_fee', 'shipping_label', 'refund', 'dispute',
    'other_fee', 'adjustment', 'withheld_tax', 'purchase'
  );

SELECT
  oi.title,
  oi.ebay_item_id,
  ROUND((oi.sale_price_cents + oi.shipping_charged_cents) / 100.0, 2) AS gross,
  ROUND(ABS(COALESCE(SUM(
    CASE
      WHEN ft.amount_cents < 0
        AND ft.category IN (
          'selling_fee', 'shipping_label', 'refund', 'dispute',
          'other_fee', 'adjustment', 'withheld_tax', 'purchase'
        )
      THEN ft.amount_cents
      ELSE 0
    END
  ), 0)) / 100.0, 2) AS fees_and_shipping
FROM order_items oi
LEFT JOIN financial_transactions ft
  ON ft.ebay_line_item_id = oi.ebay_line_item_id
GROUP BY oi.id
ORDER BY oi.sold_at DESC;
