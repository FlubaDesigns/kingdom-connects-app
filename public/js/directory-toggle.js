document.addEventListener('DOMContentLoaded', function() {
  const btnFind = document.getElementById('btnFindBusiness');
  const btnList = document.getElementById('btnListBusiness');
  const findSection = document.getElementById('findSection');
  const listSection = document.getElementById('listSection');

  if (!btnFind || !btnList) return;

  btnFind.addEventListener('click', function() {
    btnFind.classList.add('toggle-btn-active');
    btnList.classList.remove('toggle-btn-active');
    findSection.classList.remove('hidden');
    listSection.classList.add('hidden');
  });

  btnList.addEventListener('click', function() {
    btnList.classList.add('toggle-btn-active');
    btnFind.classList.remove('toggle-btn-active');
    listSection.classList.remove('hidden');
    findSection.classList.add('hidden');
  });
});
