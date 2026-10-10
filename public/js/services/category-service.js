import { db } from '../firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let categoriesCache = null;

export async function fetchCategories() {
  if (categoriesCache) {
    return categoriesCache;
  }

  try {
    console.log("🔍 Loading categories from Firestore...");
    const snapshot = await getDocs(collection(db, "categories"));
    
    console.log(`📦 Received ${snapshot.size} category documents`);
    
    const categories = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.active) {
        categories.push({
          id: doc.id,
          value: data.slug,
          label: data.label,
          display_order: data.display_order || 999,
          parent_slug: data.parent_slug || null,
          ...data
        });
      }
    });
    
    categories.sort((a, b) => a.display_order - b.display_order);
    
    categoriesCache = categories;
    console.log(`✅ Loaded ${categories.length} active categories`);
    
    return categories;
  } catch (error) {
    console.error("❌ Error loading categories:", error);
    throw error;
  }
}

export async function loadCategories() {
  return fetchCategories();
}

export function getCategoryTree() {
  if (!categoriesCache) {
    throw new Error("Categories not loaded. Call fetchCategories() first.");
  }
  
  const parents = categoriesCache.filter(cat => !cat.parent_slug);
  const children = categoriesCache.filter(cat => cat.parent_slug);
  
  return parents.map(parent => ({
    ...parent,
    children: children.filter(child => child.parent_slug === parent.value)
  }));
}

export function populateCategoryDropdown(selectElement, options = {}) {
  const {
    includeAllOption = false,
    allOptionText = 'All Categories',
    hierarchical = false
  } = options;
  
  if (!categoriesCache) {
    throw new Error("Categories not loaded. Call fetchCategories() first.");
  }
  
  selectElement.innerHTML = '';
  
  if (includeAllOption) {
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = allOptionText;
    selectElement.appendChild(allOption);
  }
  
  if (hierarchical) {
    const tree = getCategoryTree();
    tree.forEach(parent => {
      const parentOption = document.createElement('option');
      parentOption.value = parent.value;
      parentOption.textContent = parent.label;
      selectElement.appendChild(parentOption);
      
      parent.children.forEach(child => {
        const childOption = document.createElement('option');
        childOption.value = child.value;
        childOption.textContent = `  ↳ ${child.label}`;
        selectElement.appendChild(childOption);
      });
    });
  } else {
    categoriesCache.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.value;
      option.textContent = cat.label;
      selectElement.appendChild(option);
    });
  }
}

export function clearCategoriesCache() {
  categoriesCache = null;
}
