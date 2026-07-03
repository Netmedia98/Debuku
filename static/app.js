// ── Elements ──────────────────────────────────────────────────────────────
const dropZone        = document.getElementById('drop-zone');
const fileInput       = document.getElementById('file-input');
const dropIcon        = document.getElementById('drop-icon');
const dropText        = document.getElementById('drop-text');
const previewWrap     = document.getElementById('preview-wrap');
const previewImg      = document.getElementById('preview-img');
const btnReset        = document.getElementById('btn-reset');
const btnPredict      = document.getElementById('btn-predict');
const btnLabel        = document.getElementById('btn-label');
const btnSpinner      = document.getElementById('btn-spinner');

// Scanner laser
const scannerLaser    = document.getElementById('scanner-laser');

// Right panel state cards
const instructionCard = document.getElementById('instruction-card');
const resultCard      = document.getElementById('result-card');
const resultEmoji     = document.getElementById('result-emoji');
const resultLabel     = document.getElementById('result-label');
const resultBadge     = document.getElementById('result-badge');
const confValue       = document.getElementById('conf-value');
const confBar         = document.getElementById('conf-bar');
const probsList       = document.getElementById('probs-list');

// Tips elements
const tipsBox         = document.getElementById('tips-box');
const tipsTitle       = document.getElementById('tips-title');
const tipsText        = document.getElementById('tips-text');
const tipsIcon        = document.getElementById('tips-icon');

// History elements
const historyCard     = document.getElementById('history-card');
const historyEmpty    = document.getElementById('history-empty');
const historyList     = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');

let selectedFile = null;

// ── Document Ready: Load History ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderHistory();
  // Ensure scanner is hidden initially
  if (scannerLaser) scannerLaser.style.display = 'none';
});

// ── File selection helpers ─────────────────────────────────────────────────
function showPreview(file) {
  selectedFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  
  dropZone.style.display    = 'none';
  previewWrap.style.display = 'block';
  btnPredict.disabled       = false;
  
  // Show instructions initially when new image uploaded, hide results
  if (resultCard) resultCard.style.display = 'none';
  if (instructionCard) instructionCard.style.display = 'block';
  if (scannerLaser) scannerLaser.style.display = 'none';
}

function resetUpload() {
  selectedFile = null;
  fileInput.value = '';
  previewImg.src = '';
  
  dropZone.style.display    = 'block';
  previewWrap.style.display = 'none';
  btnPredict.disabled       = true;
  
  if (resultCard) resultCard.style.display = 'none';
  if (instructionCard) instructionCard.style.display = 'block';
  if (scannerLaser) scannerLaser.style.display = 'none';
}

// ── File input change ──────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) showPreview(fileInput.files[0]);
});

// ── Drag & drop ────────────────────────────────────────────────────────────
dropZone.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-browse') fileInput.click();
});
dropZone.addEventListener('dragover', (e) => { 
  e.preventDefault(); 
  dropZone.classList.add('drag-over'); 
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) showPreview(f);
});

// ── Reset Button ───────────────────────────────────────────────────────────
btnReset.addEventListener('click', resetUpload);

// ── Predict / Analyze Trigger ──────────────────────────────────────────────
btnPredict.addEventListener('click', async () => {
  if (!selectedFile) return;

  // Active Loading state
  btnLabel.style.display   = 'none';
  btnSpinner.style.display = 'inline-block';
  btnPredict.disabled      = true;
  
  // Activate Laser scanner animation
  if (scannerLaser) scannerLaser.style.display = 'block';

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res  = await fetch('/predict', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) {
      alert('Error: ' + data.error);
      return;
    }

    // Render result card details
    renderResult(data);
    
    // Save to local storage history
    saveToHistory(data);

  } catch (err) {
    alert('Koneksi gagal: ' + err.message);
  } finally {
    btnLabel.style.display   = 'inline';
    btnSpinner.style.display = 'none';
    btnPredict.disabled      = false;
    
    // Turn off Laser scanner animation
    if (scannerLaser) scannerLaser.style.display = 'none';
  }
});

// ── Recommendations Engine ─────────────────────────────────────────────────
function getRecommendations(fruit, condition) {
  if (fruit === 'Tidak Dikenali' || condition.toLowerCase() === 'unknown') {
    return {
      title: "Buah Tidak Dikenali",
      text: "Model AI saat ini hanya dirancang untuk mendeteksi kesegaran buah Apel, Pisang, dan Stroberi. Pastikan gambar yang Anda unggah menampilkan salah satu dari ketiga buah tersebut dengan jelas, dari jarak dekat, dan memiliki pencahayaan yang cukup.",
      icon: "💡"
    };
  }

  const isFresh = condition.toLowerCase() === 'fresh';
  
  const recommendations = {
    "Apple": {
      fresh: {
        title: "Rekomendasi Penanganan Apel Segar",
        text: "Apel segar sebaiknya disimpan di laci sayur/buah dalam kulkas (suhu 0-4°C) dengan kelembapan sedang. Simpan apel dalam kantong plastik berlubang agar tetap renyah hingga 4-6 minggu. Jauhkan apel dari sayuran hijau karena apel melepaskan gas etilen yang mempercepat pembusukan sayuran.",
        icon: "🍎"
      },
      rotten: {
        title: "Rekomendasi Penanganan Apel Busuk",
        text: "Segera pisahkan apel busuk ini dari buah-buahan lainnya! Apel yang membusuk mengeluarkan gas etilen konsentrasi tinggi serta spora jamur yang akan menular dan merusak buah sehat di dekatnya dalam sekejap. Bagian yang sehat tidak disarankan dikonsumsi jika pembusukan sudah menyebar luas.",
        icon: "⚠️"
      }
    },
    "Banana": {
      fresh: {
        title: "Rekomendasi Penanganan Pisang Segar",
        text: "Simpan pisang pada suhu ruangan. Gantung pisang menggunakan gantungan khusus buah agar bagian bawahnya tidak mudah memar akibat tekanan. Bungkus bagian pangkal batang pisang (stem) menggunakan plastic wrap untuk menghambat pelepasan gas etilen alami, membuat pisang awet 3-5 hari lebih lama.",
        icon: "🍌"
      },
      rotten: {
        title: "Rekomendasi Penanganan Pisang Busuk / Sangat Matang",
        text: "Jika kulit pisang menghitam dan bertekstur lembek namun belum berjamur atau berbau fermentasi asam, buah ini masih aman dikonsumsi. Pisang yang terlampau matang memiliki kadar gula tinggi dan tekstur lembut, menjadikannya bahan sempurna untuk membuat roti pisang (banana bread), smoothie, atau pisang goreng.",
        icon: "🍌"
      }
    },
    "Strawberry": {
      fresh: {
        title: "Rekomendasi Penanganan Stroberi Segar",
        text: "Jangan mencuci buah stroberi sebelum disimpan, karena kelembapan air memicu pertumbuhan jamur dalam hitungan jam. Simpan di kulkas dalam wadah dangkal yang dilapisi tisu dapur kering agar menyerap embun, dan biarkan wadah sedikit terbuka. Cuci stroberi hanya sesaat sebelum dikonsumsi.",
        icon: "🍓"
      },
      rotten: {
        title: "Rekomendasi Penanganan Stroberi Busuk",
        text: "Buang stroberi yang berjamur (berbulu putih/abu-abu) atau berair secepat mungkin. Spora jamur stroberi sangat halus dan menyebar super cepat lewat kontak fisik dan udara. Periksa buah stroberi lainnya yang berada dalam satu wadah dan keringkan wadah sebelum disimpan kembali.",
        icon: "🚨"
      }
    }
  };

  const defaultTips = {
    fresh: {
      title: "Rekomendasi Penyimpanan Buah",
      text: "Buah segar terdeteksi! Bersihkan kotoran yang menempel, keringkan dengan baik, lalu simpan di tempat sejuk dan kering atau masukkan ke lemari es dalam wadah khusus untuk mempertahankan kesegaran nutrisinya.",
      icon: "💡"
    },
    rotten: {
      title: "Peringatan Buah Busuk",
      text: "Buah terdeteksi mengalami penurunan kualitas/pembusukan. Segera pisahkan agar tidak mencemari buah lain. Cuci wadah penyimpanan secara menyeluruh menggunakan sabun untuk mematikan sisa bakteri atau spora jamur.",
      icon: "⚠️"
    }
  };

  const fruitKey = recommendations[fruit] ? fruit : Object.keys(recommendations).find(k => fruit.toLowerCase().includes(k.toLowerCase()));
  
  if (fruitKey) {
    return isFresh ? recommendations[fruitKey].fresh : recommendations[fruitKey].rotten;
  }
  return isFresh ? defaultTips.fresh : defaultTips.rotten;
}

// ── Render Result Details ──────────────────────────────────────────────────
function renderResult(data) {
  // Update texts
  resultEmoji.textContent = data.emoji;
  resultLabel.textContent = data.label;

  const isUnrecognized = data.condition.toLowerCase() === 'unknown';
  const isFresh = data.condition.toLowerCase() === 'fresh';

  if (isUnrecognized) {
    resultBadge.textContent = 'Tidak Dikenali';
    resultBadge.className = 'result-badge unrecognized';
  } else {
    resultBadge.textContent  = isFresh ? '✅ Segar' : '❌ Tidak Segar';
    resultBadge.className    = 'result-badge ' + (isFresh ? 'fresh' : 'rotten');
  }

  confValue.textContent = data.confidence + '%';

  // Animate confidence bar after layout update
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      confBar.style.width = data.confidence + '%';
    });
  });

  // Render recommendations tips box
  const tip = getRecommendations(data.fruit, data.condition);
  tipsTitle.textContent = tip.title;
  tipsText.textContent = tip.text;
  tipsIcon.textContent = tip.icon;
  
  // Set tips box styling class
  if (isUnrecognized) {
    tipsBox.className = 'tips-box unrecognized-tips';
  } else {
    tipsBox.className = 'tips-box ' + (isFresh ? 'fresh-tips' : 'rotten-tips');
  }

  // Render class probabilities distributions
  probsList.innerHTML = '';
  data.all_probs.forEach((item, idx) => {
    const isTop = idx === 0 && !isUnrecognized;
    const row = document.createElement('div');
    row.className = 'prob-row';
    row.innerHTML = `
      <span class="prob-name">${item.label}</span>
      <div class="prob-bar-bg">
        <div class="prob-bar-fill ${isTop ? 'top' : ''}" data-pct="${item.prob}" style="width:0%"></div>
      </div>
      <span class="prob-pct ${isTop ? 'top-pct' : ''}">${item.prob}%</span>
    `;
    probsList.appendChild(row);
  });

  // Toggle Display Cards
  if (instructionCard) instructionCard.style.display = 'none';
  resultCard.style.display = 'block';

  // Trigger probability bar fills transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.prob-bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.pct + '%';
      });
    });
  });

  // Smooth scroll down to result card (especially on small viewports)
  setTimeout(() => resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}

// ── Canvas Thumbnail Generator for History ──────────────────────────────────
function generateHistoryThumbnail() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 60;
    canvas.height = 60;
    
    // Draw cropped center square of preview image onto the canvas
    const imgWidth = previewImg.naturalWidth || previewImg.width;
    const imgHeight = previewImg.naturalHeight || previewImg.height;
    
    const size = Math.min(imgWidth, imgHeight);
    const sx = (imgWidth - size) / 2;
    const sy = (imgHeight - size) / 2;
    
    ctx.drawImage(previewImg, sx, sy, size, size, 0, 0, 60, 60);
    return canvas.toDataURL('image/jpeg', 0.6); // 60% quality jpeg to save local storage bytes
  } catch (e) {
    console.warn("Could not generate history thumbnail: ", e);
    return null;
  }
}

// ── Save History Logic ─────────────────────────────────────────────────────
function saveToHistory(data) {
  try {
    let history = JSON.parse(localStorage.getItem('debuku_history')) || [];
    
    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    const thumbnail = generateHistoryThumbnail();

    const newScan = {
      id: Date.now(),
      timestamp: formattedDate,
      label: data.label,
      fruit: data.fruit,
      condition: data.condition,
      confidence: data.confidence,
      emoji: data.emoji,
      all_probs: data.all_probs,
      thumbnail: thumbnail
    };

    // Keep only the latest 5 scans
    history.unshift(newScan);
    if (history.length > 5) {
      history = history.slice(0, 5);
    }

    localStorage.setItem('debuku_history', JSON.stringify(history));
    renderHistory();
  } catch (err) {
    console.error("Failed to save history: ", err);
  }
}

// ── Render History List ────────────────────────────────────────────────────
function renderHistory() {
  const history = JSON.parse(localStorage.getItem('debuku_history')) || [];
  
  if (history.length === 0) {
    historyEmpty.style.display = 'block';
    historyList.style.display = 'none';
    btnClearHistory.style.display = 'none';
    return;
  }

  historyEmpty.style.display = 'none';
  historyList.style.display = 'flex';
  btnClearHistory.style.display = 'block';

  historyList.innerHTML = '';
  history.forEach(item => {
    const isUnrecognized = item.condition.toLowerCase() === 'unknown';
    const isFresh = item.condition.toLowerCase() === 'fresh';
    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';
    itemEl.setAttribute('data-id', item.id);
    
    // Thumbnail fallback to emoji if canvas draw failed or not stored
    const imgSource = item.thumbnail || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="100%" height="100%" fill="%231a2235"/><text x="50%" y="60%" font-size="30" text-anchor="middle">${item.emoji}</text></svg>`;

    let badgeText, badgeClass;
    if (isUnrecognized) {
      badgeText = 'Tidak Dikenali';
      badgeClass = 'unrecognized';
    } else {
      badgeText = isFresh ? 'Segar' : 'Busuk';
      badgeClass = isFresh ? 'fresh' : 'rotten';
    }

    itemEl.innerHTML = `
      <div class="history-item-left">
        <img src="${imgSource}" class="history-img-thumb" alt="thumb" />
        <div class="history-item-info">
          <span class="history-item-name">${item.emoji} ${item.label}</span>
          <span class="history-item-date">${item.timestamp}</span>
        </div>
      </div>
      <div class="history-item-right">
        <span class="history-item-badge ${badgeClass}">${badgeText}</span>
        <button class="btn-delete-history-item" title="Hapus riwayat ini" data-id="${item.id}">✕</button>
      </div>
    `;

    // Click handler to load this history item back into result view
    itemEl.addEventListener('click', (e) => {
      // Don't trigger if they clicked the delete button
      if (e.target.closest('.btn-delete-history-item')) return;
      restoreHistoryResult(item);
    });

    historyList.appendChild(itemEl);
  });

  // Attach event listener to delete buttons
  document.querySelectorAll('.btn-delete-history-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Stop click bubbling up to itemEl click handler
      const id = parseInt(e.target.getAttribute('data-id'));
      deleteHistoryItem(id);
    });
  });
}

// ── Restore Past History Result ─────────────────────────────────────────────
function restoreHistoryResult(item) {
  // If thumbnail exists, restore it to preview img so they see what image was scanned
  if (item.thumbnail) {
    previewImg.src = item.thumbnail;
    dropZone.style.display    = 'none';
    previewWrap.style.display = 'block';
    btnPredict.disabled       = false;
  } else {
    // If no thumbnail, reset the upload preview
    resetUpload();
  }

  // Populate results
  renderResult(item);
}

// ── Delete Specific History Item ───────────────────────────────────────────
function deleteHistoryItem(id) {
  let history = JSON.parse(localStorage.getItem('debuku_history')) || [];
  history = history.filter(item => item.id !== id);
  localStorage.setItem('debuku_history', JSON.stringify(history));
  renderHistory();
}

// ── Clear All History ──────────────────────────────────────────────────────
btnClearHistory.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin menghapus semua riwayat pemindaian?')) {
    localStorage.removeItem('debuku_history');
    renderHistory();
  }
});
