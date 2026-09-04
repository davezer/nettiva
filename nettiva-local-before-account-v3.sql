PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_initial.sql','2026-09-02 19:42:33');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_transaction_normalization.sql','2026-09-02 19:42:34');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003_manual_expenses.sql','2026-09-02 20:44:04');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0004_inventory_organization.sql','2026-09-02 21:15:08');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0005_sku_control.sql','2026-09-02 23:39:07');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0006_accounts_workspaces.sql','2026-09-02 23:52:39');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(7,'0007_auth_tenant_enforcement.sql','2026-09-03 20:42:42');
CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
, workspace_id TEXT NOT NULL DEFAULT 'workspace_default');
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  filename TEXT,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  orders_imported INTEGER NOT NULL DEFAULT 0,
  transactions_imported INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, workspace_id TEXT NOT NULL DEFAULT 'workspace_default');
INSERT INTO "import_batches" ("id","source","filename","rows_seen","rows_imported","orders_imported","transactions_imported","imported_at","workspace_id") VALUES('67ceb7c4-90ac-45e4-9f17-622f7e4e39b6','ebay_csv','Transaction-Sep-02-2026-11_07_03-0700-13325224824.csv',16,16,7,30,'2026-09-02T20:00:39.947Z','workspace_default');
INSERT INTO "import_batches" ("id","source","filename","rows_seen","rows_imported","orders_imported","transactions_imported","imported_at","workspace_id") VALUES('365c42d6-bd81-4426-a77e-21c82be15648','ebay_csv','Transaction-Sep-02-2026-11_07_03-0700-13325224824.csv',16,16,7,30,'2026-09-02T20:01:53.901Z','workspace_default');
ANALYZE sqlite_schema;
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('d1_migrations','sqlite_autoindex_d1_migrations_1','1 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_sequences','idx_sku_sequence_workspace','4 4 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_sequences','sqlite_autoindex_sku_sequences_1','4 4 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('workspace_members','idx_workspace_members_user','1 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('workspace_members','sqlite_autoindex_workspace_members_1','1 1 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('workspaces','sqlite_autoindex_workspaces_2','1 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('workspaces','sqlite_autoindex_workspaces_1','1 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('import_batches','idx_import_batches_workspace_imported','2 2 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('import_batches','sqlite_autoindex_import_batches_1','2 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_reservations','idx_sku_reservation_ebay_item','19 19');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_reservations','idx_sku_reservation_workspace_status','19 19 19');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_reservations','idx_sku_reservation_workspace_source','19 19 19');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_reservations','idx_sku_reservation_workspace_prefix','19 19 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_reservations','sqlite_autoindex_sku_reservations_2','19 19 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('sku_reservations','sqlite_autoindex_sku_reservations_1','19 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_workspace_line','33 33 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_workspace_order','33 33 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_workspace_date','33 33 3');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_expense_category','33 11');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_import_batch','33 17');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_source','33 17');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_category','33 6');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_order_id','33 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_transaction_date','33 3');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','idx_financial_line_item_id','33 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','sqlite_autoindex_financial_transactions_2','33 33 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('financial_transactions','sqlite_autoindex_financial_transactions_1','33 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('order_items','idx_order_items_workspace_sold','7 7 2');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('order_items','idx_order_items_sold_at','7 2');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('order_items','idx_order_items_inventory_id','7 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('order_items','idx_order_items_order_id','7 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('order_items','sqlite_autoindex_order_items_2','7 7 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('order_items','sqlite_autoindex_order_items_1','7 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('orders','idx_orders_workspace_created','7 7 2');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('orders','idx_orders_created_at_ebay','7 2');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('orders','sqlite_autoindex_orders_2','7 7 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('orders','sqlite_autoindex_orders_1','7 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','idx_inventory_workspace_sku','10 10 3');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','idx_inventory_workspace_status','10 10 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','idx_inventory_intake_batch','10 10');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','idx_inventory_category','10 4');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','idx_inventory_status','10 5');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','sqlite_autoindex_inventory_items_2','10 10 2');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('inventory_items','sqlite_autoindex_inventory_items_1','10 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('users','idx_users_auth_user_unique','0 0');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('users','idx_users_email_unique','0 0');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('users','sqlite_autoindex_users_1','1 1');
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, auth_user_id TEXT);
INSERT INTO "users" ("id","email","display_name","status","created_at","updated_at","auth_user_id") VALUES('user_local_owner','davezer27@gmail.com','Dave','active','2026-09-02 23:52:38','2026-09-03T21:14:00.463Z','bNpbuWPnu5DgVw7FSQzBJQhJg3IrkPKG');
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'founder',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "workspaces" ("id","name","slug","plan","status","created_by_user_id","created_at","updated_at") VALUES('workspace_default','Rare Frequency','primary-workspace','founder','active','user_local_owner','2026-09-02 23:52:38','2026-09-02T23:55:45.698Z');
CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);
INSERT INTO "workspace_members" ("workspace_id","user_id","role","status","created_at","updated_at") VALUES('workspace_default','user_local_owner','owner','active','2026-09-02 23:52:38','2026-09-02 23:52:38');
CREATE TABLE sku_sequences (
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  prefix TEXT NOT NULL COLLATE NOCASE,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, prefix)
);
INSERT INTO "sku_sequences" ("workspace_id","prefix","last_number","updated_at") VALUES('workspace_default','AFG',15,'2026-09-02T23:39:14.659Z');
INSERT INTO "sku_sequences" ("workspace_id","prefix","last_number","updated_at") VALUES('workspace_default','FNK',2,'2026-09-02T23:40:11.190Z');
INSERT INTO "sku_sequences" ("workspace_id","prefix","last_number","updated_at") VALUES('workspace_default','MOV',3,'2026-09-02T23:40:12.048Z');
INSERT INTO "sku_sequences" ("workspace_id","prefix","last_number","updated_at") VALUES('workspace_default','ELC',2,'2026-09-02T23:40:12.663Z');
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
INSERT INTO "user" ("id","name","email","emailVerified","image","createdAt","updatedAt") VALUES('bNpbuWPnu5DgVw7FSQzBJQhJg3IrkPKG','Dave','davezer27@gmail.com',0,NULL,'2026-09-03T20:55:52.027Z','2026-09-03T20:55:52.027Z');
CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
INSERT INTO "session" ("id","userId","token","expiresAt","ipAddress","userAgent","createdAt","updatedAt") VALUES('FHkq1ybACdOWUKml6Ptl2lHxoLe99krV','bNpbuWPnu5DgVw7FSQzBJQhJg3IrkPKG','2m3czakIjYUS2aexVavYnTlyhQwO8lAG','2026-09-17T20:57:07.324Z','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','2026-09-03T20:57:07.324Z','2026-09-03T20:57:07.324Z');
CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE (issuer, accountId)
);
INSERT INTO "account" ("id","userId","issuer","accountId","providerId","accessToken","refreshToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","idToken","password","createdAt","updatedAt") VALUES('RlkrzVrT7D2LZ9oyEOfBJ5Gy4EGUNQZX','bNpbuWPnu5DgVw7FSQzBJQhJg3IrkPKG','local:credential','bNpbuWPnu5DgVw7FSQzBJQhJg3IrkPKG','credential',NULL,NULL,NULL,NULL,NULL,NULL,'a26c859720337a7d6a19aa0265d950c0:ea59b84a08e1744368e40fc3080f3823c9295f94049a7a702fc14f5c3de17e48db894e958ccb5d98620bdb04e5ddb874b1ff876f3da4e8901ed486ae80e80c03','2026-09-03T20:55:52.154Z','2026-09-03T20:55:52.154Z');
CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "rateLimit" (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  lastRequest INTEGER NOT NULL
);
INSERT INTO "rateLimit" ("id","key","count","lastRequest") VALUES('gOsq4bWHFMGXOQgGywYNCOBDoqxf7a3v','127.0.0.1|/sign-up/email',1,1788468951737);
INSERT INTO "rateLimit" ("id","key","count","lastRequest") VALUES('7LB9Soz97FpzasN3mJ2YlsEon2wTTw4E','127.0.0.1|/sign-out',1,1788469013876);
INSERT INTO "rateLimit" ("id","key","count","lastRequest") VALUES('J9rk7oI2Gh7sx6vRmnGSs4Kn1hek3AS3','127.0.0.1|/sign-in/email',1,1788469027014);
CREATE TABLE ebay_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  refresh_token_expires_at INTEGER,
  scopes TEXT NOT NULL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default'
);
CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  sku TEXT,
  ebay_item_id TEXT,
  condition_name TEXT,
  image_url TEXT,
  purchase_cost_cents INTEGER,
  source TEXT,
  storage_location TEXT,
  purchased_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inventory_category TEXT NOT NULL DEFAULT 'other',
  intake_batch_id TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_item_id)
);
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:117218609714','2026 Bowman Chrome Konnor Griffin Top 100 BTP-1 /25 Pittsburgh Pirates',NULL,'117218609714',NULL,NULL,3500,'whatnot',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:02:33.447Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:117218612700','2023 Topps Series 1 Shohei Ohtani All Aces Blue Back Parallel SP #AA-11 Angels',NULL,'117218612700',NULL,NULL,2500,'blaster',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:02:40.501Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:116159702562','2023 Topps Allen & Ginter X JONATHAN VALENA Tattoo Auto /25 Silver Ink MA-JV',NULL,'116159702562',NULL,NULL,2500,'blaster box',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:02:55.555Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:117218613665','Topps 2022 Series 1 Shohei Ohtani Jersey Number Medallion Angels #JNM-SO',NULL,'117218613665',NULL,NULL,2500,'blaster box',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:03:05.134Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:116454612554','2023 Topps Brooklyn Collection #21 Jordan Walker Base RC Rookie Cardinals',NULL,'116454612554',NULL,NULL,2000,'whatnot',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:03:15.785Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:117218617080','Topps 2026 Series 1 Soto Schwarber Ohtani NL HR Leaders Gold Sparkle /50 #84',NULL,'117218617080',NULL,NULL,2000,'blaster box',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:03:23.791Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('ebay:116454626793','2023 Bowman''s Best Jordan Walker Shellacked RC #SH-22 Cardinals',NULL,'116454626793',NULL,NULL,2000,'whatnot',NULL,NULL,'sold','2026-09-02 20:00:42','2026-09-02T20:03:33.487Z','other',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('manual:ab18bbec-f7ae-42e9-93c7-8a31c00cbc99','1991 WWF Undertaker','AFG-0001',NULL,'Used',NULL,0,'owned',NULL,'1991-06-04T12:00:00.000Z','unlisted','2026-09-02T21:04:38.352Z','2026-09-02T21:04:38.352Z','action_figures',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('manual:9fdfe479-af83-42f8-9c81-96be5d7d9079','WWF IRS Figure','AFG-0002',NULL,'used',NULL,0,'owned',NULL,'1992-09-02T12:00:00.000Z','unlisted','2026-09-02T21:17:20.688Z','2026-09-02T21:17:20.688Z','action_figures',NULL,'workspace_default');
INSERT INTO "inventory_items" ("id","title","sku","ebay_item_id","condition_name","image_url","purchase_cost_cents","source","storage_location","purchased_at","status","created_at","updated_at","inventory_category","intake_batch_id","workspace_id") VALUES('manual:473d0c89-d351-4d20-84a7-54726ccb91eb','World War Z Steelbook','MOV-0001',NULL,'New',NULL,1000,'bought new',NULL,'2012-06-05T12:00:00.000Z','unlisted','2026-09-02T21:18:08.999Z','2026-09-02T21:18:08.999Z','movies',NULL,'workspace_default');
CREATE TABLE listings (
  id TEXT PRIMARY KEY NOT NULL,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  ebay_listing_id TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  quantity INTEGER NOT NULL DEFAULT 1,
  listed_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  view_item_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_listing_id)
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_order_id TEXT NOT NULL,
  created_at_ebay TEXT NOT NULL,
  status TEXT NOT NULL,
  gross_total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_order_id)
);
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:21-14717-46387','21-14717-46387','2026-06-06T12:00:00.000Z','PAID',19073,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:11-14731-49820','11-14731-49820','2026-06-05T12:00:00.000Z','PAID',85570,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:24-14698-07187','24-14698-07187','2026-05-30T12:00:00.000Z','PAID',1324,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:17-14689-69268','17-14689-69268','2026-05-29T12:00:00.000Z','PAID',6489,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:02-14712-32228','02-14712-32228','2026-05-28T12:00:00.000Z','PAID',714,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:11-14694-81155','11-14694-81155','2026-05-28T12:00:00.000Z','PAID',4583,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "orders" ("id","ebay_order_id","created_at_ebay","status","gross_total_cents","currency","created_at","updated_at","workspace_id") VALUES('ebay:26-14463-51407','26-14463-51407','2026-04-10T12:00:00.000Z','PAID',314,'USD','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
CREATE TABLE order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  inventory_item_id TEXT REFERENCES inventory_items(id),
  ebay_line_item_id TEXT NOT NULL,
  ebay_item_id TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  sale_price_cents INTEGER NOT NULL DEFAULT 0,
  shipping_charged_cents INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_line_item_id)
);
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:21-14717-46387:117218609714','ebay:21-14717-46387','ebay:117218609714','csv:21-14717-46387:117218609714','117218609714','2026 Bowman Chrome Konnor Griffin Top 100 BTP-1 /25 Pittsburgh Pirates',1,18500,573,'2026-06-06T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:11-14731-49820:117218612700','ebay:11-14731-49820','ebay:117218612700','csv:11-14731-49820:117218612700','117218612700','2023 Topps Series 1 Shohei Ohtani All Aces Blue Back Parallel SP #AA-11 Angels',1,85000,570,'2026-06-05T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:24-14698-07187:116159702562','ebay:24-14698-07187','ebay:116159702562','csv:24-14698-07187:116159702562','116159702562','2023 Topps Allen & Ginter X JONATHAN VALENA Tattoo Auto /25 Silver Ink MA-JV',1,800,524,'2026-05-30T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:17-14689-69268:117218613665','ebay:17-14689-69268','ebay:117218613665','csv:17-14689-69268:117218613665','117218613665','Topps 2022 Series 1 Shohei Ohtani Jersey Number Medallion Angels #JNM-SO',1,5900,589,'2026-05-29T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:02-14712-32228:116454612554','ebay:02-14712-32228','ebay:116454612554','csv:02-14712-32228:116454612554','116454612554','2023 Topps Brooklyn Collection #21 Jordan Walker Base RC Rookie Cardinals',1,599,115,'2026-05-28T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:11-14694-81155:117218617080','ebay:11-14694-81155','ebay:117218617080','csv:11-14694-81155:117218617080','117218617080','Topps 2026 Series 1 Soto Schwarber Ohtani NL HR Leaders Gold Sparkle /50 #84',1,4000,583,'2026-05-28T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
INSERT INTO "order_items" ("id","order_id","inventory_item_id","ebay_line_item_id","ebay_item_id","title","quantity","sale_price_cents","shipping_charged_cents","sold_at","created_at","updated_at","workspace_id") VALUES('orderitem:26-14463-51407:116454626793','ebay:26-14463-51407','ebay:116454626793','csv:26-14463-51407:116454626793','116454626793','2023 Bowman''s Best Jordan Walker Shellacked RC #SH-22 Cardinals',1,199,115,'2026-04-10T12:00:00.000Z','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','workspace_default');
CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ebay_transaction_id TEXT NOT NULL,
  ebay_order_id TEXT,
  ebay_line_item_id TEXT,
  transaction_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  transaction_date TEXT NOT NULL,
  fee_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  booking_entry TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  source TEXT NOT NULL DEFAULT 'ebay_api',
  description TEXT,
  payout_id TEXT,
  reference_id TEXT,
  gross_amount_cents INTEGER,
  item_subtotal_cents INTEGER,
  shipping_charged_cents INTEGER,
  ebay_collected_tax_cents INTEGER,
  import_batch_id TEXT,
  expense_category TEXT,
  memo TEXT,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  UNIQUE (workspace_id, ebay_transaction_id)
);
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:3dc7dd9460fbb68027d4bd7d','csv:3dc7dd9460fbb68027d4bd7d',NULL,NULL,'Payout',-97193,'USD','2026-06-26T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','payout','ebay_csv','Seller-initiated express payout. Express payout fee $2.0 deducted,$969.93 sent. Usually arrive within 30 min.','7590676431','Bank reference ID ODXR7RKRAWTK26L',-97193,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:fde2bdcff207d1c8e008ce27','csv:fde2bdcff207d1c8e008ce27',NULL,NULL,'Other fee',200,'USD','2026-06-26T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','other_fee','ebay_csv','Payout fee credit for delayed payout.',NULL,'Payout ID 7590676383',200,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:517a24594901167f1330d4a9','csv:517a24594901167f1330d4a9',NULL,NULL,'Payout',96993,'USD','2026-06-26T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','payout','ebay_csv','Payout credit for payout 7590676383 sent to available funds.','7590676383',NULL,96993,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:2492b301fc57ea033836ba3c','csv:2492b301fc57ea033836ba3c',NULL,NULL,'Payout',-97193,'USD','2026-06-26T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','payout','ebay_csv','Seller-initiated payout. canceled: Credited on Jun 26.','7590676383','Bank reference ID UR2H64TRMSJ4P63',-97193,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:9087f6de991fe0a60a10fd86','csv:9087f6de991fe0a60a10fd86','11-14731-49820','csv:11-14731-49820:117218612700','Shipping label',-2278,'USD','2026-06-07T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','shipping_label','ebay_csv','USPS',NULL,'Tracking no. 9402108106245239255316',-2278,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:8af773c908f35e9239a95a47','csv:8af773c908f35e9239a95a47','21-14717-46387','csv:21-14717-46387:117218609714','Shipping label',-573,'USD','2026-06-07T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','shipping_label','ebay_csv','USPS',NULL,'Tracking no. 9400108106244205672067',-573,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10086568316321','10086568316321','21-14717-46387','csv:21-14717-46387:117218609714','Order',16354,'USD','2026-06-06T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,19073,18500,573,1145,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10086568316321:fee:final-value-fee-fixed','10086568316321:fee:final-value-fee-fixed','21-14717-46387','csv:21-14717-46387:117218609714','SELLING_FEE',-40,'USD','2026-06-06T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10086568316321',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10086568316321:fee:final-value-fee-variable','10086568316321:fee:final-value-fee-variable','21-14717-46387','csv:21-14717-46387:117218609714','SELLING_FEE',-2679,'USD','2026-06-06T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10086568316321',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082494438611','10082494438611','11-14731-49820','csv:11-14731-49820:117218612700','Order',73308,'USD','2026-06-05T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,85570,85000,570,6674,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082494438611:fee:final-value-fee-fixed','10082494438611:fee:final-value-fee-fixed','11-14731-49820','csv:11-14731-49820:117218612700','SELLING_FEE',-40,'USD','2026-06-05T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10082494438611',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082494438611:fee:final-value-fee-variable','10082494438611:fee:final-value-fee-variable','11-14731-49820','csv:11-14731-49820:117218612700','SELLING_FEE',-12222,'USD','2026-06-05T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10082494438611',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:498c572c8790e943dfde03cd','csv:498c572c8790e943dfde03cd','02-14712-32228','csv:02-14712-32228:116454612554','Shipping label',-74,'USD','2026-06-01T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','shipping_label','ebay_csv','eBay Standard Envelope',NULL,'Tracking no. ESUS335515576',-74,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:3507c77ee855ca7f19096eeb','csv:3507c77ee855ca7f19096eeb',NULL,NULL,'Shipping label',-1696,'USD','2026-05-30T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','shipping_label','ebay_csv','USPS for bulk purchase of 3 labels for 3 separate orders',NULL,NULL,-1696,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10081227673724','10081227673724','24-14698-07187','csv:24-14698-07187:116159702562','Order',1093,'USD','2026-05-30T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,1324,800,524,118,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10081227673724:fee:final-value-fee-fixed','10081227673724:fee:final-value-fee-fixed','24-14698-07187','csv:24-14698-07187:116159702562','SELLING_FEE',-40,'USD','2026-05-30T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10081227673724',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10081227673724:fee:final-value-fee-variable','10081227673724:fee:final-value-fee-variable','24-14698-07187','csv:24-14698-07187:116159702562','SELLING_FEE',-191,'USD','2026-05-30T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10081227673724',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082218431717','10082218431717','17-14689-69268','csv:17-14689-69268:117218613665','Order',5520,'USD','2026-05-29T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,6489,5900,589,519,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082218431717:fee:final-value-fee-fixed','10082218431717:fee:final-value-fee-fixed','17-14689-69268','csv:17-14689-69268:117218613665','SELLING_FEE',-40,'USD','2026-05-29T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10082218431717',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082218431717:fee:final-value-fee-variable','10082218431717:fee:final-value-fee-variable','17-14689-69268','csv:17-14689-69268:117218613665','SELLING_FEE',-929,'USD','2026-05-29T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10082218431717',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10081506315702','10081506315702','02-14712-32228','csv:02-14712-32228:116454612554','Order',583,'USD','2026-05-28T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,714,599,115,48,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10081506315702:fee:final-value-fee-fixed','10081506315702:fee:final-value-fee-fixed','02-14712-32228','csv:02-14712-32228:116454612554','SELLING_FEE',-30,'USD','2026-05-28T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10081506315702',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10081506315702:fee:final-value-fee-variable','10081506315702:fee:final-value-fee-variable','02-14712-32228','csv:02-14712-32228:116454612554','SELLING_FEE',-101,'USD','2026-05-28T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10081506315702',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082284688111','10082284688111','11-14694-81155','csv:11-14694-81155:117218617080','Order',3904,'USD','2026-05-28T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,4583,4000,583,240,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082284688111:fee:final-value-fee-fixed','10082284688111:fee:final-value-fee-fixed','11-14694-81155','csv:11-14694-81155:117218617080','SELLING_FEE',-40,'USD','2026-05-28T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10082284688111',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10082284688111:fee:final-value-fee-variable','10082284688111:fee:final-value-fee-variable','11-14694-81155','csv:11-14694-81155:117218617080','SELLING_FEE',-639,'USD','2026-05-28T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10082284688111',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:csv:9da7b907b3bd51e1829c780c','csv:9da7b907b3bd51e1829c780c','26-14463-51407','csv:26-14463-51407:116454626793','Shipping label',-74,'USD','2026-04-16T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','shipping_label','ebay_csv','eBay Standard Envelope',NULL,'Tracking no. ESUS325009864',-74,0,0,0,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10079813403926','10079813403926','26-14463-51407','csv:26-14463-51407:116454626793','Order',241,'USD','2026-04-10T12:00:00.000Z',NULL,'2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','CREDIT','sale','ebay_csv',NULL,NULL,NULL,314,199,115,13,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10079813403926:fee:final-value-fee-fixed','10079813403926:fee:final-value-fee-fixed','26-14463-51407','csv:26-14463-51407:116454626793','SELLING_FEE',-30,'USD','2026-04-10T12:00:00.000Z','Final Value Fee - fixed','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - fixed',NULL,'10079813403926',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:10079813403926:fee:final-value-fee-variable','10079813403926:fee:final-value-fee-variable','26-14463-51407','csv:26-14463-51407:116454626793','SELLING_FEE',-43,'USD','2026-04-10T12:00:00.000Z','Final Value Fee - variable','2026-09-02 20:00:42','2026-09-02T20:01:53.901Z','DEBIT','selling_fee','ebay_csv','Final Value Fee - variable',NULL,'10079813403926',NULL,NULL,NULL,NULL,'365c42d6-bd81-4426-a77e-21c82be15648',NULL,NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:manual:1cebed39-327b-46b6-838f-75ba3a6b245f','manual:1cebed39-327b-46b6-838f-75ba3a6b245f',NULL,NULL,'MANUAL_EXPENSE',-1000,'USD','2026-09-02T12:00:00.000Z',NULL,'2026-09-02 20:51:01','2026-09-02T20:51:01.118Z','DEBIT','business_expense','manual','Top Loaders',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'inventory_supplies',NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:manual:882350ea-a8ae-499c-ba26-bf3dfc97241d','manual:882350ea-a8ae-499c-ba26-bf3dfc97241d',NULL,NULL,'MANUAL_EXPENSE',-500,'USD','2026-09-02T12:00:00.000Z',NULL,'2026-09-02 20:51:17','2026-09-02T20:51:17.603Z','DEBIT','business_expense','manual','Penny Sleeves',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'inventory_supplies',NULL,'workspace_default');
INSERT INTO "financial_transactions" ("id","ebay_transaction_id","ebay_order_id","ebay_line_item_id","transaction_type","amount_cents","currency","transaction_date","fee_type","created_at","updated_at","booking_entry","category","source","description","payout_id","reference_id","gross_amount_cents","item_subtotal_cents","shipping_charged_cents","ebay_collected_tax_cents","import_batch_id","expense_category","memo","workspace_id") VALUES('finance:manual:58a57ac1-b88d-479c-a2f7-e9e0d39b5747','manual:58a57ac1-b88d-479c-a2f7-e9e0d39b5747',NULL,NULL,'MANUAL_EXPENSE',-5000,'USD','2025-05-05T12:00:00.000Z',NULL,'2026-09-02 23:57:27','2026-09-02T23:57:27.437Z','DEBIT','business_expense','manual','Bubble Mailers',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'shipping_supplies','Walmart','workspace_default');
CREATE TABLE sku_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'workspace_default',
  sku TEXT NOT NULL COLLATE NOCASE,
  prefix TEXT NOT NULL COLLATE NOCASE,
  sequence_number INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_bootstrap',
  status TEXT NOT NULL DEFAULT 'reserved',
  title TEXT,
  ebay_item_id TEXT,
  inventory_item_id TEXT REFERENCES inventory_items(id),
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, sku)
);
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0003','workspace_default','AFG-0003','AFG',3,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0004','workspace_default','AFG-0004','AFG',4,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0005','workspace_default','AFG-0005','AFG',5,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0006','workspace_default','AFG-0006','AFG',6,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0007','workspace_default','AFG-0007','AFG',7,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0008','workspace_default','AFG-0008','AFG',8,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0009','workspace_default','AFG-0009','AFG',9,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0010','workspace_default','AFG-0010','AFG',10,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0011','workspace_default','AFG-0011','AFG',11,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0012','workspace_default','AFG-0012','AFG',12,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0013','workspace_default','AFG-0013','AFG',13,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0014','workspace_default','AFG-0014','AFG',14,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:afg-0015','workspace_default','AFG-0015','AFG',15,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:39:11.025Z','2026-09-02T23:39:11.025Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:fnk-0001','workspace_default','FNK-0001','FNK',1,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:40:10.887Z','2026-09-02T23:40:10.887Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:fnk-0002','workspace_default','FNK-0002','FNK',2,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:40:10.887Z','2026-09-02T23:40:10.887Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:mov-0002','workspace_default','MOV-0002','MOV',2,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:40:10.887Z','2026-09-02T23:40:10.887Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:mov-0003','workspace_default','MOV-0003','MOV',3,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:40:10.887Z','2026-09-02T23:40:10.887Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:elc-0001','workspace_default','ELC-0001','ELC',1,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:40:10.887Z','2026-09-02T23:40:10.887Z');
INSERT INTO "sku_reservations" ("id","workspace_id","sku","prefix","sequence_number","source","status","title","ebay_item_id","inventory_item_id","reserved_at","updated_at") VALUES('reserve:elc-0002','workspace_default','ELC-0002','ELC',2,'manual_bootstrap','reserved',NULL,NULL,NULL,'2026-09-02T23:40:10.887Z','2026-09-02T23:40:10.887Z');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',7);
CREATE UNIQUE INDEX idx_users_email_unique
  ON users(LOWER(email))
  WHERE email IS NOT NULL;
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_sync_jobs_workspace_started ON sync_jobs(workspace_id, started_at);
CREATE INDEX idx_import_batches_workspace_imported ON import_batches(workspace_id, imported_at);
CREATE INDEX idx_sku_sequence_workspace ON sku_sequences(workspace_id, prefix);
CREATE UNIQUE INDEX idx_users_auth_user_unique
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_auth_session_user ON "session"(userId);
CREATE INDEX idx_auth_session_expires ON "session"(expiresAt);
CREATE INDEX idx_auth_account_user ON "account"(userId);
CREATE INDEX idx_auth_verification_identifier ON "verification"(identifier);
CREATE INDEX idx_auth_verification_expires ON "verification"(expiresAt);
CREATE INDEX idx_auth_rate_limit_last_request ON "rateLimit"(lastRequest);
CREATE UNIQUE INDEX idx_ebay_accounts_workspace_unique
  ON ebay_accounts(workspace_id);
CREATE INDEX idx_inventory_status ON inventory_items(status);
CREATE INDEX idx_inventory_category ON inventory_items(inventory_category);
CREATE INDEX idx_inventory_intake_batch ON inventory_items(intake_batch_id);
CREATE INDEX idx_inventory_workspace_status ON inventory_items(workspace_id, status);
CREATE INDEX idx_inventory_workspace_sku ON inventory_items(workspace_id, sku);
CREATE INDEX idx_listings_inventory_status ON listings(inventory_item_id, status);
CREATE INDEX idx_listings_workspace_status ON listings(workspace_id, status);
CREATE INDEX idx_orders_created_at_ebay ON orders(created_at_ebay);
CREATE INDEX idx_orders_workspace_created ON orders(workspace_id, created_at_ebay);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_inventory_id ON order_items(inventory_item_id);
CREATE INDEX idx_order_items_sold_at ON order_items(sold_at);
CREATE INDEX idx_order_items_workspace_sold ON order_items(workspace_id, sold_at);
CREATE INDEX idx_financial_line_item_id ON financial_transactions(ebay_line_item_id);
CREATE INDEX idx_financial_transaction_date ON financial_transactions(transaction_date);
CREATE INDEX idx_financial_order_id ON financial_transactions(ebay_order_id);
CREATE INDEX idx_financial_category ON financial_transactions(category);
CREATE INDEX idx_financial_source ON financial_transactions(source);
CREATE INDEX idx_financial_import_batch ON financial_transactions(import_batch_id);
CREATE INDEX idx_financial_expense_category ON financial_transactions(expense_category);
CREATE INDEX idx_financial_workspace_date ON financial_transactions(workspace_id, transaction_date);
CREATE INDEX idx_financial_workspace_order ON financial_transactions(workspace_id, ebay_order_id);
CREATE INDEX idx_financial_workspace_line ON financial_transactions(workspace_id, ebay_line_item_id);
CREATE INDEX idx_sku_reservation_workspace_prefix ON sku_reservations(workspace_id, prefix);
CREATE INDEX idx_sku_reservation_workspace_source ON sku_reservations(workspace_id, source);
CREATE INDEX idx_sku_reservation_workspace_status ON sku_reservations(workspace_id, status);
CREATE INDEX idx_sku_reservation_ebay_item ON sku_reservations(ebay_item_id);