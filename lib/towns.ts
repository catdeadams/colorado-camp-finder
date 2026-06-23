export interface ColoradoTown {
  name: string
  lat: number
  lng: number
}

// Colorado towns with services (gas, grocery) — used for "near a town" filter
export const CO_TOWNS: ColoradoTown[] = [
  // Front Range / Metro
  { name: 'Denver',           lat: 39.7392, lng: -104.9903 },
  { name: 'Colorado Springs', lat: 38.8339, lng: -104.8214 },
  { name: 'Boulder',          lat: 40.0150, lng: -105.2705 },
  { name: 'Fort Collins',     lat: 40.5853, lng: -105.0844 },
  { name: 'Loveland',         lat: 40.3978, lng: -105.0749 },
  { name: 'Longmont',         lat: 40.1672, lng: -105.1019 },
  { name: 'Greeley',          lat: 40.4233, lng: -104.7091 },
  { name: 'Pueblo',           lat: 38.2544, lng: -104.6091 },
  { name: 'Canon City',       lat: 38.4408, lng: -105.2425 },
  // I-70 Mountain Corridor
  { name: 'Idaho Springs',    lat: 39.7425, lng: -105.5136 },
  { name: 'Black Hawk',       lat: 39.7961, lng: -105.4897 },
  { name: 'Evergreen',        lat: 39.6328, lng: -105.3301 },
  { name: 'Frisco',           lat: 39.5744, lng: -106.1000 },
  { name: 'Breckenridge',     lat: 39.4817, lng: -106.0384 },
  { name: 'Silverthorne',     lat: 39.6328, lng: -106.0685 },
  { name: 'Vail',             lat: 39.6433, lng: -106.3781 },
  { name: 'Gypsum',           lat: 39.6483, lng: -106.9522 },
  { name: 'Glenwood Springs', lat: 39.5505, lng: -107.3248 },
  { name: 'Rifle',            lat: 39.5311, lng: -107.7831 },
  { name: 'Grand Junction',   lat: 39.0639, lng: -108.5506 },
  { name: 'Montrose',         lat: 38.4783, lng: -107.8762 },
  // Summit / Mountain Parks
  { name: 'Aspen',            lat: 39.1911, lng: -106.8175 },
  { name: 'Carbondale',       lat: 39.4028, lng: -107.2117 },
  { name: 'Leadville',        lat: 39.2508, lng: -106.2925 },
  { name: 'Buena Vista',      lat: 38.8422, lng: -106.1314 },
  { name: 'Salida',           lat: 38.5347, lng: -106.0000 },
  { name: 'Fairplay',         lat: 39.2239, lng: -105.9897 },
  { name: 'Kremmling',        lat: 40.0594, lng: -106.3886 },
  { name: 'Hot Sulphur Springs', lat: 40.0753, lng: -106.1025 },
  { name: 'Winter Park',      lat: 39.8922, lng: -105.7631 },
  { name: 'Granby',           lat: 40.0869, lng: -105.9361 },
  { name: 'Grand Lake',       lat: 40.2525, lng: -105.8228 },
  { name: 'Estes Park',       lat: 40.3775, lng: -105.5217 },
  // Northwest Colorado
  { name: 'Steamboat Springs', lat: 40.4850, lng: -106.8317 },
  { name: 'Craig',             lat: 40.5153, lng: -107.5464 },
  { name: 'Meeker',            lat: 40.0383, lng: -107.9143 },
  // Southwest Colorado
  { name: 'Durango',          lat: 37.2753, lng: -107.8801 },
  { name: 'Cortez',           lat: 37.3489, lng: -108.5859 },
  { name: 'Telluride',        lat: 37.9375, lng: -107.8123 },
  { name: 'Ouray',            lat: 38.0228, lng: -107.6715 },
  { name: 'Silverton',        lat: 37.8123, lng: -107.6640 },
  { name: 'Pagosa Springs',   lat: 37.2695, lng: -107.0098 },
  { name: 'Dolores',          lat: 37.4697, lng: -108.5023 },
  { name: 'Mancos',           lat: 37.3442, lng: -108.2876 },
  { name: 'Bayfield',         lat: 37.2278, lng: -107.5990 },
  // San Luis Valley / South Central
  { name: 'Gunnison',         lat: 38.5458, lng: -106.9253 },
  { name: 'Crested Butte',    lat: 38.8697, lng: -106.9878 },
  { name: 'Lake City',        lat: 38.0289, lng: -107.3129 },
  { name: 'Creede',           lat: 37.8497, lng: -106.9248 },
  { name: 'South Fork',       lat: 37.6647, lng: -106.6432 },
  { name: 'Del Norte',        lat: 37.6761, lng: -106.3514 },
  { name: 'Monte Vista',      lat: 37.5792, lng: -106.1489 },
  { name: 'Alamosa',          lat: 37.4695, lng: -105.8700 },
  { name: 'Saguache',         lat: 38.0839, lng: -106.1411 },
  { name: 'Westcliffe',       lat: 38.1300, lng: -105.4636 },
  { name: 'Walsenburg',       lat: 37.6239, lng: -104.7808 },
  { name: 'Trinidad',         lat: 37.1694, lng: -104.5005 },
]
