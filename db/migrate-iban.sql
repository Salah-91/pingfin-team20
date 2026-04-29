-- Migratie: vervang oude accounts (ongeldige IBAN-checksums) door nieuwe valide IBANs.
-- Voer uit op zowel pingfin_b1 als pingfin_b2.

-- =========================================
-- Bank1 (CEKVBE88)
-- =========================================
USE pingfin_b1;
DELETE FROM accounts;
INSERT INTO accounts (id, owner_name, balance) VALUES
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

-- =========================================
-- Bank2 (HOMNBEB1)
-- =========================================
USE pingfin_b2;
DELETE FROM accounts;
INSERT INTO accounts (id, owner_name, balance) VALUES
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
