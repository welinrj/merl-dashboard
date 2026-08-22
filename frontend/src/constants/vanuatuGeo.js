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
  TORBA: ['Torres', 'Ureparapara', 'Mota Lava', 'Gaua', 'Vanua Lava'],
  SANMA: ['West Santo', 'East Santo', 'South Santo', 'North Santo', 'Canal-Fanafo', 'Big Bay Coast', 'Malo'],
  PENAMA: ['North Ambae', 'West Ambae', 'East Ambae', 'Maewo', 'North Pentecost', 'Central Pentecost', 'South Pentecost'],
  MALAMPA: ['North West Malakula', 'North East Malakula', 'Central Malakula', 'South West Malakula', 'South East Malakula', 'North Ambrym', 'West Ambrym', 'South East Ambrym', 'Paama'],
  SHEFA: ['North Efate', 'Central Efate', 'South Efate', 'Port Vila', 'Epi', 'Tongoa-Shepherds', 'Emae'],
  TAFEA: ['North Tanna', 'West Tanna', 'Middle Bush Tanna', 'South West Tanna', 'Whitesands', 'Erromango', 'Aniwa', 'Futuna', 'Aneityum'],
};

export const islandsForProvince = (p) => ISLANDS_BY_PROVINCE[p] ?? [];
export const areaCouncilsForProvince = (p) => AREA_COUNCILS_BY_PROVINCE[p] ?? [];
