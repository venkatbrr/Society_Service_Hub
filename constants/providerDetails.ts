/**
 * Category-specific optional detail fields for service providers.
 *
 * Each category maps to an array of field definitions.
 * All fields are OPTIONAL — the form never blocks submission.
 *
 * Field types:
 *  - chips   → multi-select chip picker
 *  - radio   → single-select chip picker
 *  - text    → free-text input
 *  - number  → numeric input (₹ prefix shown in UI)
 */

export type DetailFieldType = 'chips' | 'radio' | 'text' | 'number';

export interface DetailField {
  key: string;          // storage key inside the JSONB `details` column
  label: string;        // UI label
  type: DetailFieldType;
  placeholder?: string; // for text/number inputs
  options?: string[];   // for chips/radio
  suffix?: string;      // e.g. "/month", "/visit" shown after number
}

export const CATEGORY_DETAIL_FIELDS: Record<string, DetailField[]> = {
  Maid: [
    { key: 'cuisine', label: 'Cuisine Preference', type: 'radio', options: ['South Indian', 'North Indian', 'Both', 'Other'] },
    { key: 'tasks', label: 'Tasks', type: 'chips', options: ['Cleaning', 'Cooking', 'Laundry', 'Utensils', 'Mopping', 'Dusting'] },
    { key: 'availability', label: 'Availability', type: 'radio', options: ['Full-time', 'Part-time', 'On-call'] },
    { key: 'salary', label: 'Salary', type: 'number', placeholder: 'e.g. 8000', suffix: '/month' },
  ],
  Cook: [
    { key: 'cuisine', label: 'Cuisine Specialty', type: 'chips', options: ['South Indian', 'North Indian', 'Chinese', 'Continental', 'Multi-cuisine'] },
    { key: 'mealType', label: 'Meal Type', type: 'chips', options: ['Breakfast', 'Lunch', 'Dinner', 'Tiffin / Snacks'] },
    { key: 'dietType', label: 'Diet Type', type: 'radio', options: ['Veg Only', 'Non-veg', 'Both'] },
    { key: 'salary', label: 'Salary', type: 'number', placeholder: 'e.g. 10000', suffix: '/month' },
  ],
  Electrician: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Wiring', 'Appliance Repair', 'MCB / Panel', 'Inverter / UPS', 'Fan / Light'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 300', suffix: '/visit' },
  ],
  Plumber: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Pipe Fitting', 'Drainage', 'Water Tank', 'Bathroom Fitting', 'Leakage'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 250', suffix: '/visit' },
  ],
  'AC Technician': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Installation', 'Repair', 'Gas Refill', 'Deep Cleaning', 'AMC'] },
    { key: 'brands', label: 'Brands Handled', type: 'text', placeholder: 'e.g. Daikin, LG, Voltas' },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 500', suffix: '/visit' },
  ],
  Carpenter: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Furniture', 'Door / Window', 'Modular Kitchen', 'Cabinet', 'Bed / Wardrobe'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 800', suffix: '/day' },
  ],
  Painter: [
    { key: 'paintType', label: 'Type', type: 'radio', options: ['Interior', 'Exterior', 'Both'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 15', suffix: '/sqft' },
  ],
  Photography: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Events', 'Portrait', 'Family', 'Candid', 'Drone'] },
    { key: 'equipment', label: 'Equipment', type: 'text', placeholder: 'e.g. DSLR, mirrorless, drone' },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 5000', suffix: '/event' },
  ],
  Decoration: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Birthday', 'Festival', 'Wedding', 'Theme Decor', 'Balloon Decor'] },
    { key: 'materials', label: 'Materials Included', type: 'radio', options: ['Yes', 'No', 'Depends on package'] },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 3000', suffix: '/event' },
  ],
  Driver: [
    { key: 'vehicleType', label: 'Vehicle Type', type: 'radio', options: ['Car', 'Two-wheeler', 'Both'] },
    { key: 'licenseType', label: 'License Type', type: 'text', placeholder: 'e.g. LMV, HMV' },
    { key: 'availability', label: 'Availability', type: 'radio', options: ['Full-time', 'Part-time', 'On-call'] },
    { key: 'salary', label: 'Salary', type: 'number', placeholder: 'e.g. 15000', suffix: '/month' },
  ],
  Gardener: [
    { key: 'services', label: 'Services', type: 'chips', options: ['Lawn Care', 'Potted Plants', 'Tree Trimming', 'Landscaping', 'Kitchen Garden'] },
    { key: 'frequency', label: 'Frequency', type: 'radio', options: ['Daily', 'Weekly', 'Monthly', 'On-call'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 2000', suffix: '/month' },
  ],
  Tailor: [
    { key: 'gender', label: 'Specialization', type: 'radio', options: ['Men', 'Women', 'Both'] },
    { key: 'services', label: 'Services', type: 'chips', options: ['Stitching', 'Alterations', 'Blouse', 'Kurta / Sherwani', 'Saree Fall'] },
    { key: 'charges', label: 'Charges Range', type: 'number', placeholder: 'e.g. 500', suffix: 'onwards' },
  ],
  'Ironing / Press': [
    { key: 'chargesPerPiece', label: 'Charges Per Piece', type: 'number', placeholder: 'e.g. 10', suffix: '/piece' },
    { key: 'pickup', label: 'Pickup & Delivery', type: 'radio', options: ['Yes', 'No'] },
    { key: 'availability', label: 'Availability', type: 'radio', options: ['Daily', 'Alternate Days', 'On-call'] },
  ],
  'Salon / Beautician': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Haircut', 'Facial', 'Waxing', 'Threading', 'Bridal', 'Mehendi', 'Massage'] },
    { key: 'gender', label: 'Gender', type: 'radio', options: ['Men', 'Women', 'Unisex'] },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 200', suffix: 'onwards' },
  ],
  'Door Rangoli': [
    { key: 'designType', label: 'Design Type', type: 'chips', options: ['Freehand', 'Stencil', 'Sticker', 'Kolam', 'Muggulu'] },
    { key: 'material', label: 'Material', type: 'radio', options: ['Chalk Powder', 'Rangoli Powder', 'Sticker', 'Mixed'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 100', suffix: '/design' },
  ],
  'Gas Repair': [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Stove Repair', 'Pipeline', 'Regulator', 'Cylinder Check', 'Leak Detection'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 200', suffix: '/visit' },
  ],
  'Gas Agency': [
    { key: 'agencyName', label: 'Agency Name', type: 'text', placeholder: 'e.g. HP Gas, Bharat Gas, Indane' },
    { key: 'cylinderType', label: 'Cylinder Type', type: 'radio', options: ['Single', 'Double', 'Commercial'] },
    { key: 'deliveryCharge', label: 'Delivery Charge', type: 'number', placeholder: 'e.g. 50', suffix: '/delivery' },
  ],
  'Cycle Repair': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Puncture', 'Chain / Gear', 'Brake', 'Tyre Change', 'General Service'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 50', suffix: '/visit' },
  ],
  'Washroom Cleaner': [
    { key: 'frequency', label: 'Frequency', type: 'radio', options: ['Daily', 'Weekly', 'Monthly', 'On-call'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 500', suffix: '/month' },
  ],
  'Water Supply': [
    { key: 'supplyType', label: 'Supply Type', type: 'radio', options: ['Tanker', 'Pipeline', 'Both'] },
    { key: 'capacity', label: 'Capacity', type: 'text', placeholder: 'e.g. 5000 litres' },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 500', suffix: '/delivery' },
  ],
  'Pest Control': [
    { key: 'pests', label: 'Pests Covered', type: 'chips', options: ['Cockroach', 'Termite', 'Mosquito', 'Rodent', 'Bed Bugs', 'General'] },
    { key: 'treatment', label: 'Treatment Type', type: 'radio', options: ['Spray', 'Gel', 'Fumigation'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 1500', suffix: '/visit' },
  ],
  'Car Wash': [
    { key: 'vehicleType', label: 'Vehicle Type', type: 'radio', options: ['Car', 'Bike', 'Both'] },
    { key: 'washType', label: 'Wash Type', type: 'chips', options: ['Exterior', 'Interior', 'Full Wash', 'Polish / Wax'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 300', suffix: '/wash' },
  ],
  Milkman: [
    { key: 'milkType', label: 'Milk Type', type: 'radio', options: ['Cow', 'Buffalo', 'Packet / Brand', 'A2 Milk'] },
    { key: 'quantity', label: 'Min Quantity', type: 'text', placeholder: 'e.g. 500ml, 1 litre' },
    { key: 'pricePerLitre', label: 'Price', type: 'number', placeholder: 'e.g. 60', suffix: '/litre' },
  ],
  'RO / Water Purifier': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Installation', 'Repair', 'Filter Change', 'AMC', 'Deep Cleaning'] },
    { key: 'brands', label: 'Brands Handled', type: 'text', placeholder: 'e.g. Kent, Aquaguard, Pureit' },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 400', suffix: '/visit' },
  ],
  'Movers & Packers': [
    { key: 'moveType', label: 'Type', type: 'radio', options: ['Local', 'Intercity', 'Both'] },
    { key: 'vehicle', label: 'Vehicle', type: 'radio', options: ['Tempo', 'Truck', 'Mini-van', 'Multiple'] },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 3000', suffix: 'onwards' },
  ],
  'Tutor / Home Teacher': [
    { key: 'subjects', label: 'Subjects', type: 'text', placeholder: 'e.g. Maths, Science, English' },
    { key: 'level', label: 'Level', type: 'chips', options: ['Pre-school', 'Primary', 'Secondary', 'Higher Secondary', 'College'] },
    { key: 'mode', label: 'Mode', type: 'radio', options: ['Home Visit', 'Online', 'Both'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 3000', suffix: '/month' },
  ],
};

/**
 * Get detail fields for a given category. Returns empty array for unknown categories.
 */
export const getDetailFieldsForCategory = (category: string): DetailField[] => {
  return CATEGORY_DETAIL_FIELDS[category] || [];
};
