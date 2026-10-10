/**
 * Nexus Media Inspector Module
 * Injectable diagnostic overlay for images and videos on any page
 * 
 * Usage: 
 *   window.NexusMediaInspector.init()   - Launch inspector
 *   window.NexusMediaInspector.destroy() - Remove inspector
 */

(function() {
  'use strict';
  
  const INSPECTOR_ID = 'nexus-media-inspector';
  
  function getMediaStatus(el) {
    const isImg = el.tagName === 'IMG';
    const isVideo = el.tagName === 'VIDEO';
    
    const status = {
      type: isImg ? 'image' : 'video',
      src: el.src || el.currentSrc || '(none)',
      loaded: false,
      error: false,
      naturalWidth: 0,
      naturalHeight: 0,
      displayWidth: el.offsetWidth,
      displayHeight: el.offsetHeight,
      visible: el.offsetParent !== null,
      cors: false,
      details: []
    };
    
    if (isImg) {
      status.loaded = el.complete && el.naturalWidth > 0;
      status.error = el.complete && el.naturalWidth === 0 && el.src;
      status.naturalWidth = el.naturalWidth || 0;
      status.naturalHeight = el.naturalHeight || 0;
      
      if (!el.src) {
        status.details.push('No src attribute');
      } else if (status.error) {
        status.details.push('Failed to load');
      } else if (status.loaded) {
        status.details.push(`${status.naturalWidth}x${status.naturalHeight}`);
      } else {
        status.details.push('Still loading...');
      }
    }
    
    if (isVideo) {
      status.loaded = el.readyState >= 2;
      status.error = el.error !== null;
      status.naturalWidth = el.videoWidth || 0;
      status.naturalHeight = el.videoHeight || 0;
      status.duration = el.duration || 0;
      
      if (!el.src && !el.querySelector('source')) {
        status.details.push('No source');
      } else if (status.error) {
        status.details.push(`Error: ${el.error?.message || 'Unknown'}`);
      } else if (status.loaded) {
        status.details.push(`${status.naturalWidth}x${status.naturalHeight}, ${Math.round(status.duration)}s`);
      } else {
        status.details.push('Loading...');
      }
    }
    
    // Check if cross-origin
    try {
      const url = new URL(el.src || el.currentSrc, window.location.origin);
      if (url.origin !== window.location.origin) {
        status.cors = true;
        status.details.push('Cross-origin');
      }
    } catch (e) {
      // Invalid URL
    }
    
    return status;
  }
  
  function scanPage() {
    const images = Array.from(document.querySelectorAll('img'));
    const videos = Array.from(document.querySelectorAll('video'));
    
    const results = {
      images: images.map(getMediaStatus),
      videos: videos.map(getMediaStatus),
      summary: {
        totalImages: images.length,
        totalVideos: videos.length,
        loadedImages: 0,
        errorImages: 0,
        loadedVideos: 0,
        errorVideos: 0
      }
    };
    
    results.images.forEach(img => {
      if (img.loaded) results.summary.loadedImages++;
      if (img.error) results.summary.errorImages++;
    });
    
    results.videos.forEach(vid => {
      if (vid.loaded) results.summary.loadedVideos++;
      if (vid.error) results.summary.errorVideos++;
    });
    
    return results;
  }
  
  function createPanel() {
    if (document.getElementById(INSPECTOR_ID)) {
      return document.getElementById(INSPECTOR_ID);
    }
    
    const panel = document.createElement('div');
    panel.id = INSPECTOR_ID;
    panel.innerHTML = `
      <div class="nmi-header">
        <span class="nmi-title">Nexus Media Inspector</span>
        <div class="nmi-controls">
          <button class="nmi-btn nmi-refresh" title="Refresh">&#8635;</button>
          <button class="nmi-btn nmi-minimize" title="Minimize">&#8722;</button>
          <button class="nmi-btn nmi-close" title="Close">&#10005;</button>
        </div>
      </div>
      <div class="nmi-body">
        <div class="nmi-summary"></div>
        <div class="nmi-tabs">
          <button class="nmi-tab active" data-tab="images">Images</button>
          <button class="nmi-tab" data-tab="videos">Videos</button>
        </div>
        <div class="nmi-content"></div>
      </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.id = 'nexus-media-inspector-styles';
    style.textContent = `
      #${INSPECTOR_ID} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 360px;
        max-height: 500px;
        background: #1a1a2e;
        border: 2px solid #d4af37;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e0e0e0;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      #${INSPECTOR_ID}.minimized .nmi-body { display: none; }
      .nmi-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: linear-gradient(135deg, #d4af37, #8b6914);
        border-radius: 6px 6px 0 0;
        cursor: move;
      }
      .nmi-title {
        font-weight: 600;
        color: #000;
      }
      .nmi-controls { display: flex; gap: 6px; }
      .nmi-btn {
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 4px;
        background: rgba(0,0,0,0.2);
        color: #000;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
      }
      .nmi-btn:hover { background: rgba(0,0,0,0.4); }
      .nmi-body { padding: 12px; }
      .nmi-summary {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }
      .nmi-stat {
        background: #2a2a4e;
        padding: 8px;
        border-radius: 4px;
        text-align: center;
      }
      .nmi-stat-value {
        font-size: 20px;
        font-weight: 600;
        color: #d4af37;
      }
      .nmi-stat-label { font-size: 11px; color: #888; }
      .nmi-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 8px;
      }
      .nmi-tab {
        flex: 1;
        padding: 6px;
        border: none;
        background: #2a2a4e;
        color: #888;
        cursor: pointer;
        border-radius: 4px;
      }
      .nmi-tab.active {
        background: #d4af37;
        color: #000;
      }
      .nmi-content {
        max-height: 280px;
        overflow-y: auto;
      }
      .nmi-item {
        display: flex;
        gap: 8px;
        padding: 8px;
        background: #2a2a4e;
        border-radius: 4px;
        margin-bottom: 6px;
        align-items: flex-start;
      }
      .nmi-thumb {
        width: 48px;
        height: 48px;
        object-fit: cover;
        border-radius: 4px;
        background: #1a1a2e;
        flex-shrink: 0;
      }
      .nmi-info { flex: 1; min-width: 0; }
      .nmi-src {
        font-size: 11px;
        color: #888;
        word-break: break-all;
        max-height: 32px;
        overflow: hidden;
      }
      .nmi-status {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
      }
      .nmi-badge {
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
      }
      .nmi-badge.ok { background: #28a745; color: #fff; }
      .nmi-badge.error { background: #dc3545; color: #fff; }
      .nmi-badge.loading { background: #ffc107; color: #000; }
      .nmi-badge.cors { background: #6c757d; color: #fff; }
      .nmi-empty {
        text-align: center;
        color: #666;
        padding: 20px;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(panel);
    
    // Event handlers
    panel.querySelector('.nmi-close').onclick = destroy;
    panel.querySelector('.nmi-minimize').onclick = () => panel.classList.toggle('minimized');
    panel.querySelector('.nmi-refresh').onclick = refresh;
    
    panel.querySelectorAll('.nmi-tab').forEach(tab => {
      tab.onclick = () => {
        panel.querySelectorAll('.nmi-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderContent(tab.dataset.tab);
      };
    });
    
    // Make draggable
    let isDragging = false;
    let offsetX, offsetY;
    const header = panel.querySelector('.nmi-header');
    header.onmousedown = (e) => {
      isDragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
    };
    document.onmousemove = (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - offsetX) + 'px';
      panel.style.top = (e.clientY - offsetY) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    document.onmouseup = () => isDragging = false;
    
    return panel;
  }
  
  let currentResults = null;
  
  function renderSummary() {
    const panel = document.getElementById(INSPECTOR_ID);
    if (!panel || !currentResults) return;
    
    const s = currentResults.summary;
    panel.querySelector('.nmi-summary').innerHTML = `
      <div class="nmi-stat">
        <div class="nmi-stat-value">${s.totalImages}</div>
        <div class="nmi-stat-label">Images (${s.loadedImages} ok, ${s.errorImages} err)</div>
      </div>
      <div class="nmi-stat">
        <div class="nmi-stat-value">${s.totalVideos}</div>
        <div class="nmi-stat-label">Videos (${s.loadedVideos} ok, ${s.errorVideos} err)</div>
      </div>
    `;
  }
  
  function renderContent(tab = 'images') {
    const panel = document.getElementById(INSPECTOR_ID);
    if (!panel || !currentResults) return;
    
    const items = tab === 'images' ? currentResults.images : currentResults.videos;
    const content = panel.querySelector('.nmi-content');
    
    if (items.length === 0) {
      content.innerHTML = `<div class="nmi-empty">No ${tab} found on this page</div>`;
      return;
    }
    
    content.innerHTML = items.map((item, i) => {
      const badge = item.error ? 'error' : (item.loaded ? 'ok' : 'loading');
      const badgeText = item.error ? 'ERROR' : (item.loaded ? 'OK' : 'LOADING');
      
      return `
        <div class="nmi-item">
          ${item.type === 'image' 
            ? `<img class="nmi-thumb" src="${item.src}" onerror="this.style.background='#dc3545'">`
            : `<div class="nmi-thumb" style="display:flex;align-items:center;justify-content:center;color:#666;">VID</div>`
          }
          <div class="nmi-info">
            <div class="nmi-src">${item.src}</div>
            <div class="nmi-status">
              <span class="nmi-badge ${badge}">${badgeText}</span>
              ${item.cors ? '<span class="nmi-badge cors">CORS</span>' : ''}
              <span style="color:#888;font-size:11px">${item.details.join(' | ')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function refresh() {
    currentResults = scanPage();
    renderSummary();
    const activeTab = document.querySelector('.nmi-tab.active');
    renderContent(activeTab?.dataset.tab || 'images');
  }
  
  function init() {
    createPanel();
    refresh();
    console.log('[Nexus] Media Inspector initialized');
  }
  
  function destroy() {
    const panel = document.getElementById(INSPECTOR_ID);
    const style = document.getElementById('nexus-media-inspector-styles');
    if (panel) panel.remove();
    if (style) style.remove();
    console.log('[Nexus] Media Inspector destroyed');
  }
  
  // Expose globally
  window.NexusMediaInspector = { init, destroy, refresh, scan: scanPage };
})();
