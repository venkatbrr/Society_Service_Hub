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
  key: string;
  label: string;
  type: DetailFieldType;
  placeholder?: string;
  options?: string[];
  suffix?: string;
}

export const CATEGORY_DETAIL_FIELDS: Record<string, DetailField[]> = {
  Maid: [
    { key: 'tasks', label: 'Tasks', type: 'chips', options: ['Cleaning', 'Laundry', 'Utensils', 'Mopping', 'Dusting', 'Childcare', 'Pet Care'] },
    { key: 'availability', label: 'Availability', type: 'radio', options: ['Full-time', 'Part-time', 'On-call'] },
    { key: 'salary', label: 'Salary', type: 'number', placeholder: 'e.g. 8000', suffix: '/month' },
  ],
  Cook: [
    { key: 'cuisine', label: 'Cuisine Specialty', type: 'chips', options: ['South Indian', 'North Indian', 'Chinese', 'Continental', 'Multi-cuisine'] },
    { key: 'mealType', label: 'Meal Type', type: 'chips', options: ['Breakfast', 'Lunch', 'Dinner', 'Tiffin / Snacks'] },
    { key: 'dietType', label: 'Diet Type', type: 'radio', options: ['Veg Only', 'Non-veg', 'Jain', 'Both'] },
    { key: 'salary', label: 'Salary', type: 'number', placeholder: 'e.g. 10000', suffix: '/month' },
  ],
  Electrician: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Wiring', 'Appliance Repair', 'MCB / Panel', 'Inverter / UPS', 'Fan / Light', 'CCTV / Intercom', 'Geyser'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 300', suffix: '/visit' },
  ],
  Plumber: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Pipe Fitting', 'Drainage', 'Water Tank', 'Bathroom Fitting', 'Leakage', 'RO / Purifier', 'Washing Machine Inlet/Outlet'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 250', suffix: '/visit' },
  ],
  'AC Technician': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Installation', 'Repair', 'Gas Refill', 'Deep Cleaning', 'AMC'] },
    { key: 'brands', label: 'Brands Handled', type: 'text', placeholder: 'e.g. Daikin, LG, Voltas' },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 500', suffix: '/visit' },
  ],
  Carpenter: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Furniture', 'Door / Window', 'Modular Kitchen', 'Cabinet', 'Bed / Wardrobe', 'Repair / Polish'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 800', suffix: '/day' },
  ],
  Painter: [
    { key: 'paintType', label: 'Type', type: 'chips', options: ['Interior', 'Exterior', 'Waterproofing'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 15', suffix: '/sqft' },
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
    { key: 'services', label: 'Services', type: 'chips', options: ['Haircut', 'Facial', 'Waxing', 'Threading', 'Bridal', 'Mehendi', 'Massage', 'Pedicure', 'Manicure'] },
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
  'Car Repair': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Engine Check', 'Brake Service', 'Battery', 'AC Service', 'General Service', 'Puncture'] },
    { key: 'vehicleType', label: 'Vehicle Type', type: 'chips', options: ['Hatchback', 'Sedan', 'SUV', 'All'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 700', suffix: '/visit' },
  ],
  'Bike Repair': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Puncture', 'Chain', 'Brake', 'Engine Service', 'Oil Change', 'Electrical'] },
    { key: 'vehicleType', label: 'Vehicle Type', type: 'chips', options: ['Scooter', 'Motorcycle', 'Both'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 250', suffix: '/visit' },
  ],
  'Washroom Cleaner': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Deep Cleaning', 'Regular Cleaning', 'Drain Cleaning', 'Tile Scrubbing'] },
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
    { key: 'frequency', label: 'Frequency', type: 'radio', options: ['Daily', 'Weekly', 'On-call'] },
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
  'Grills & Mesh Work': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Mosquito Mesh', 'Invisible Grill', 'MS Grill', 'SS Grill', 'Safety Net', 'Bird Net', 'Sliding Mesh Door', 'Balcony Grill', 'Window Grill', 'Repair'] },
    { key: 'material', label: 'Material', type: 'radio', options: ['Mild Steel (MS)', 'Stainless Steel (SS)', 'Aluminium', 'Fiberglass', 'Nylon Net'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 250', suffix: '/sqft' },
  ],
  'Movers & Packers': [
    { key: 'moveType', label: 'Type', type: 'radio', options: ['Local', 'Intercity', 'Both'] },
    { key: 'vehicle', label: 'Vehicle', type: 'radio', options: ['Tempo', 'Truck', 'Mini-van', 'Multiple'] },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 3000', suffix: 'onwards' },
  ],
  'Tent House': [
    { key: 'services', label: 'Services', type: 'chips', options: ['Tent Setup', 'Chair & Tables', 'Lighting', 'Stage / Mandap', 'Fans / Coolers', 'Generator'] },
    { key: 'eventType', label: 'Event Type', type: 'chips', options: ['Wedding', 'Birthday', 'Puja / Havan', 'Meeting', 'Other'] },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 5000', suffix: '/event' },
  ],
  'Water Cans': [
    { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. Bisleri, Kinley, Local' },
    { key: 'canSize', label: 'Can Size', type: 'radio', options: ['20 Litre', '10 Litre', '5 Litre', '1 Litre Bottles'] },
    { key: 'pricePerCan', label: 'Price Per Can', type: 'number', placeholder: 'e.g. 40', suffix: '/can' },
    { key: 'delivery', label: 'Delivery', type: 'radio', options: ['Home Delivery', 'Pickup', 'Both'] },
  ],
  Catering: [
    { key: 'cuisine', label: 'Cuisine', type: 'chips', options: ['South Indian', 'North Indian', 'Chinese', 'Multi-cuisine', 'Biryani', 'Chaat / Street Food'] },
    { key: 'eventType', label: 'Event Type', type: 'chips', options: ['Birthday', 'Puja / Havan', 'Wedding', 'Get-together', 'Corporate'] },
    { key: 'dietType', label: 'Diet Type', type: 'radio', options: ['Veg Only', 'Non-veg', 'Both'] },
    { key: 'minPlates', label: 'Minimum Plates', type: 'number', placeholder: 'e.g. 25', suffix: 'plates' },
    { key: 'charges', label: 'Starting From', type: 'number', placeholder: 'e.g. 200', suffix: '/plate' },
  ],
  Boutique: [
    { key: 'specialization', label: 'Specialization', type: 'chips', options: ['Saree', 'Kurta / Kurti', 'Lehenga', 'Western Wear', 'Kids Wear', 'Accessories'] },
    { key: 'gender', label: 'Gender', type: 'radio', options: ['Women', 'Men', 'Both'] },
    { key: 'priceRange', label: 'Price Range', type: 'radio', options: ['Budget', 'Mid-range', 'Premium'] },
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
  Teaching: [
    { key: 'type', label: 'Type', type: 'radio', options: ['Tutor (Home Visit)', 'Coaching', 'Online Tutor', 'Music / Art Teacher'] },
    { key: 'subjects', label: 'Subjects', type: 'text', placeholder: 'e.g. Maths, Science, English' },
    { key: 'level', label: 'Level', type: 'chips', options: ['Pre-school', 'Primary (1-5)', 'Secondary (6-10)', 'Higher Secondary (11-12)', 'College', 'Competitive Exams'] },
    { key: 'mode', label: 'Mode', type: 'radio', options: ['Home Visit', 'Online', 'Both'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 3000', suffix: '/month' },
  ],
  'RTO Agent': [
    { key: 'services', label: 'Services', type: 'chips', options: ['License (New)', 'License Renewal', 'RC Transfer', 'Vehicle Registration', 'Insurance', 'NOC', 'Challan / Fine', 'Fitness Certificate'] },
    { key: 'vehicleType', label: 'Vehicle Type', type: 'radio', options: ['Two-wheeler', 'Four-wheeler', 'Commercial', 'All'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 1500', suffix: '/service' },
  ],
  'Aadhar Centre': [
    { key: 'services', label: 'Services', type: 'chips', options: ['New Enrolment', 'Update Address', 'Update Mobile', 'Update Name', 'Biometric Update', 'PVC Card Print', 'mAadhaar Help'] },
    { key: 'mode', label: 'Mode', type: 'radio', options: ['At Centre', 'Home Visit', 'Both'] },
    { key: 'charges', label: 'Charges', type: 'number', placeholder: 'e.g. 50', suffix: '/service' },
  ],
};

/**
 * Get detail fields for a given category. Returns empty array for unknown categories.
 */
export const getDetailFieldsForCategory = (category: string): DetailField[] => {
  return CATEGORY_DETAIL_FIELDS[category] || [];
};
