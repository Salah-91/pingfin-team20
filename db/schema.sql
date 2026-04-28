-- PingFin Team 20 - Database Schema
-- Bank1: CEKVBE88  |  Bank2: HOMNBEB1
-- accounts.id = IBAN (VARCHAR 34) — geen aparte iban-kolom

CREATE DATABASE IF NOT EXISTS pingfin_team20;
USE pingfin_team20;

-- ─────────────────────────────────────────────
-- accounts: id IS de IBAN
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id          VARCHAR(34) NOT NULL PRIMARY KEY,  -- IBAN
    owner_name  VARCHAR(100) NOT NULL,
    balance     DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- po_new: staging voordat een PO verwerkt wordt
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_new (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(10,2) NOT NULL,
    po_message  VARCHAR(255),
    po_datetime DATETIME NOT NULL,
    ob_id       VARCHAR(11) NOT NULL,
    oa_id       VARCHAR(34) NOT NULL,
    bb_id       VARCHAR(11) NOT NULL,
    ba_id       VARCHAR(34) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- po_in: inkomende POs (wij zijn de BB)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_in (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(10,2) NOT NULL,
    po_message  VARCHAR(255),
    po_datetime DATETIME NOT NULL,
    ob_id       VARCHAR(11) NOT NULL,
    oa_id       VARCHAR(34) NOT NULL,
    ob_code     INT,
    ob_datetime DATETIME,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_id       VARCHAR(11) NOT NULL,
    ba_id       VARCHAR(34) NOT NULL,
    bb_code     INT,
    bb_datetime DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- po_out: uitgaande POs (wij zijn de OB)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_out (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(10,2) NOT NULL,
    po_message  VARCHAR(255),
    po_datetime DATETIME NOT NULL,
    ob_id       VARCHAR(11) NOT NULL,
    oa_id       VARCHAR(34) NOT NULL,
    ob_code     INT,
    ob_datetime DATETIME,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_id       VARCHAR(11) NOT NULL,
    ba_id       VARCHAR(34) NOT NULL,
    bb_code     INT,
    bb_datetime DATETIME,
    status      VARCHAR(20) DEFAULT 'pending',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- ack_in: ACKs die wij ontvangen van CB (voor onze uitgaande POs)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ack_in (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_code     INT,
    bb_datetime DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- ack_out: ACKs die wij sturen naar CB (voor inkomende POs)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ack_out (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL,
    bb_code     INT,
    bb_datetime DATETIME,
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- transactions: audit trail van saldowijzigingen
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    po_id        VARCHAR(50) NOT NULL,
    from_iban    VARCHAR(34) NOT NULL,
    to_iban      VARCHAR(34) NOT NULL,
    amount       DECIMAL(10,2) NOT NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- logs: event log (persistent, backend-side)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    po_id      VARCHAR(50),
    type       VARCHAR(50) NOT NULL,
    message    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- 20 accounts voor Bank1 (CEKVBE88)
-- ─────────────────────────────────────────────
INSERT IGNORE INTO accounts (id, owner_name, balance) VALUES
('BE68539007547034', 'Jan Janssen',       5000.00),
('BE43068999999501', 'Marie Peeters',     5000.00),
('BE32123456789012', 'Ahmed El Amrani',   5000.00),
('BE71096900019009', 'Sophie Vermeersch', 5000.00),
('BE62510007547061', 'Luca Rossi',        5000.00),
('BE83201234567890', 'Emma Dubois',       5000.00),
('BE45789012345678', 'Noah Claes',        5000.00),
('BE91234567890123', 'Olivia Martens',    5000.00),
('BE56345678901234', 'Liam Goossens',     5000.00),
('BE67456789012345', 'Ava Willems',       5000.00),
('BE78567890123456', 'Lucas Jacobs',      5000.00),
('BE89678901234567', 'Mia Hermans',       5000.00),
('BE90789012345678', 'Elias Stevens',     5000.00),
('BE12890123456789', 'Nora Pieters',      5000.00),
('BE23901234567890', 'Arthur Wouters',    5000.00),
('BE34012345678901', 'Yuna Leclercq',     5000.00),
('BE45123456789012', 'Remi Bogaert',      5000.00),
('BE56234567890123', 'Lena Hendrickx',    5000.00),
('BE67345678901234', 'Finn Desmet',       5000.00),
('BE78456789012345', 'Salah Sennouni',    5000.00);
