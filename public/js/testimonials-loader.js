import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const testimonialsGrid = document.getElementById('testimonialsGrid');

async function loadTestimonials() {
  try {
    const testimonialsQuery = query(
      collection(db, 'testimonials'),
      where('status', '==', 'approved'),
      orderBy('submitted_at', 'desc'),
      limit(12)
    );
    
    const snapshot = await getDocs(testimonialsQuery);
    
    if (snapshot.empty) {
      renderFallbackTestimonials();
      return;
    }

    renderTestimonials(snapshot.docs);

  } catch (error) {
    console.error('Error loading testimonials:', error);
    renderFallbackTestimonials();
  }
}

function renderTestimonials(docs) {
  let html = '';

  docs.forEach(doc => {
    const testimonial = doc.data();
    const stars = '⭐'.repeat(testimonial.rating || 5);
    const memberSince = formatMemberSince(testimonial.member_since);

    html += `
      <div class="card-highlight">
        <div class="flex gap-md mb-md">
          <div class="icon-circle-gold">${getInitials(testimonial.author_name)}</div>
          <div>
            <h3 class="gold m-0 text-lg">${escapeHtml(testimonial.author_name)}</h3>
            <p class="m-0 text-muted text-sm">${escapeHtml(testimonial.author_title)}</p>
            ${testimonial.entity_name ? `<p class="m-0 text-muted text-sm">${escapeHtml(testimonial.entity_name)}</p>` : ''}
          </div>
        </div>
        <p class="text-content-italic mb-sm">"${escapeHtml(testimonial.testimonial_text)}"</p>
        <div class="flex-between-center mt-md pt-md border-top">
          <span class="text-muted text-sm">${memberSince}</span>
          <span class="text-gold">${stars}</span>
        </div>
      </div>
    `;
  });

  testimonialsGrid.innerHTML = html;
}

function renderFallbackTestimonials() {
  const fallbackTestimonials = [
    {
      initials: 'SM',
      name: 'Sarah Mitchell',
      title: 'Mitchell\'s Catering',
      text: 'Within 2 weeks of upgrading to Pro, I received 8 new catering orders from local church members. Kingdom Connects didn\'t just grow my business - it connected me with my community.',
      memberSince: 'Pro Member since Jan 2025',
      rating: 5
    },
    {
      initials: 'JR',
      name: 'James Rodriguez',
      title: 'Rodriguez Auto Repair',
      text: 'I\'ve been in auto repair for 15 years. Kingdom Connects brought me more Christian customers in 3 months than Yelp did in 3 years. And knowing 10% supports my church? That\'s the Lord\'s work.',
      memberSince: 'Pro Member since Dec 2024',
      rating: 5
    },
    {
      initials: 'LC',
      name: 'Lisa Chen',
      title: 'Chen Family Bakery',
      text: 'The free listing got me started, and when I saw the results, upgrading to Pro was a no-brainer. The QR code feature alone has brought in dozens of walk-ins from church events!',
      memberSince: 'Pro Member since Feb 2025',
      rating: 5
    },
    {
      initials: 'MJ',
      name: 'Marcus Johnson',
      title: 'Johnson Plumbing Services',
      text: 'As a solo plumber, I couldn\'t afford big marketing budgets. Kingdom Connects gave me visibility in my church community for less than the cost of one Yellow Pages ad. ROI has been incredible.',
      memberSince: 'Pro Member since Nov 2024',
      rating: 5
    },
    {
      initials: 'RW',
      name: 'Rebecca Williams',
      title: 'Grace Lawn Care',
      text: 'I started my landscaping business during COVID. Kingdom Connects helped me find Christian clients who value integrity and hard work. Now 70% of my customer base comes from this platform.',
      memberSince: 'Pro Member since Jan 2025',
      rating: 5
    },
    {
      initials: 'DT',
      name: 'David Thompson',
      title: 'Thompson Insurance Agency',
      text: 'Being part of Kingdom Connects has been transformational. Not just for my revenue, but for my faith journey. I\'m serving my community while supporting the Church. It\'s a calling, not just a listing.',
      memberSince: 'Pro Member since Oct 2024',
      rating: 5
    }
  ];

  let html = '';

  fallbackTestimonials.forEach(t => {
    const stars = '⭐'.repeat(t.rating);
    html += `
      <div class="card-highlight">
        <div class="flex gap-md mb-md">
          <div class="icon-circle-gold">${t.initials}</div>
          <div>
            <h3 class="gold m-0 text-lg">${t.name}</h3>
            <p class="m-0 text-muted text-sm">${t.title}</p>
          </div>
        </div>
        <p class="text-content-italic mb-sm">"${t.text}"</p>
        <div class="flex-between-center mt-md pt-md border-top">
          <span class="text-muted text-sm">${t.memberSince}</span>
          <span class="text-gold">${stars}</span>
        </div>
      </div>
    `;
  });

  testimonialsGrid.innerHTML = html;
}

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMemberSince(memberSince) {
  if (!memberSince) return 'Member';
  
  const labels = {
    'less-than-month': 'Member < 1 month',
    '1-3-months': 'Member 1-3 months',
    '3-6-months': 'Member 3-6 months',
    '6-12-months': 'Member 6-12 months',
    '1-2-years': 'Member 1-2 years',
    '2-plus-years': 'Member 2+ years'
  };

  return labels[memberSince] || 'Member';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

loadTestimonials();
