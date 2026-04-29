-- PingFin Team 20 — Master DB init (auto-run by mysql docker entrypoint)
-- Maakt twee databases: pingfin_b1 (CEKVBE88) en pingfin_b2 (HOMNBEB1)

CREATE DATABASE IF NOT EXISTS pingfin_b1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS pingfin_b2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE pingfin_b1;
-- accounts.id = IBAN. transactions = audit per account met signed amount + isvalid/iscomplete (per manual)

-- accounts -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id          VARCHAR(34) NOT NULL PRIMARY KEY,
    owner_name  VARCHAR(100) NOT NULL,
    balance     DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- po_new -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_new (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(12,2) NOT NULL,
    po_message  VARCHAR(255),
    po_datetime DATETIME NOT NULL,
    ob_id       VARCHAR(11) NOT NULL,
    oa_id       VARCHAR(34) NOT NULL,
    bb_id       VARCHAR(11) NOT NULL,
    ba_id       VARCHAR(34) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- po_out (wij = OB) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_out (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(12,2) NOT NULL,
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
    status      VARCHAR(20) DEFAULT 'pending',  -- pending | processed | failed | timeout
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_ob_dt (ob_datetime)
);

-- po_in (wij = BB) ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_in (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(12,2) NOT NULL,
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

-- ack_in (CB â†’ ons; wij = OB) ---------------------------------------------
CREATE TABLE IF NOT EXISTS ack_in (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_code     INT,
    bb_datetime DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ack_in_po (po_id)
);

-- ack_out (wij â†’ CB; wij = BB) --------------------------------------------
CREATE TABLE IF NOT EXISTS ack_out (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL,
    bb_code     INT,
    bb_datetime DATETIME,
    sent_to_cb  TINYINT(1) NOT NULL DEFAULT 0,  -- al doorgepost naar CB?
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ack_out_po (po_id),
    INDEX idx_sent_to_cb (sent_to_cb)
);

-- transactions (manual-conform: Ã©Ã©n rij per saldobeweging, signed amount) -
CREATE TABLE IF NOT EXISTS transactions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    po_id        VARCHAR(50) NOT NULL,
    account_id   VARCHAR(34) NOT NULL,           -- IBAN waarvan/waarvoor
    amount       DECIMAL(12,2) NOT NULL,         -- BA: positief / OA: negatief
    isvalid      TINYINT(1) NOT NULL DEFAULT 1,
    iscomplete   TINYINT(1) NOT NULL DEFAULT 1,
    datetime     DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_po (po_id),
    INDEX idx_acc (account_id)
);

-- logs (volledig PO-snapshot per regel, alle PO-velden nullable) ----------
CREATE TABLE IF NOT EXISTS logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type        VARCHAR(50) NOT NULL,           -- general | po_in | ack_out | error | ...
    message     TEXT,
    datetime    DATETIME DEFAULT CURRENT_TIMESTAMP,
    po_id       VARCHAR(50),
    po_amount   DECIMAL(12,2),
    po_message  VARCHAR(255),
    po_datetime DATETIME,
    ob_id       VARCHAR(11),
    oa_id       VARCHAR(34),
    ob_code     INT,
    ob_datetime DATETIME,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_id       VARCHAR(11),
    ba_id       VARCHAR(34),
    bb_code     INT,
    bb_datetime DATETIME,
    INDEX idx_type (type),
    INDEX idx_dt (datetime)
);

-- Bank1 (CEKVBE88) — 20 accounts à €5000
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

USE pingfin_b2;
-- accounts.id = IBAN. transactions = audit per account met signed amount + isvalid/iscomplete (per manual)

-- accounts -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id          VARCHAR(34) NOT NULL PRIMARY KEY,
    owner_name  VARCHAR(100) NOT NULL,
    balance     DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- po_new -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_new (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(12,2) NOT NULL,
    po_message  VARCHAR(255),
    po_datetime DATETIME NOT NULL,
    ob_id       VARCHAR(11) NOT NULL,
    oa_id       VARCHAR(34) NOT NULL,
    bb_id       VARCHAR(11) NOT NULL,
    ba_id       VARCHAR(34) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- po_out (wij = OB) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_out (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(12,2) NOT NULL,
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
    status      VARCHAR(20) DEFAULT 'pending',  -- pending | processed | failed | timeout
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_ob_dt (ob_datetime)
);

-- po_in (wij = BB) ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_in (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL UNIQUE,
    po_amount   DECIMAL(12,2) NOT NULL,
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

-- ack_in (CB â†’ ons; wij = OB) ---------------------------------------------
CREATE TABLE IF NOT EXISTS ack_in (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_code     INT,
    bb_datetime DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ack_in_po (po_id)
);

-- ack_out (wij â†’ CB; wij = BB) --------------------------------------------
CREATE TABLE IF NOT EXISTS ack_out (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    po_id       VARCHAR(50) NOT NULL,
    bb_code     INT,
    bb_datetime DATETIME,
    sent_to_cb  TINYINT(1) NOT NULL DEFAULT 0,  -- al doorgepost naar CB?
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ack_out_po (po_id),
    INDEX idx_sent_to_cb (sent_to_cb)
);

-- transactions (manual-conform: Ã©Ã©n rij per saldobeweging, signed amount) -
CREATE TABLE IF NOT EXISTS transactions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    po_id        VARCHAR(50) NOT NULL,
    account_id   VARCHAR(34) NOT NULL,           -- IBAN waarvan/waarvoor
    amount       DECIMAL(12,2) NOT NULL,         -- BA: positief / OA: negatief
    isvalid      TINYINT(1) NOT NULL DEFAULT 1,
    iscomplete   TINYINT(1) NOT NULL DEFAULT 1,
    datetime     DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_po (po_id),
    INDEX idx_acc (account_id)
);

-- logs (volledig PO-snapshot per regel, alle PO-velden nullable) ----------
CREATE TABLE IF NOT EXISTS logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type        VARCHAR(50) NOT NULL,           -- general | po_in | ack_out | error | ...
    message     TEXT,
    datetime    DATETIME DEFAULT CURRENT_TIMESTAMP,
    po_id       VARCHAR(50),
    po_amount   DECIMAL(12,2),
    po_message  VARCHAR(255),
    po_datetime DATETIME,
    ob_id       VARCHAR(11),
    oa_id       VARCHAR(34),
    ob_code     INT,
    ob_datetime DATETIME,
    cb_code     INT,
    cb_datetime DATETIME,
    bb_id       VARCHAR(11),
    ba_id       VARCHAR(34),
    bb_code     INT,
    bb_datetime DATETIME,
    INDEX idx_type (type),
    INDEX idx_dt (datetime)
);

-- Bank2 (HOMNBEB1) — 20 accounts à €5000
INSERT IGNORE INTO accounts (id, owner_name, balance) VALUES
('BE99100200300001', 'Hugo Vandenberg',   5000.00),
('BE99100200300002', 'Lotte Maes',        5000.00),
('BE99100200300003', 'Tom De Smet',       5000.00),
('BE99100200300004', 'Charlotte Lambert', 5000.00),
('BE99100200300005', 'Mathias Coppens',   5000.00),
('BE99100200300006', 'Anouk Verhoeven',   5000.00),
('BE99100200300007', 'Senne Aerts',       5000.00),
('BE99100200300008', 'Eva Mertens',       5000.00),
('BE99100200300009', 'Bram Smeets',       5000.00),
('BE99100200300010', 'Fien Dewulf',       5000.00),
('BE99100200300011', 'Jasper Devos',      5000.00),
('BE99100200300012', 'Roos Vandevelde',   5000.00),
('BE99100200300013', 'Wout Boonen',       5000.00),
('BE99100200300014', 'Lina Caers',        5000.00),
('BE99100200300015', 'Maxim De Pauw',     5000.00),
('BE99100200300016', 'Hanne Vermeulen',   5000.00),
('BE99100200300017', 'Stan Beckers',      5000.00),
('BE99100200300018', 'Juul Geerts',       5000.00),
('BE99100200300019', 'Jules Stroobants',  5000.00),
('BE99100200300020', 'Nele Verhaeghe',    5000.00);
