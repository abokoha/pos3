const imageInput = document.getElementById('image');
const preview = document.getElementById('preview');
const msg = document.getElementById('msg');

const janInput = document.getElementById('jan');
const scanBtn = document.getElementById('scanBtn');
const submitBtn = document.getElementById('submitBtn');

const scannerModal = document.getElementById('scannerModal');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const videoEl = document.getElementById('video');

let codeReader = null;
let scanning = false;

// ✅ 画像プレビュー（既存）
imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) {
    preview.style.display = 'none';
    preview.removeAttribute('src');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

// ✅ カメラでJANスキャン
scanBtn.addEventListener('click', async () => {
  // ZXingが読み込めてない場合（CDN失敗など）
  if (!window.ZXing) {
    showMessage('ZXing の読み込みに失敗しました。\nネット接続を確認してもう一度ためしてね。');
    return;
  }

  openScannerModal();
  try {
    await startScanner();
  } catch (e) {
    showMessage('カメラを起動できませんでした。\n(設定でカメラ許可が必要です)\n' + String(e));
    closeScannerModal();
  }
});

closeScannerBtn.addEventListener('click', () => {
  stopScanner();
  closeScannerModal();
});

// モーダル外タップで閉じる（任意）
scannerModal.addEventListener('click', (e) => {
  if (e.target === scannerModal) {
    stopScanner();
    closeScannerModal();
  }
});

submitBtn.addEventListener('click', async () => {
  try {
    const jan = janInput.value.trim();
    const name = document.getElementById('name').value.trim();
    const price = Number(document.getElementById('price').value);

    if (!jan) return showMessage("JANを入れてね");
    if (!name) return showMessage("商品名を入れてね");
    if (Number.isNaN(price)) return showMessage("単価が数字になってないよ");

    // 画像（任意）
    let dataUrl = "";
    let originalFileName = "";

    const file = imageInput.files && imageInput.files[0];
    if (file) {
      originalFileName = file.name || "";
      showMessage("画像を圧縮中...");
      dataUrl = await fileToDataUrlCompressed(file, 900, 0.82); // GASサイズ対策
    }

    showMessage("登録中...");

    // ✅ GAS側の期待キーに合わせる（dataUrl / originalFileName）
    const payload = { jan, name, price, dataUrl, originalFileName };

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    // ステータスがNGなら本文を表示（JSONじゃないことがある）
    if (!res.ok) {
      showMessage(`HTTP ${res.status}
${text.slice(0, 800)}`);
      return;
    }

    // JSONとして読めるかチェック
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      showMessage("JSONとして読めませんでした。
----
" + text.slice(0, 800));
      return;
    }

    if (!json.ok) {
      showMessage("登録失敗: " + (json.message || "不明なエラー"));
      return;
    }

    showMessage(
      (json.action === "updated" ? "更新OK！
" : "登録OK！
") +
      "JAN: " + jan + "
" +
      (json.fileName ? "画像ファイル名: " + json.fileName + "
" : "画像: なし
") +
      (json.driveLink ? "driveLink: " + json.driveLink + "
" : "") +
      (json.imageUrl ? "imageUrl: " + json.imageUrl : "")
    );

  } catch (e) {
    showMessage("登録エラー: " + String(e));
  }
});

async function fileToDataUrlCompressed(file, maxWidth = 900, quality = 0.82) {
  const img = await loadImage_(file);
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // JPEGにして軽量化（元がPNGでもOK）
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage_(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function showMessage(text) {
  msg.textContent = text;
  msg.style.display = 'block';
}

function openScannerModal() {
  scannerModal.classList.remove('hidden');
  scannerModal.setAttribute('aria-hidden', 'false');
}

function closeScannerModal() {
  scannerModal.classList.add('hidden');
  scannerModal.setAttribute('aria-hidden', 'true');
}

/**
 * ✅ back camera 優先で起動し、バーコードが読めたら janInput に入れて停止
 */
async function startScanner() {
  if (scanning) return;
  scanning = true;

  if (!codeReader) {
    codeReader = new ZXing.BrowserMultiFormatReader();
  }

  try {
    // 🔥 デバイス列挙せずに直接起動（iOS対策）
    await codeReader.decodeFromVideoDevice(
      null,
      videoEl,
      (result, err) => {
        if (!scanning) return;

        if (result) {
          const text = result.getText ? result.getText() : result.text;
          janInput.value = text;

          showMessage('よみとりOK！\nJAN: ' + text);
          stopScanner();
          closeScannerModal();
        }
      }
    );
  } catch (e) {
    scanning = false;
    throw e;
  }
}

function stopScanner() {
  scanning = false;
  if (codeReader) {
    try { codeReader.reset(); } catch (_) {}
  }
}

// 「back / rear / environment」っぽいラベルのカメラを優先
function pickBackCamera(devices) {
  if (!devices || devices.length === 0) return null;

  const keywords = ['back', 'rear', 'environment', '背面'];
  const found = devices.find(d => {
    const label = (d.label || '').toLowerCase();
    return keywords.some(k => label.includes(k));
  });

  return found || devices[0];
}