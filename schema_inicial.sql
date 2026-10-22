-- ============================================================
-- Software de Gestión Comercial - Esquema Inicial (PostgreSQL)
-- Multi-tenant por company_id
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CORE
-- ============================================================

CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    legal_name      VARCHAR(250),
    tax_id          VARCHAR(50),          -- CUIT / NIF / RFC
    logo_url        TEXT,
    country_code    CHAR(2) DEFAULT 'AR',
    currency_code   CHAR(3) DEFAULT 'ARS',
    business_type   VARCHAR(50),          -- retail, wholesale, services, ecommerce, mixed
    settings        JSONB DEFAULT '{}',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(20),
    address         TEXT,
    city            VARCHAR(100),
    is_main         BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE warehouses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id),
    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(20),
    is_main         BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = rol del sistema
    name            VARCHAR(80) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN DEFAULT FALSE,
    permissions     JSONB DEFAULT '[]',   -- lista de permisos
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   TEXT NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    phone           VARCHAR(40),
    role_id         UUID REFERENCES roles(id),
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, email)
);

-- ============================================================
-- PARTNERS (Clientes + Proveedores unificados)
-- ============================================================

CREATE TABLE partners (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    partner_type    VARCHAR(20) NOT NULL, -- customer, supplier, both
    name            VARCHAR(250) NOT NULL,
    legal_name      VARCHAR(250),
    tax_id          VARCHAR(50),
    email           VARCHAR(255),
    phone           VARCHAR(40),
    mobile          VARCHAR(40),
    address         TEXT,
    city            VARCHAR(100),
    country_code    CHAR(2),
    price_list_id   UUID,                 -- lista de precios por defecto
    payment_term_days INTEGER DEFAULT 0,
    credit_limit    NUMERIC(14,2) DEFAULT 0,
    tags            TEXT[],
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partners_company ON partners(company_id);
CREATE INDEX idx_partners_type ON partners(company_id, partner_type);

-- ============================================================
-- CATÁLOGO
-- ============================================================

CREATE TABLE product_categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES product_categories(id),
    name            VARCHAR(150) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES product_categories(id),
    sku             VARCHAR(80),
    barcode         VARCHAR(80),
    name            VARCHAR(250) NOT NULL,
    description     TEXT,
    product_type    VARCHAR(20) DEFAULT 'product', -- product, service, kit
    track_stock     BOOLEAN DEFAULT TRUE,
    track_lots      BOOLEAN DEFAULT FALSE,
    track_serials   BOOLEAN DEFAULT FALSE,
    cost_method     VARCHAR(20) DEFAULT 'average', -- fifo, lifo, average
    unit            VARCHAR(30) DEFAULT 'unit',
    weight          NUMERIC(12,3),
    is_active       BOOLEAN DEFAULT TRUE,
    images          JSONB DEFAULT '[]',
    attributes      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku             VARCHAR(80),
    barcode         VARCHAR(80),
    name            VARCHAR(150),          -- ej: "Rojo / XL"
    attributes      JSONB DEFAULT '{}',    -- {color: "Rojo", size: "XL"}
    cost            NUMERIC(14,4) DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE price_lists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    currency_code   CHAR(3) DEFAULT 'ARS',
    is_default      BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE price_list_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    price_list_id   UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id      UUID REFERENCES product_variants(id),
    price           NUMERIC(14,4) NOT NULL,
    min_qty         NUMERIC(12,3) DEFAULT 1,
    UNIQUE(price_list_id, product_id, variant_id, min_qty)
);

-- ============================================================
-- INVENTARIO
-- ============================================================

CREATE TABLE stock_levels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    quantity        NUMERIC(14,3) DEFAULT 0,
    reserved_qty    NUMERIC(14,3) DEFAULT 0,
    min_qty         NUMERIC(14,3) DEFAULT 0,
    max_qty         NUMERIC(14,3),
    UNIQUE(warehouse_id, product_id, variant_id)
);

CREATE TABLE stock_moves (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    move_type       VARCHAR(30) NOT NULL, -- in, out, transfer, adjustment
    quantity        NUMERIC(14,3) NOT NULL,
    reference_type  VARCHAR(40),          -- sale_order, purchase_order, etc.
    reference_id    UUID,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VENTAS
-- ============================================================

CREATE TABLE sale_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id),
    partner_id      UUID NOT NULL REFERENCES partners(id),
    order_number    VARCHAR(40) NOT NULL,
    order_type      VARCHAR(20) DEFAULT 'quotation', -- quotation, order
    status          VARCHAR(30) DEFAULT 'draft',     -- draft, confirmed, done, cancelled
    order_date      DATE DEFAULT CURRENT_DATE,
    validity_date   DATE,
    currency_code   CHAR(3),
    subtotal        NUMERIC(14,2) DEFAULT 0,
    tax_amount      NUMERIC(14,2) DEFAULT 0,
    total           NUMERIC(14,2) DEFAULT 0,
    notes           TEXT,
    salesperson_id  UUID REFERENCES users(id),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, order_number)
);

CREATE TABLE sale_order_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES sale_orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    variant_id      UUID REFERENCES product_variants(id),
    description     TEXT,
    quantity        NUMERIC(14,3) NOT NULL,
    unit_price      NUMERIC(14,4) NOT NULL,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    tax_rate        NUMERIC(5,2) DEFAULT 0,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    partner_id      UUID NOT NULL REFERENCES partners(id),
    sale_order_id   UUID REFERENCES sale_orders(id),
    invoice_number  VARCHAR(40) NOT NULL,
    invoice_type    VARCHAR(20) DEFAULT 'invoice', -- invoice, credit_note, debit_note
    status          VARCHAR(30) DEFAULT 'draft',
    invoice_date    DATE DEFAULT CURRENT_DATE,
    due_date        DATE,
    currency_code   CHAR(3),
    subtotal        NUMERIC(14,2) DEFAULT 0,
    tax_amount      NUMERIC(14,2) DEFAULT 0,
    total           NUMERIC(14,2) DEFAULT 0,
    amount_paid     NUMERIC(14,2) DEFAULT 0,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, invoice_number)
);

CREATE TABLE invoice_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id),
    description     TEXT NOT NULL,
    quantity        NUMERIC(14,3) NOT NULL,
    unit_price      NUMERIC(14,4) NOT NULL,
    discount_pct    NUMERIC(5,2) DEFAULT 0,
    tax_rate        NUMERIC(5,2) DEFAULT 0,
    subtotal        NUMERIC(14,2) NOT NULL
);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    partner_id      UUID NOT NULL REFERENCES partners(id),
    invoice_id      UUID REFERENCES invoices(id),
    amount          NUMERIC(14,2) NOT NULL,
    payment_date    DATE DEFAULT CURRENT_DATE,
    payment_method  VARCHAR(40),
    reference       VARCHAR(100),
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMPRAS (estructura similar a ventas)
-- ============================================================

CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    partner_id      UUID NOT NULL REFERENCES partners(id), -- proveedor
    order_number    VARCHAR(40) NOT NULL,
    status          VARCHAR(30) DEFAULT 'draft',
    order_date      DATE DEFAULT CURRENT_DATE,
    expected_date   DATE,
    subtotal        NUMERIC(14,2) DEFAULT 0,
    tax_amount      NUMERIC(14,2) DEFAULT 0,
    total           NUMERIC(14,2) DEFAULT 0,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, order_number)
);

-- ============================================================
-- TESORERÍA
-- ============================================================

CREATE TABLE cash_registers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id),
    name            VARCHAR(100) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE cash_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    register_id     UUID NOT NULL REFERENCES cash_registers(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    opened_at       TIMESTAMPTZ DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    opening_amount  NUMERIC(14,2) DEFAULT 0,
    closing_amount  NUMERIC(14,2),
    status          VARCHAR(20) DEFAULT 'open' -- open, closed
);

-- ============================================================
-- ÍNDICES ÚTILES
-- ============================================================

CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_sale_orders_company ON sale_orders(company_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_stock_levels_warehouse ON stock_levels(warehouse_id);

COMMENT ON TABLE companies IS 'Empresas (tenants) del sistema multi-tenant';
COMMENT ON TABLE partners IS 'Clientes y proveedores unificados';
COMMENT ON TABLE sale_orders IS 'Cotizaciones y pedidos de venta';
COMMENT ON TABLE invoices IS 'Facturas, notas de crédito y débito';
