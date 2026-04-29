-- PingFin Team 20 � Master DB init (auto-run by mysql docker entrypoint)
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

-- ack_in (CB → ons; wij = OB) ---------------------------------------------
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

-- ack_out (wij → CB; wij = BB) --------------------------------------------
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

-- transactions (manual-conform: één rij per saldobeweging, signed amount) -
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

-- Bank1 (CEKVBE88) � 20 accounts � �5000
INSERT IGNORE INTO accounts (id, owner_name, balance) VALUES
('BE41101000000001', 'Jan Janssen',       5000.00),
('BE14101000000002', 'Marie Peeters',     5000.00),
('BE84101000000003', 'Ahmed El Amrani',   5000.00),
('BE57101000000004', 'Sophie Vermeersch', 5000.00),
('BE30101000000005', 'Luca Rossi',        5000.00),
('BE03101000000006', 'Emma Dubois',       5000.00),
('BE73101000000007', 'Noah Claes',        5000.00),
('BE46101000000008', 'Olivia Martens',    5000.00),
('BE19101000000009', 'Liam Goossens',     5000.00),
('BE89101000000010', 'Ava Willems',       5000.00),
('BE62101000000011', 'Lucas Jacobs',      5000.00),
('BE35101000000012', 'Mia Hermans',       5000.00),
('BE08101000000013', 'Elias Stevens',     5000.00),
('BE78101000000014', 'Nora Pieters',      5000.00),
('BE51101000000015', 'Arthur Wouters',    5000.00),
('BE24101000000016', 'Yuna Leclercq',     5000.00),
('BE94101000000017', 'Remi Bogaert',      5000.00),
('BE67101000000018', 'Lena Hendrickx',    5000.00),
('BE40101000000019', 'Finn Desmet',       5000.00),
('BE13101000000020', 'Salah Sennouni',    5000.00);

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

-- ack_in (CB → ons; wij = OB) ---------------------------------------------
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

-- ack_out (wij → CB; wij = BB) --------------------------------------------
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

-- transactions (manual-conform: één rij per saldobeweging, signed amount) -
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

-- Bank2 (HOMNBEB1) � 20 accounts � �5000
INSERT IGNORE INTO accounts (id, owner_name, balance) VALUES
('BE55202000000001', 'Hugo Vandenberg',   5000.00),
('BE28202000000002', 'Lotte Maes',        5000.00),
('BE98202000000003', 'Tom De Smet',       5000.00),
('BE71202000000004', 'Charlotte Lambert', 5000.00),
('BE44202000000005', 'Mathias Coppens',   5000.00),
('BE17202000000006', 'Anouk Verhoeven',   5000.00),
('BE87202000000007', 'Senne Aerts',       5000.00),
('BE60202000000008', 'Eva Mertens',       5000.00),
('BE33202000000009', 'Bram Smeets',       5000.00),
('BE06202000000010', 'Fien Dewulf',       5000.00),
('BE76202000000011', 'Jasper Devos',      5000.00),
('BE49202000000012', 'Roos Vandevelde',   5000.00),
('BE22202000000013', 'Wout Boonen',       5000.00),
('BE92202000000014', 'Lina Caers',        5000.00),
('BE65202000000015', 'Maxim De Pauw',     5000.00),
('BE38202000000016', 'Hanne Vermeulen',   5000.00),
('BE11202000000017', 'Stan Beckers',      5000.00),
('BE81202000000018', 'Juul Geerts',       5000.00),
('BE54202000000019', 'Jules Stroobants',  5000.00),
('BE27202000000020', 'Nele Verhaeghe',    5000.00);
