// =============================================================================
// vanuatuGeo.js — Vanuatu Province → Island → Area Council reference data.
// Mirrors the merl.ref_provinces / ref_islands / ref_area_councils seed in
// migration 0029 so the DoCC Form 7 (Geographic) dependent dropdowns work
// offline / before the reference views are fetched. The database remains the
// source of truth; helpers here just drive the cascading selects.
// =============================================================================

export const PROVINCE_LIST = ['TORBA', 'SANMA', 'PENAMA', 'MALAMPA', 'SHEFA', 'TAFEA'];

export const ISLANDS_BY_PROVINCE = {
  TORBA: ['Vanua Lava', 'Mota Lava', 'Mota', 'Gaua', 'Ureparapara', 'Merig', 'Merelava', 'Hiu', 'Loh', 'Tegua', 'Toga'],
  SANMA: ['Espiritu Santo', 'Malo', 'Aore', 'Tutuba'],
  PENAMA: ['Ambae', 'Maewo', 'Pentecost'],
  MALAMPA: ['Malakula', 'Ambrym', 'Paama', 'Uripiv', 'Wala', 'Rano', 'Atchin', 'Vao'],
  SHEFA: ['Efate', 'Epi', 'Tongoa', 'Tongariki', 'Emae', 'Makira', 'Mataso', 'Nguna', 'Pele', 'Emao', 'Lelepa', 'Moso'],
  TAFEA: ['Tanna', 'Erromango', 'Aniwa', 'Futuna', 'Aneityum'],
};

export const AREA_COUNCILS_BY_PROVINCE = {
  TORBA: [
    'Torres', 'Ureparapara', 'Motalava', 'Mota', 'East Vanualava',
    'West Vanualava', 'East Gaua', 'West Gaua', 'Merelava-Merig',
  ],
  SANMA: [
    'Northwest Santo', 'West Santo', 'South Santo One (1)', 'South Santo Two (2)',
    'Southeast Santo', 'Canal Fanafo', 'East Santo', 'Big Bay Coast',
    'Big Bay Inland', 'West Malo', 'East Malo',
  ],
  PENAMA: [
    'North Pentecost', 'Central Pentecost One (CP1)', 'Central Pentecost Two (CP2)',
    'South Pentecost', 'South Maewo', 'North Maewo', 'South Ambae', 'East Ambae',
    'North Ambae', 'West Ambae',
  ],
  MALAMPA: [
    'Northwest Malekula', 'Northeast Malekula', 'Central Malekula',
    'Southeast Malekula', 'Southwest Malekula', 'South Malekula',
    'North Ambrym', 'West Ambrym', 'Southeast Ambrym', 'Paama',
  ],
  SHEFA: [
    'North Efate', 'Eratap', 'East Efate', 'Northwest Efate', 'Mele', 'Ifira',
    'Tanvasoko', 'Erakor', 'Pango', 'Emau', 'Nguna-Pele', 'Varsu', 'Vermaul',
    'Vermali', 'Yarsu', 'Tongoa', 'Tongariki-Buninga', 'Makira-Mataso', 'Emae',
  ],
  TAFEA: [
    'North Tanna', 'East Tanna', 'Central Tanna', 'West Tanna', 'Southwest Tanna',
    'South Tanna', 'Southeast Tanna', 'Aneityum', 'North Erromango',
    'South Erromango', 'Aniwa', 'Futuna',
  ],
};

export const islandsForProvince = (p) => ISLANDS_BY_PROVINCE[p] ?? [];
export const areaCouncilsForProvince = (p) => AREA_COUNCILS_BY_PROVINCE[p] ?? [];
