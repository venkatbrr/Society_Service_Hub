import os
import re
import glob
import json

VCF_DIR = r"C:\Users\venka\OneDrive\Desktop\service providers\whatsapp chat\WhatsApp Chat with Aspiration Living residents Group"
CHAT_FILE = os.path.join(VCF_DIR, "WhatsApp Chat with Aspiration Living residents Group.txt")

# Standard Categories from constants/categories.ts
CATEGORIES = [
    'Maid', 'Cook', 'Electrician', 'Plumber', 'AC Technician', 'Carpenter', 'Painter',
    'Driver', 'Gardener', 'Tailor', 'Ironing / Press', 'Salon / Beautician', 'Door Rangoli',
    'Gas Repair', 'Gas Agency', 'Cycle Repair', 'Car Repair', 'Bike Repair', 'Washroom Cleaner',
    'Water Supply', 'Pest Control', 'Car Wash', 'Milkman', 'RO / Water Purifier',
    'Grills & Mesh Work', 'Tent House', 'Water Cans', 'Catering', 'Photography', 'Decoration',
    'Boutique', 'Movers & Packers', 'Teaching', 'RTO Agent', 'Aadhar Centre', 'Other'
]

# Map terms to standard categories
CATEGORY_MAPPING = {
    'ac': 'AC Technician',
    'cooler': 'AC Technician',
    'refrigerator': 'AC Technician',
    'fridge': 'AC Technician',
    'tv': 'Other',  # Or Electrician/Other
    'carpenter': 'Carpenter',
    'wood': 'Carpenter',
    'furniture': 'Carpenter',
    'painter': 'Painter',
    'paint': 'Painter',
    'plumber': 'Plumber',
    'leak': 'Plumber',
    'tap': 'Plumber',
    'pipe': 'Plumber',
    'electrician': 'Electrician',
    'wire': 'Electrician',
    'switch': 'Electrician',
    'power': 'Electrician',
    'light': 'Electrician',
    'driver': 'Driver',
    'cab': 'Driver',
    'car': 'Driver',  # Note: can overlap with car wash / car repair
    'gardener': 'Gardener',
    'nursery': 'Gardener',
    'tailor': 'Tailor',
    'iron': 'Ironing / Press',
    'laundry': 'Ironing / Press',
    'press': 'Ironing / Press',
    'loundry': 'Ironing / Press',
    'salon': 'Salon / Beautician',
    'beautician': 'Salon / Beautician',
    'beauty': 'Salon / Beautician',
    'rangoli': 'Door Rangoli',
    'muggu': 'Door Rangoli',
    'gas': 'Gas Agency',
    'cylinder': 'Gas Agency',
    'indane': 'Gas Agency',
    'hp gas': 'Gas Agency',
    'bharath': 'Gas Agency',
    'gas repair': 'Gas Repair',
    'cycle': 'Cycle Repair',
    'bike': 'Bike Repair',
    'enfield': 'Bike Repair',
    'car repair': 'Car Repair',
    'mechanic': 'Car Repair',
    'washroom': 'Washroom Cleaner',
    'bathroom': 'Washroom Cleaner',
    'deep cleaning': 'Washroom Cleaner',
    'cleaning': 'Washroom Cleaner',
    'cleaner': 'Washroom Cleaner',
    'pest': 'Pest Control',
    'termite': 'Pest Control',
    'car wash': 'Car Wash',
    'car cleaning': 'Car Wash',
    'zoho car': 'Car Wash',
    'milk': 'Milkman',
    'milkman': 'Milkman',
    'arudra milk': 'Milkman',
    'water purifier': 'RO / Water Purifier',
    'aquaguard': 'RO / Water Purifier',
    'kent': 'RO / Water Purifier',
    'ro ': 'RO / Water Purifier',
    'water filter': 'RO / Water Purifier',
    'grill': 'Grills & Mesh Work',
    'mesh': 'Grills & Mesh Work',
    'window': 'Grills & Mesh Work',
    'tent': 'Tent House',
    'chairs': 'Tent House',
    'table': 'Tent House',
    'water supply': 'Water Supply',
    'water cans': 'Water Cans',
    'bisleri': 'Water Cans',
    'catering': 'Catering',
    'caterer': 'Catering',
    'food': 'Catering',
    'photo': 'Photography',
    'decor': 'Decoration',
    'balloon': 'Decoration',
    'boutique': 'Boutique',
    'packer': 'Movers & Packers',
    'mover': 'Movers & Packers',
    'teach': 'Teaching',
    'tutor': 'Teaching',
    'school': 'Teaching',
    'rto': 'RTO Agent',
    'aadhar': 'Aadhar Centre',
    'pujari': 'Other',
    'pandit': 'Other',
    'priest': 'Other',
    'panthulu': 'Other',
    'medical': 'Other',
    'pharmacy': 'Other',
    'nurse': 'Other',
    'physio': 'Other',
    'doctor': 'Other',
    'dr.': 'Other',
    'swim': 'Other',
    'coach': 'Other',
    'trainer': 'Other',
    'internet': 'Other',
    'airtel': 'Other',
    'fiber': 'Other',
    'pioneer': 'Other',
    'glass': 'Other',
    'upvc': 'Other'
}

def clean_phone(phone_str):
    if not phone_str:
        return ""
    # Remove all non-digits, keeping '+' if it is at start
    is_plus = phone_str.strip().startswith('+')
    digits = re.sub(r'\D', '', phone_str)
    if not digits:
        return ""
    
    # Standardize Indian mobile numbers (10 digits)
    # If it starts with 91 and has 12 digits total
    if len(digits) == 12 and digits.startswith('91'):
        return f"+{digits}"
    # If it is 10 digits, add +91
    if len(digits) == 10:
        return f"+91{digits}"
    
    # Return whatever digits with plus if it was there
    return f"+{digits}" if is_plus else f"+{digits}"

def infer_category(name, filename):
    combined = f"{name} {filename}".lower()
    
    # Check for direct fits first
    for term, category in CATEGORY_MAPPING.items():
        if term in combined:
            return category
            
    # Default fallback heuristics
    if "maid" in combined: return "Maid"
    if "cook" in combined: return "Cook"
    if "electric" in combined: return "Electrician"
    if "plumb" in combined: return "Plumber"
    if "carpenter" in combined: return "Carpenter"
    if "paint" in combined: return "Painter"
    
    return "Other"

# Step 1: Parse all VCF files
providers = []
vcf_files = glob.glob(os.path.join(VCF_DIR, "*.vcf"))

print(f"Found {len(vcf_files)} VCF files.")

for filepath in vcf_files:
    filename = os.path.basename(filepath)
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    fn_match = re.search(r'^FN:(.*)$', content, re.MULTILINE)
    tel_matches = re.findall(r'^TEL(?:;.*)?:(.*)$', content, re.MULTILINE)
    desc_match = re.search(r'^X-WA-BIZ-DESCRIPTION:(.*)$', content, re.MULTILINE)
    biz_name_match = re.search(r'^X-WA-BIZ-NAME:(.*)$', content, re.MULTILINE)
    
    name = fn_match.group(1).strip() if fn_match else os.path.splitext(filename)[0]
    phone = clean_phone(tel_matches[0].strip()) if tel_matches else ""
    description = desc_match.group(1).strip() if desc_match else ""
    biz_name = biz_name_match.group(1).strip() if biz_name_match else ""
    
    if not phone:
        # Try finding phone in the filename or contents
        phone_in_file = re.findall(r'\+?\d[\d\s-]{8,14}\d', content)
        if phone_in_file:
            phone = clean_phone(phone_in_file[0])
            
    category = infer_category(name, filename)
    
    # Refine name if it contains VCF extension or weird characters
    name = re.sub(r'[\r\n]', '', name)
    name = name.replace('\\', '').strip()
    
    providers.append({
        'name': name,
        'phone': phone,
        'category': category,
        'description': description or biz_name or None,
        'filename': filename,
        'vcard_phones': [clean_phone(t) for t in tel_matches if clean_phone(t)],
        'feedback': []
    })

# Deduplicate providers by phone number
deduped_providers = {}
for p in providers:
    if not p['phone']:
        continue
    # Key on phone
    ph = p['phone']
    if ph not in deduped_providers:
        deduped_providers[ph] = p
    else:
        # Merge descriptions or keep the better name
        existing = deduped_providers[ph]
        if not existing['description'] and p['description']:
            existing['description'] = p['description']
        if len(p['name']) < len(existing['name']):
            existing['name'] = p['name'] # Often shorter is cleaner
        existing['vcard_phones'] = list(set(existing['vcard_phones'] + p['vcard_phones']))

print(f"Deduplicated to {len(deduped_providers)} unique providers.")

# Step 2: Read WhatsApp Chat text and look for feedback
chat_lines = []
if os.path.exists(CHAT_FILE):
    print("Reading WhatsApp chat file...")
    with open(CHAT_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        chat_lines = f.readlines()
    print(f"Read {len(chat_lines)} lines of chat.")
else:
    print(f"Chat file not found at {CHAT_FILE}")

# For each line in the chat, look for mentions of provider names, phone numbers, or vcf files.
# Let's index chat lines for quick context lookup (window of 3 lines before and 3 lines after)
def search_mentions_in_chat(provider_dict, lines):
    name_clean = provider_dict['name'].lower()
    # Remove suffixes like "Ira", "Kollur", "Aspiration" to search for the core name
    core_name = re.sub(r'(ira|kollur|aspiration|aspire|resident|apartment|society|group|owner|living)', '', name_clean).strip()
    # Ignore names that are too short to avoid false positives
    name_tokens = [t for t in core_name.split() if len(t) > 2]
    
    filename_clean = provider_dict['filename'].lower()
    filename_no_ext = os.path.splitext(filename_clean)[0]
    
    phones = provider_dict['vcard_phones']
    # Also search for numbers without +91 or with spaces
    phone_patterns = []
    for ph in phones:
        digits_only = re.sub(r'\D', '', ph)
        if len(digits_only) >= 10:
            last_10 = digits_only[-10:]
            phone_patterns.append(last_10)
            phone_patterns.append(f"{last_10[:5]} {last_10[5:]}")
            
    matches = []
    seen_indices = set()
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        matched = False
        
        # Match by filename
        if filename_no_ext in line_lower or filename_clean in line_lower:
            matched = True
            
        # Match by phone digits
        if not matched:
            for pat in phone_patterns:
                if pat in line_lower:
                    matched = True
                    break
                    
        # Match by name tokens if we have distinct tokens
        if not matched and name_tokens:
            # Check if all or most name tokens match
            matches_count = sum(1 for tok in name_tokens if tok in line_lower)
            if matches_count == len(name_tokens) and len(name_tokens) >= 1:
                matched = True
                
        if matched:
            # Capture context (3 lines before and 3 lines after)
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            context_block = []
            for idx in range(start, end):
                cleaned_l = lines[idx].strip()
                if cleaned_l:
                    context_block.append(cleaned_l)
            
            # Combine into a single text block
            context_str = "\n".join(context_block)
            # Avoid duplicate matches in close proximity
            if i not in seen_indices:
                matches.append(context_str)
                # Mark surrounding lines as seen to avoid duplicate overlaps
                for s in range(start, end):
                    seen_indices.add(s)
                    
    return matches[:8] # Limit to top 8 mentions to keep markdown readable

print("Extracting feedback from chat...")
for phone, provider in deduped_providers.items():
    provider['feedback'] = search_mentions_in_chat(provider, chat_lines)

# Write output as a markdown file
output_path = os.path.join(VCF_DIR, "extracted_providers.md")

with open(output_path, 'w', encoding='utf-8') as out:
    out.write("# Extracted Service Providers from WhatsApp Chat\n\n")
    out.write(f"This document contains **{len(deduped_providers)}** service providers extracted from the WhatsApp chat logs and VCF files of the Aspiration Living Residents Group. These can be inserted directly into the Society Service Hub app.\n\n")
    
    # Group by category
    by_category = {}
    for p in deduped_providers.values():
        cat = p['category']
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(p)
        
    out.write("## Summary of Providers by Category\n\n")
    out.write("| Category | Count | Providers |\n")
    out.write("| --- | --- | --- |\n")
    for cat in sorted(by_category.keys()):
        names = ", ".join([p['name'] for p in by_category[cat][:5]])
        if len(by_category[cat]) > 5:
            names += f" (+{len(by_category[cat]) - 5} more)"
        out.write(f"| **{cat}** | {len(by_category[cat])} | {names} |\n")
    out.write("\n---\n\n")
    
    # Detailed list
    out.write("## Detailed Providers List & Feedback\n\n")
    for cat in sorted(by_category.keys()):
        out.write(f"### Category: {cat}\n\n")
        for p in sorted(by_category[cat], key=lambda x: x['name']):
            out.write(f"#### {p['name']}\n")
            out.write(f"- **Phone**: `{p['phone']}`\n")
            out.write(f"- **Source File**: `{p['filename']}`\n")
            if p['description']:
                out.write(f"- **Bio/Description**: *{p['description']}*\n")
            
            if p['feedback']:
                out.write("- **WhatsApp Mentions & Context**:\n")
                for fb in p['feedback']:
                    # Format as blockquote, indenting lines
                    formatted_fb = "\n".join([f"  > {l}" for l in fb.split('\n')])
                    out.write(f"{formatted_fb}\n\n")
            else:
                out.write("- **WhatsApp Mentions**: *No specific text discussions found (shared via contact card).* \n\n")
                
            # Generate SQL Query
            desc_val = f"'{p['description']}'" if p['description'] else "NULL"
            # Escape single quotes in name and description
            esc_name = p['name'].replace("'", "''")
            esc_desc = p['description'].replace("'", "''") if p['description'] else None
            desc_sql = f"'{esc_desc}'" if esc_desc else "NULL"
            
            sql = f"INSERT INTO public.service_providers (community_id, created_by, name, phone, category, description, fraud_status, visibility)\n"
            sql += f"VALUES ('YOUR_COMMUNITY_ID', 'YOUR_USER_ID', '{esc_name}', '{p['phone']}', '{p['category']}', {desc_sql}, 'PASS', 'COMMUNITY');"
            
            out.write("```sql\n")
            out.write(sql + "\n")
            out.write("```\n\n")
            out.write("---\n\n")

print(f"Successfully wrote results to {output_path}")
