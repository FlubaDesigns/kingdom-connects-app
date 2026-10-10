import { db } from './firebase-config.js';
import { collection, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const categories = [
  // Automotive
  { slug: 'auto-repair', label: 'Auto Repair & Mechanics', description: 'General automotive repair and maintenance services', display_order: 1 },
  { slug: 'auto-body', label: 'Auto Body & Collision Repair', description: 'Body work, paint, and collision repair', display_order: 2 },
  { slug: 'auto-detailing', label: 'Auto Detailing & Car Wash', description: 'Professional car cleaning and detailing services', display_order: 3 },
  { slug: 'tire-service', label: 'Tire Sales & Service', description: 'Tire replacement, rotation, and repair', display_order: 4 },
  { slug: 'oil-change', label: 'Oil Change & Lube', description: 'Quick oil change and lubrication services', display_order: 5 },
  
  // Construction & Contractors
  { slug: 'general-contractor', label: 'General Contractor', description: 'Full-service construction and remodeling', display_order: 10 },
  { slug: 'electrician', label: 'Electrician', description: 'Electrical installation, repair, and maintenance', display_order: 11 },
  { slug: 'plumbing', label: 'Plumbing Services', description: 'Residential and commercial plumbing', display_order: 12 },
  { slug: 'hvac', label: 'HVAC Services', description: 'Heating, ventilation, and air conditioning', display_order: 13 },
  { slug: 'roofing', label: 'Roofing Services', description: 'Roof installation, repair, and replacement', display_order: 14 },
  { slug: 'carpentry', label: 'Carpentry & Woodworking', description: 'Custom woodworking and carpentry services', display_order: 15 },
  { slug: 'flooring', label: 'Flooring Installation', description: 'Flooring sales and installation', display_order: 16 },
  { slug: 'painting', label: 'Painting Services', description: 'Interior and exterior painting', display_order: 17 },
  { slug: 'pressure-washing', label: 'Pressure Washing', description: 'High-pressure cleaning for homes, driveways, and buildings', display_order: 18 },
  { slug: 'deck-cleaning', label: 'Deck Cleaning & Staining', description: 'Deck restoration, cleaning, sealing, and staining', display_order: 19 },
  { slug: 'driveway-cleaning', label: 'Driveway & Sidewalk Cleaning', description: 'Concrete and paver cleaning services', display_order: 20 },
  { slug: 'gutter-cleaning', label: 'Gutter Cleaning & Repair', description: 'Gutter cleaning, repair, and installation', display_order: 21 },
  { slug: 'window-cleaning', label: 'Window Cleaning', description: 'Professional window cleaning services', display_order: 22 },
  { slug: 'drywall', label: 'Drywall Installation & Repair', description: 'Drywall hanging, taping, and repair', display_order: 23 },
  { slug: 'masonry', label: 'Masonry & Brickwork', description: 'Brick, stone, and concrete work', display_order: 24 },
  { slug: 'fencing', label: 'Fencing Installation', description: 'Fence installation and repair', display_order: 25 },
  
  // Home Services
  { slug: 'landscaping', label: 'Landscaping & Lawn Care', description: 'Lawn maintenance, landscaping design', display_order: 30 },
  { slug: 'lawn-mowing', label: 'Lawn Mowing Service', description: 'Regular lawn cutting and trimming', display_order: 31 },
  { slug: 'tree-service', label: 'Tree Service & Removal', description: 'Tree trimming, removal, and stump grinding', display_order: 32 },
  { slug: 'irrigation', label: 'Irrigation & Sprinkler Systems', description: 'Sprinkler installation and repair', display_order: 33 },
  { slug: 'cleaning', label: 'House Cleaning Services', description: 'Residential and commercial cleaning', display_order: 34 },
  { slug: 'carpet-cleaning', label: 'Carpet Cleaning', description: 'Professional carpet and upholstery cleaning', display_order: 35 },
  { slug: 'pest-control', label: 'Pest Control', description: 'Extermination and pest management', display_order: 36 },
  { slug: 'pool-service', label: 'Pool Service & Repair', description: 'Pool cleaning, maintenance, and repair', display_order: 37 },
  { slug: 'handyman', label: 'Handyman Services', description: 'General home repair and maintenance', display_order: 38 },
  { slug: 'appliance-repair', label: 'Appliance Repair', description: 'Repair for washers, dryers, refrigerators, etc.', display_order: 39 },
  { slug: 'locksmith', label: 'Locksmith Services', description: 'Lock installation, repair, and emergency lockout', display_order: 40 },
  
  // Professional Services
  { slug: 'legal-services', label: 'Legal Services', description: 'Attorney and legal representation', display_order: 50 },
  { slug: 'family-law', label: 'Family Law Attorney', description: 'Divorce, custody, and family legal matters', display_order: 51 },
  { slug: 'estate-planning', label: 'Estate Planning', description: 'Wills, trusts, and estate legal services', display_order: 52 },
  { slug: 'accounting', label: 'Accounting & Bookkeeping', description: 'Tax preparation, accounting services', display_order: 53 },
  { slug: 'tax-preparation', label: 'Tax Preparation', description: 'Individual and business tax services', display_order: 54 },
  { slug: 'real-estate', label: 'Real Estate Services', description: 'Real estate agents and brokers', display_order: 55 },
  { slug: 'insurance', label: 'Insurance Services', description: 'Insurance agents and brokers', display_order: 56 },
  { slug: 'financial-planning', label: 'Financial Planning', description: 'Investment and financial advisory', display_order: 57 },
  { slug: 'notary', label: 'Notary Services', description: 'Document notarization services', display_order: 58 },
  
  // Health & Wellness
  { slug: 'medical', label: 'Medical Services', description: 'Doctors, physicians, medical clinics', display_order: 60 },
  { slug: 'dental', label: 'Dental Services', description: 'Dentists and dental care', display_order: 61 },
  { slug: 'chiropractic', label: 'Chiropractic Care', description: 'Chiropractors and spinal care', display_order: 62 },
  { slug: 'counseling', label: 'Counseling & Therapy', description: 'Mental health counseling and therapy', display_order: 63 },
  { slug: 'fitness', label: 'Fitness & Personal Training', description: 'Gyms, trainers, fitness centers', display_order: 64 },
  { slug: 'massage-therapy', label: 'Massage Therapy', description: 'Therapeutic and relaxation massage', display_order: 65 },
  { slug: 'nutrition', label: 'Nutrition & Dietitian', description: 'Nutritional counseling and meal planning', display_order: 66 },
  
  // Food & Dining
  { slug: 'restaurant', label: 'Restaurants', description: 'Dining establishments', display_order: 70 },
  { slug: 'catering', label: 'Catering Services', description: 'Event and party catering', display_order: 71 },
  { slug: 'bakery', label: 'Bakery', description: 'Bakeries and pastry shops', display_order: 72 },
  { slug: 'coffee-shop', label: 'Coffee Shop & Café', description: 'Coffee shops and cafés', display_order: 73 },
  { slug: 'food-truck', label: 'Food Truck', description: 'Mobile food services', display_order: 74 },
  { slug: 'meal-prep', label: 'Meal Prep Services', description: 'Prepared meal delivery and planning', display_order: 75 },
  
  // Retail
  { slug: 'retail-clothing', label: 'Clothing & Apparel', description: 'Clothing stores and boutiques', display_order: 80 },
  { slug: 'bookstore', label: 'Bookstore', description: 'Christian bookstores and book retailers', display_order: 81 },
  { slug: 'gift-shop', label: 'Gift Shop', description: 'Gift and specialty stores', display_order: 82 },
  { slug: 'jewelry', label: 'Jewelry Store', description: 'Jewelry sales and repair', display_order: 83 },
  { slug: 'furniture', label: 'Furniture Store', description: 'Furniture sales and showrooms', display_order: 84 },
  
  // Beauty & Personal Care
  { slug: 'hair-salon', label: 'Hair Salon', description: 'Hair cutting and styling', display_order: 90 },
  { slug: 'barbershop', label: 'Barbershop', description: 'Men\'s grooming and haircuts', display_order: 91 },
  { slug: 'spa', label: 'Spa Services', description: 'Spa treatments and services', display_order: 92 },
  { slug: 'nail-salon', label: 'Nail Salon', description: 'Manicures, pedicures, nail services', display_order: 93 },
  { slug: 'skincare', label: 'Skincare & Esthetics', description: 'Facial treatments and skincare services', display_order: 94 },
  
  // Technology
  { slug: 'it-support', label: 'IT Support & Services', description: 'Computer and network support', display_order: 100 },
  { slug: 'web-design', label: 'Web Design & Development', description: 'Website design and development', display_order: 101 },
  { slug: 'computer-repair', label: 'Computer Repair', description: 'Computer and device repair', display_order: 102 },
  { slug: 'phone-repair', label: 'Phone & Tablet Repair', description: 'Mobile device repair services', display_order: 103 },
  { slug: 'security-systems', label: 'Security Systems', description: 'Home and business security installation', display_order: 104 },
  { slug: 'graphic-design', label: 'Graphic Design', description: 'Logo design, branding, and graphics', display_order: 105 },
  { slug: 'photography', label: 'Photography Services', description: 'Professional photography', display_order: 106 },
  { slug: 'videography', label: 'Videography Services', description: 'Video production and editing', display_order: 107 },
  
  // Education & Childcare
  { slug: 'tutoring', label: 'Tutoring Services', description: 'Academic tutoring and instruction', display_order: 110 },
  { slug: 'daycare', label: 'Daycare & Childcare', description: 'Childcare and preschool services', display_order: 111 },
  { slug: 'music-lessons', label: 'Music Lessons', description: 'Music instruction and lessons', display_order: 112 },
  { slug: 'dance-lessons', label: 'Dance Lessons', description: 'Dance instruction and classes', display_order: 113 },
  
  // Moving & Storage
  { slug: 'moving-services', label: 'Moving Services', description: 'Residential and commercial moving', display_order: 120 },
  { slug: 'storage', label: 'Storage Units', description: 'Self-storage and storage facilities', display_order: 121 },
  { slug: 'junk-removal', label: 'Junk Removal', description: 'Junk hauling and removal services', display_order: 122 },
  
  // Pet Services
  { slug: 'pet-grooming', label: 'Pet Grooming', description: 'Professional pet grooming services', display_order: 130 },
  { slug: 'veterinary', label: 'Veterinary Services', description: 'Veterinary care and animal hospitals', display_order: 131 },
  { slug: 'pet-sitting', label: 'Pet Sitting & Dog Walking', description: 'Pet care and dog walking services', display_order: 132 },
  
  // Events & Entertainment
  { slug: 'event-planning', label: 'Event Planning', description: 'Wedding and event planning services', display_order: 140 },
  { slug: 'dj-services', label: 'DJ Services', description: 'Event DJ and music services', display_order: 141 },
  { slug: 'party-rentals', label: 'Party Rentals', description: 'Event equipment and party rentals', display_order: 142 },
  
  // Emergency Services
  { slug: 'emergency-services', label: 'Emergency Services', description: '24/7 emergency repair services', display_order: 150 },
  { slug: 'water-damage', label: 'Water Damage Restoration', description: 'Water damage repair and restoration', display_order: 151 },
  { slug: 'fire-restoration', label: 'Fire Damage Restoration', description: 'Fire and smoke damage restoration', display_order: 152 }
];

async function populateCategories() {
  const statusDiv = document.getElementById('status');
  const listDiv = document.getElementById('categoryList');
  const btn = document.getElementById('startBtn');
  
  btn.disabled = true;
  statusDiv.innerHTML = '<div class="status"><p class="progress">Starting...</p></div>';
  listDiv.innerHTML = '';
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    
    try {
      await addDoc(collection(db, 'categories'), {
        slug: category.slug,
        label: category.label,
        description: category.description,
        display_order: category.display_order,
        active: true,
        created_at: Timestamp.now(),
        created_by: 'migration',
        type: 'general'
      });
      
      successCount++;
      listDiv.innerHTML += `<div class="category-item">✅ ${category.label}</div>`;
      statusDiv.innerHTML = `<div class="status"><p class="progress">Progress: ${successCount} / ${categories.length}</p></div>`;
      
    } catch (error) {
      errorCount++;
      listDiv.innerHTML += `<div class="category-item error-item">❌ ${category.label} - ${error.message}</div>`;
      console.error(`Error adding ${category.label}:`, error);
    }
    
    listDiv.scrollTop = listDiv.scrollHeight;
  }
  
  statusDiv.innerHTML = `<div class="status">
    <p class="progress">✅ COMPLETE!</p>
    <p>Successfully added: <strong>${successCount}</strong> categories</p>
    ${errorCount > 0 ? `<p class="error-text">Errors: <strong>${errorCount}</strong></p>` : ''}
    <p class="completion-msg">You can now close this page and test your business submission form!</p>
  </div>`;
  
  btn.disabled = false;
  btn.textContent = 'Done!';
}

document.getElementById('startBtn').addEventListener('click', populateCategories);
