-- Re-seed the global (community_id IS NULL) emergency directory.
--
-- 20260705130214_community_sos.sql seeded these when the SOS module shipped,
-- but the table is empty in production — the rows were removed at some point,
-- so every community's SOS screen shows nothing at all. Because `db push`
-- tracks migrations by filename, re-running the original file is a no-op; the
-- seed has to be re-asserted from a new migration.
--
-- Global rows are the national helplines every Indian community shares.
-- Community-specific numbers (security desk, nearest hospital) stay the
-- president's job via /sos/manage-contacts.

INSERT INTO public.emergency_contacts
  (community_id, category, name, phone, description, sort_order, is_active, created_by)
SELECT NULL, seed.category, seed.name, seed.phone, seed.description, seed.sort_order, true, NULL
FROM (
  VALUES
    ('helpline',  'National emergency (all-in-one)', '112',  '24x7 · police, fire and ambulance', 0),
    ('ambulance', 'Ambulance',                       '108',  '24x7 free emergency ambulance',     10),
    ('ambulance', 'Medical helpline',                '102',  '24x7 · maternity and infant care',  11),
    ('police',    'Police',                          '100',  '24x7',                              20),
    ('police',    'Traffic police helpline',         '103',  '24x7',                              21),
    ('fire',      'Fire and rescue',                 '101',  '24x7',                              30),
    ('helpline',  'Women helpline',                  '1091', '24x7',                              40),
    ('helpline',  'Child helpline',                  '1098', '24x7',                              41),
    ('helpline',  'Senior citizen helpline',         '14567', '8am to 8pm',                       42),
    ('helpline',  'Road accident emergency',         '1073', '24x7',                              43),
    ('helpline',  'Disaster management',             '1078', '24x7 · NDMA control room',          44),
    ('helpline',  'Cyber crime helpline',            '1930', '24x7 · financial fraud reporting',  45),
    ('helpline',  'Gas leak emergency',              '1906', '24x7 · LPG and piped gas',          46),
    ('helpline',  'Electricity complaints',          '1912', '24x7 · power outage and hazards',   47)
) AS seed(category, name, phone, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.emergency_contacts ec
  WHERE ec.community_id IS NULL
    AND ec.phone = seed.phone
);
