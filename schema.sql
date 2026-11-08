-- ============================================================================
-- IMPERADOR LOUNGE BAR - Esquema do banco PostgreSQL
-- Gerado por criar_tabelas.py em 08/11/2026 15:07
-- Pode ser executado mais de uma vez (CREATE ... IF NOT EXISTS).
--
-- Cada tabela tem colunas pesquisáveis + a coluna data (JSONB) com o
-- registro completo usado pelo sistema. Exemplos de consulta:
--   SELECT date(created_at) AS dia, sum(total) FROM orders
--     WHERE order_status <> 'cancelado' GROUP BY 1 ORDER BY 1 DESC;
--   SELECT seller_name, count(*), sum(subtotal) FROM orders GROUP BY 1;
--   SELECT name, stock_deposito, stock_bar, stock_uso FROM products ORDER BY name;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  display_order INTEGER,
  hidden_on_site BOOLEAN,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_categories_sort ON categories (sort_key);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  name TEXT,
  price NUMERIC(12,2),
  cost_price NUMERIC(12,2),
  target_markup NUMERIC(8,2),
  available BOOLEAN,
  badge TEXT,
  image TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_menu_items_sort ON menu_items (sort_key);

CREATE TABLE IF NOT EXISTS menu_item_composition (
  id BIGSERIAL PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id TEXT,
  qty NUMERIC(14,4),
  source TEXT,
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_menu_item_composition_parent ON menu_item_composition (parent_id);

CREATE TABLE IF NOT EXISTS dining_tables (
  id TEXT PRIMARY KEY,
  name TEXT,
  area TEXT,
  capacity INTEGER,
  status TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_dining_tables_sort ON dining_tables (sort_key);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  title TEXT,
  post_type TEXT,
  image_url TEXT,
  ig_status TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_social_posts_sort ON social_posts (sort_key);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP,
  table_id TEXT,
  customer_name TEXT,
  source TEXT,
  seller_id TEXT,
  seller_name TEXT,
  payment_method TEXT,
  payment_status TEXT,
  order_status TEXT,
  subtotal NUMERIC(12,2),
  service_fee NUMERIC(12,2),
  total NUMERIC(12,2),
  cost_total NUMERIC(12,2),
  chat_id TEXT,
  client_ref TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_orders_sort ON orders (sort_key);

CREATE INDEX IF NOT EXISTS ix_orders_created_at ON orders (created_at);

CREATE INDEX IF NOT EXISTS ix_orders_seller_id ON orders (seller_id);

CREATE INDEX IF NOT EXISTS ix_orders_payment_status ON orders (payment_status);

CREATE INDEX IF NOT EXISTS ix_orders_table_id ON orders (table_id);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  item_id TEXT,
  name TEXT,
  qty NUMERIC(12,3),
  price NUMERIC(12,2),
  cost_price NUMERIC(12,2),
  notes TEXT,
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_order_items_parent ON order_items (parent_id);

CREATE TABLE IF NOT EXISTS waiter_calls (
  id TEXT PRIMARY KEY,
  table_id TEXT,
  call_type TEXT,
  status TEXT,
  message TEXT,
  created_label TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_waiter_calls_sort ON waiter_calls (sort_key);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  table_id TEXT,
  customer_name TEXT,
  status TEXT,
  created_at TIMESTAMP,
  last_message_at TIMESTAMP,
  unread_staff INTEGER,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chats_sort ON chats (sort_key);

CREATE TABLE IF NOT EXISTS legacy_purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT,
  total NUMERIC(12,2),
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_legacy_purchases_sort ON legacy_purchases (sort_key);

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  due_date TEXT,
  amount NUMERIC(12,2),
  status TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fixed_expenses_sort ON fixed_expenses (sort_key);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  base_salary NUMERIC(12,2),
  bonuses NUMERIC(12,2),
  advances NUMERIC(12,2),
  status TEXT,
  user_id TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_employees_sort ON employees (sort_key);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  unit TEXT,
  content NUMERIC(14,4),
  content_unit TEXT,
  stock_deposito NUMERIC(14,4),
  stock_bar NUMERIC(14,4),
  stock_uso NUMERIC(14,4),
  avg_cost NUMERIC(14,4),
  last_cost NUMERIC(14,4),
  min_stock NUMERIC(14,4),
  supplier TEXT,
  active BOOLEAN,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_products_sort ON products (sort_key);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP,
  movement_type TEXT,
  product_id TEXT,
  product_name TEXT,
  qty NUMERIC(14,4),
  unit TEXT,
  from_location TEXT,
  to_location TEXT,
  cost NUMERIC(12,2),
  reference TEXT,
  user_id TEXT,
  user_name TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_stock_movements_sort ON stock_movements (sort_key);

CREATE INDEX IF NOT EXISTS ix_stock_movements_created_at ON stock_movements (created_at);

CREATE INDEX IF NOT EXISTS ix_stock_movements_product_id ON stock_movements (product_id);

CREATE INDEX IF NOT EXISTS ix_stock_movements_movement_type ON stock_movements (movement_type);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  number TEXT,
  supplier TEXT,
  status TEXT,
  note_value NUMERIC(12,2),
  items_total NUMERIC(12,2),
  received_date DATE,
  purchase_order_id TEXT,
  created_at TIMESTAMP,
  created_by TEXT,
  reviewed_at TIMESTAMP,
  reviewed_by TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_receipts_sort ON receipts (sort_key);

CREATE TABLE IF NOT EXISTS receipt_items (
  id BIGSERIAL PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id TEXT,
  name TEXT,
  note_qty NUMERIC(14,4),
  received_qty NUMERIC(14,4),
  unit_cost NUMERIC(14,4),
  total NUMERIC(12,2),
  lot TEXT,
  expiry TEXT,
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_receipt_items_parent ON receipt_items (parent_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  number TEXT,
  supplier TEXT,
  status TEXT,
  total NUMERIC(12,2),
  expected_date DATE,
  created_at TIMESTAMP,
  sent_at TIMESTAMP,
  received_at TIMESTAMP,
  receipt_id TEXT,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_purchase_orders_sort ON purchase_orders (sort_key);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGSERIAL PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id TEXT,
  name TEXT,
  unit TEXT,
  qty NUMERIC(14,4),
  unit_cost NUMERIC(14,4),
  total NUMERIC(12,2),
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_purchase_order_items_parent ON purchase_order_items (parent_id);

CREATE TABLE IF NOT EXISTS inventories (
  id TEXT PRIMARY KEY,
  number TEXT,
  status TEXT,
  created_at TIMESTAMP,
  finished_at TIMESTAMP,
  adjustments INTEGER,
  value_diff NUMERIC(12,2),
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_inventories_sort ON inventories (sort_key);

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGSERIAL PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id TEXT,
  name TEXT,
  system_deposito NUMERIC(14,4),
  system_bar NUMERIC(14,4),
  system_uso NUMERIC(14,4),
  counted_deposito NUMERIC(14,4),
  counted_bar NUMERIC(14,4),
  counted_uso NUMERIC(14,4),
  avg_cost NUMERIC(14,4),
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_inventory_items_parent ON inventory_items (parent_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  mode TEXT,
  table_id TEXT,
  blocked BOOLEAN,
  created_at TIMESTAMP,
  sort_key BIGINT NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_devices_sort ON devices (sort_key);

CREATE TABLE IF NOT EXISTS admin_roles (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  permissions JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL,
  permissions JSONB NOT NULL,
  commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change BOOLEAN NOT NULL DEFAULT FALSE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  name TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE categories IS 'Categorias do cardápio (Lanches, Tabacaria, Drinks...)';

COMMENT ON TABLE menu_items IS 'Itens vendidos no cardápio, preço, margem e disponibilidade';

COMMENT ON TABLE menu_item_composition IS 'Ficha técnica: produtos do estoque consumidos por item vendido';

COMMENT ON TABLE dining_tables IS 'Mesas e camarotes do salão';

COMMENT ON TABLE social_posts IS 'Postagens publicadas no site e nas redes sociais';

COMMENT ON TABLE orders IS 'Pedidos e vendas (PDV, QR Code, tablet e chat)';

COMMENT ON TABLE order_items IS 'Itens de cada pedido';

COMMENT ON TABLE waiter_calls IS 'Chamados de garçom, conta e carvão';

COMMENT ON TABLE chats IS 'Conversas do pedido pelo chat (mensagens no JSONB)';

COMMENT ON TABLE legacy_purchases IS 'Compras da versão antiga do sistema';

COMMENT ON TABLE fixed_expenses IS 'Despesas fixas mensais';

COMMENT ON TABLE employees IS 'Funcionários e folha de pagamento';

COMMENT ON TABLE products IS 'Produtos do estoque com saldo no depósito, bar (venda) e bar (uso)';

COMMENT ON TABLE stock_movements IS 'Histórico completo de movimentações de estoque';

COMMENT ON TABLE receipts IS 'Notas de entrada (recebimento e aprovação)';

COMMENT ON TABLE receipt_items IS 'Itens das notas de entrada, quantidade da nota x conferida';

COMMENT ON TABLE purchase_orders IS 'Pedidos de compra enviados aos fornecedores';

COMMENT ON TABLE purchase_order_items IS 'Itens dos pedidos de compra';

COMMENT ON TABLE inventories IS 'Inventários (contagem física)';

COMMENT ON TABLE inventory_items IS 'Contagem de cada produto no inventário';

COMMENT ON TABLE devices IS 'Tablets cadastrados no IAM';

COMMENT ON TABLE app_config IS 'Configurações (site, PIX, TV, fornecedores) em chave/valor';

COMMENT ON TABLE admin_users IS 'Usuários do painel (senha com PBKDF2 + salt)';

COMMENT ON TABLE admin_roles IS 'Perfis de permissão criados ou alterados no IAM';

COMMENT ON TABLE media IS 'Fotos enviadas pelo painel';

COMMENT ON TABLE schema_migrations IS 'Versão do esquema do banco';

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;

COMMIT;
