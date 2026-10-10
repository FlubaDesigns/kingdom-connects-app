import { renderChurchBenefits } from '/js/benefits/church-benefits.js';
import { renderMemberBenefits } from '/js/benefits/member-benefits.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const isPastor = params.get('role') === 'pastor' || !params.has('role');
  
  if (isPastor) {
    document.getElementById('pastorActions').classList.remove('hidden');
    document.getElementById('pastorCinema').classList.remove('hidden');
    document.getElementById('communityActions').classList.add('hidden');
    document.getElementById('communityCinema').classList.add('hidden');
    document.getElementById('pastorHero').classList.remove('hidden');
    document.getElementById('communityHero').classList.add('hidden');
    renderChurchBenefits('benefitsContainer');
  } else {
    document.getElementById('pastorActions').classList.add('hidden');
    document.getElementById('pastorCinema').classList.add('hidden');
    document.getElementById('communityActions').classList.remove('hidden');
    document.getElementById('communityCinema').classList.remove('hidden');
    document.getElementById('pastorHero').classList.add('hidden');
    document.getElementById('communityHero').classList.remove('hidden');
    renderMemberBenefits('benefitsContainer');
  }
});
