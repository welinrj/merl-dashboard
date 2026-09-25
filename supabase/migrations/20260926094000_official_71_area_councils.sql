-- Replace the obsolete starter Area Council dropdown with the national
-- Department of Local Authorities reference list (71 Area Councils).
-- Source: https://dla.gov.vu/index.php/about-us/area-councils
--
-- We retain legacy ref rows in the base table for referential continuity with
-- historical records, but expose ONLY the official list through the public
-- reference view used by the application.

WITH official(province_code, name) AS (
  VALUES
    ('TORBA','Torres'),
    ('TORBA','Ureparapara'),
    ('TORBA','Motalava'),
    ('TORBA','Mota'),
    ('TORBA','East Vanualava'),
    ('TORBA','West Vanualava'),
    ('TORBA','East Gaua'),
    ('TORBA','West Gaua'),
    ('TORBA','Merelava-Merig'),

    ('SANMA','Northwest Santo'),
    ('SANMA','West Santo'),
    ('SANMA','South Santo One (1)'),
    ('SANMA','South Santo Two (2)'),
    ('SANMA','Southeast Santo'),
    ('SANMA','Canal Fanafo'),
    ('SANMA','East Santo'),
    ('SANMA','Big Bay Coast'),
    ('SANMA','Big Bay Inland'),
    ('SANMA','West Malo'),
    ('SANMA','East Malo'),

    ('PENAMA','North Pentecost'),
    ('PENAMA','Central Pentecost One (CP1)'),
    ('PENAMA','Central Pentecost Two (CP2)'),
    ('PENAMA','South Pentecost'),
    ('PENAMA','South Maewo'),
    ('PENAMA','North Maewo'),
    ('PENAMA','South Ambae'),
    ('PENAMA','East Ambae'),
    ('PENAMA','North Ambae'),
    ('PENAMA','West Ambae'),

    ('MALAMPA','Northwest Malekula'),
    ('MALAMPA','Northeast Malekula'),
    ('MALAMPA','Central Malekula'),
    ('MALAMPA','Southeast Malekula'),
    ('MALAMPA','Southwest Malekula'),
    ('MALAMPA','South Malekula'),
    ('MALAMPA','North Ambrym'),
    ('MALAMPA','West Ambrym'),
    ('MALAMPA','Southeast Ambrym'),
    ('MALAMPA','Paama'),

    ('SHEFA','North Efate'),
    ('SHEFA','Eratap'),
    ('SHEFA','East Efate'),
    ('SHEFA','Northwest Efate'),
    ('SHEFA','Mele'),
    ('SHEFA','Ifira'),
    ('SHEFA','Tanvasoko'),
    ('SHEFA','Erakor'),
    ('SHEFA','Pango'),
    ('SHEFA','Emau'),
    ('SHEFA','Nguna-Pele'),
    ('SHEFA','Varsu'),
    ('SHEFA','Vermaul'),
    ('SHEFA','Vermali'),
    ('SHEFA','Yarsu'),
    ('SHEFA','Tongoa'),
    ('SHEFA','Tongariki-Buninga'),
    ('SHEFA','Makira-Mataso'),
    ('SHEFA','Emae'),

    ('TAFEA','North Tanna'),
    ('TAFEA','East Tanna'),
    ('TAFEA','Central Tanna'),
    ('TAFEA','West Tanna'),
    ('TAFEA','Southwest Tanna'),
    ('TAFEA','South Tanna'),
    ('TAFEA','Southeast Tanna'),
    ('TAFEA','Aneityum'),
    ('TAFEA','North Erromango'),
    ('TAFEA','South Erromango'),
    ('TAFEA','Aniwa'),
    ('TAFEA','Futuna')
)
INSERT INTO merl.ref_area_councils (province_code, name)
SELECT province_code, name FROM official
ON CONFLICT (province_code, name) DO NOTHING;

CREATE OR REPLACE VIEW public.v_ref_area_councils
WITH (security_invoker = on) AS
WITH official(province_code, name, province_sort, council_sort) AS (
  VALUES
    ('TORBA','Torres',1,1),
    ('TORBA','Ureparapara',1,2),
    ('TORBA','Motalava',1,3),
    ('TORBA','Mota',1,4),
    ('TORBA','East Vanualava',1,5),
    ('TORBA','West Vanualava',1,6),
    ('TORBA','East Gaua',1,7),
    ('TORBA','West Gaua',1,8),
    ('TORBA','Merelava-Merig',1,9),

    ('SANMA','Northwest Santo',2,1),
    ('SANMA','West Santo',2,2),
    ('SANMA','South Santo One (1)',2,3),
    ('SANMA','South Santo Two (2)',2,4),
    ('SANMA','Southeast Santo',2,5),
    ('SANMA','Canal Fanafo',2,6),
    ('SANMA','East Santo',2,7),
    ('SANMA','Big Bay Coast',2,8),
    ('SANMA','Big Bay Inland',2,9),
    ('SANMA','West Malo',2,10),
    ('SANMA','East Malo',2,11),

    ('PENAMA','North Pentecost',3,1),
    ('PENAMA','Central Pentecost One (CP1)',3,2),
    ('PENAMA','Central Pentecost Two (CP2)',3,3),
    ('PENAMA','South Pentecost',3,4),
    ('PENAMA','South Maewo',3,5),
    ('PENAMA','North Maewo',3,6),
    ('PENAMA','South Ambae',3,7),
    ('PENAMA','East Ambae',3,8),
    ('PENAMA','North Ambae',3,9),
    ('PENAMA','West Ambae',3,10),

    ('MALAMPA','Northwest Malekula',4,1),
    ('MALAMPA','Northeast Malekula',4,2),
    ('MALAMPA','Central Malekula',4,3),
    ('MALAMPA','Southeast Malekula',4,4),
    ('MALAMPA','Southwest Malekula',4,5),
    ('MALAMPA','South Malekula',4,6),
    ('MALAMPA','North Ambrym',4,7),
    ('MALAMPA','West Ambrym',4,8),
    ('MALAMPA','Southeast Ambrym',4,9),
    ('MALAMPA','Paama',4,10),

    ('SHEFA','North Efate',5,1),
    ('SHEFA','Eratap',5,2),
    ('SHEFA','East Efate',5,3),
    ('SHEFA','Northwest Efate',5,4),
    ('SHEFA','Mele',5,5),
    ('SHEFA','Ifira',5,6),
    ('SHEFA','Tanvasoko',5,7),
    ('SHEFA','Erakor',5,8),
    ('SHEFA','Pango',5,9),
    ('SHEFA','Emau',5,10),
    ('SHEFA','Nguna-Pele',5,11),
    ('SHEFA','Varsu',5,12),
    ('SHEFA','Vermaul',5,13),
    ('SHEFA','Vermali',5,14),
    ('SHEFA','Yarsu',5,15),
    ('SHEFA','Tongoa',5,16),
    ('SHEFA','Tongariki-Buninga',5,17),
    ('SHEFA','Makira-Mataso',5,18),
    ('SHEFA','Emae',5,19),

    ('TAFEA','North Tanna',6,1),
    ('TAFEA','East Tanna',6,2),
    ('TAFEA','Central Tanna',6,3),
    ('TAFEA','West Tanna',6,4),
    ('TAFEA','Southwest Tanna',6,5),
    ('TAFEA','South Tanna',6,6),
    ('TAFEA','Southeast Tanna',6,7),
    ('TAFEA','Aneityum',6,8),
    ('TAFEA','North Erromango',6,9),
    ('TAFEA','South Erromango',6,10),
    ('TAFEA','Aniwa',6,11),
    ('TAFEA','Futuna',6,12)
)
SELECT r.province_code, r.name
FROM merl.ref_area_councils r
JOIN official o
  ON o.province_code = r.province_code
 AND o.name = r.name
ORDER BY o.province_sort, o.council_sort;

GRANT SELECT ON public.v_ref_area_councils TO authenticated;
GRANT SELECT ON public.v_ref_area_councils TO anon;
