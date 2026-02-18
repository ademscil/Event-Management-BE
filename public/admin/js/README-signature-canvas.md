# Signature Canvas Component

Komponen JavaScript untuk menangkap tanda tangan digital dengan dukungan mouse dan touch input.

## Fitur

- ✅ Dukungan mouse dan touch input
- ✅ Canvas responsif
- ✅ Ekspor ke base64 image URL
- ✅ Load signature dari base64
- ✅ Validasi (required/optional)
- ✅ Clear signature
- ✅ Kustomisasi warna dan ukuran stroke
- ✅ Deteksi canvas kosong

## Instalasi

```html
<script src="assets/js/signature-canvas.js"></script>
```

## Penggunaan Dasar

### HTML

```html
<canvas id="signatureCanvas" width="600" height="200"></canvas>
<button onclick="clearSignature()">Hapus</button>
<button onclick="saveSignature()">Simpan</button>
```

### JavaScript

```javascript
// Inisialisasi signature canvas
const canvas = document.getElementById('signatureCanvas');
const signatureCanvas = new SignatureCanvas(canvas, {
    strokeColor: '#000000',
    strokeWidth: 2,
    backgroundColor: '#ffffff'
});

// Hapus tanda tangan
function clearSignature() {
    signatureCanvas.clear();
}

// Simpan tanda tangan
function saveSignature() {
    if (signatureCanvas.isCanvasEmpty()) {
        alert('Silakan gambar tanda tangan terlebih dahulu');
        return;
    }
    
    const signatureData = signatureCanvas.getSignatureData();
    console.log('Signature data:', signatureData);
    
    // Kirim ke server atau simpan di localStorage
    // localStorage.setItem('signature', signatureData);
}
```

## API Reference

### Constructor

```javascript
new SignatureCanvas(canvas, options)
```

**Parameters:**
- `canvas` (HTMLCanvasElement) - Canvas element
- `options` (Object) - Konfigurasi opsional
  - `strokeColor` (string) - Warna stroke (default: '#000000')
  - `strokeWidth` (number) - Lebar stroke (default: 2)
  - `backgroundColor` (string) - Warna background (default: '#ffffff')

### Methods

#### `clear()`
Menghapus semua konten canvas.

```javascript
signatureCanvas.clear();
```

#### `isCanvasEmpty()`
Mengecek apakah canvas kosong (tidak ada tanda tangan).

```javascript
if (signatureCanvas.isCanvasEmpty()) {
    console.log('Canvas kosong');
}
```

#### `getSignatureData(format, quality)`
Mendapatkan data tanda tangan sebagai base64 image URL.

**Parameters:**
- `format` (string) - Format gambar: 'image/png' atau 'image/jpeg' (default: 'image/png')
- `quality` (number) - Kualitas gambar untuk JPEG (0-1, default: 0.92)

**Returns:** string - Base64 image data URL

```javascript
const signatureData = signatureCanvas.getSignatureData();
// atau dengan format JPEG
const jpegData = signatureCanvas.getSignatureData('image/jpeg', 0.8);
```

#### `loadSignatureData(dataUrl)`
Memuat tanda tangan dari base64 image URL.

**Parameters:**
- `dataUrl` (string) - Base64 image data URL

**Returns:** Promise<void>

```javascript
const savedSignature = localStorage.getItem('signature');
signatureCanvas.loadSignatureData(savedSignature)
    .then(() => {
        console.log('Signature loaded');
    })
    .catch((error) => {
        console.error('Failed to load signature:', error);
    });
```

#### `validate(isRequired)`
Memvalidasi tanda tangan.

**Parameters:**
- `isRequired` (boolean) - Apakah tanda tangan wajib diisi

**Returns:** Object - `{ isValid: boolean, message: string }`

```javascript
const validation = signatureCanvas.validate(true);
if (!validation.isValid) {
    alert(validation.message);
}
```

#### `resize(width, height, preserveContent)`
Mengubah ukuran canvas.

**Parameters:**
- `width` (number) - Lebar baru
- `height` (number) - Tinggi baru
- `preserveContent` (boolean) - Pertahankan konten yang ada (default: false)

```javascript
signatureCanvas.resize(800, 300, true);
```

#### `destroy()`
Menghapus event listeners dan membersihkan canvas.

```javascript
signatureCanvas.destroy();
```

## Contoh Penggunaan

### Survey Form dengan Signature

```html
<div class="signature-field">
    <label class="required">Tanda Tangan</label>
    <canvas id="signatureCanvas" width="600" height="200"></canvas>
    <button type="button" onclick="clearSignature()">Hapus Tanda Tangan</button>
    <span class="error-message" id="signatureError"></span>
</div>

<button type="submit" onclick="submitForm()">Submit</button>

<script src="assets/js/signature-canvas.js"></script>
<script>
    let signatureCanvas;
    
    document.addEventListener('DOMContentLoaded', function() {
        const canvas = document.getElementById('signatureCanvas');
        signatureCanvas = new SignatureCanvas(canvas);
    });
    
    function clearSignature() {
        signatureCanvas.clear();
        document.getElementById('signatureError').textContent = '';
    }
    
    function submitForm() {
        // Validasi signature
        const validation = signatureCanvas.validate(true);
        
        if (!validation.isValid) {
            document.getElementById('signatureError').textContent = validation.message;
            return false;
        }
        
        // Dapatkan signature data
        const signatureData = signatureCanvas.getSignatureData();
        
        // Kirim ke server
        const formData = {
            signature: signatureData,
            // ... field lainnya
        };
        
        fetch('/api/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            console.log('Response submitted:', data);
        })
        .catch(error => {
            console.error('Error:', error);
        });
        
        return false;
    }
</script>
```

### Survey Builder dengan Signature Preview

```javascript
// Menambahkan signature question ke survey builder
function addSignatureQuestion() {
    const question = {
        type: 'Signature',
        promptText: 'Silakan tanda tangan di bawah ini',
        subtitle: 'Tanda tangan digital Anda',
        isMandatory: true,
        pageNumber: 1
    };
    
    // Render signature canvas di preview
    const previewHtml = `
        <div class="question-preview">
            <label>${question.promptText}</label>
            ${question.subtitle ? `<p class="subtitle">${question.subtitle}</p>` : ''}
            <canvas class="signature-preview" width="600" height="200"></canvas>
            <button type="button" class="btn-clear">Hapus</button>
        </div>
    `;
    
    // Initialize canvas setelah render
    const canvas = document.querySelector('.signature-preview');
    const signatureCanvas = new SignatureCanvas(canvas);
}
```

## Styling CSS

```css
.signature-field {
    margin: 20px 0;
}

.signature-field label {
    display: block;
    margin-bottom: 10px;
    font-weight: 600;
}

.signature-field label.required::after {
    content: ' *';
    color: #e74c3c;
}

canvas {
    border: 2px solid #ddd;
    border-radius: 4px;
    cursor: crosshair;
    touch-action: none;
    display: block;
}

.error-message {
    display: block;
    color: #e74c3c;
    font-size: 14px;
    margin-top: 5px;
}
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Catatan

- Canvas harus memiliki ukuran yang ditentukan (width dan height)
- Untuk responsive design, gunakan method `resize()`
- Signature data disimpan sebagai base64 PNG (default) atau JPEG
- Touch events menggunakan `passive: false` untuk mencegah scroll saat menggambar

## Demo

Lihat file `signature-canvas-demo.html` untuk demo lengkap.

## Lisensi

MIT License - CSI Portal © 2026 PT Astra Otoparts Tbk
