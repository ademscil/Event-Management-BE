/**
 * Signature Canvas Component
 * Provides signature drawing functionality with touch and mouse support
 * 
 * Usage:
 * const signatureCanvas = new SignatureCanvas(canvasElement, options);
 * signatureCanvas.clear();
 * const signatureData = signatureCanvas.getSignatureData(); // Returns base64 image URL
 * signatureCanvas.isEmpty(); // Check if canvas is empty
 */

class SignatureCanvas {
  /**
   * Create a signature canvas
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Object} options - Configuration options
   * @param {string} [options.strokeColor='#000000'] - Stroke color
   * @param {number} [options.strokeWidth=2] - Stroke width
   * @param {string} [options.backgroundColor='#ffffff'] - Background color
   */
  constructor(canvas, options = {}) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Valid canvas element is required');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.isEmpty = true;

    // Configuration
    this.strokeColor = options.strokeColor || '#000000';
    this.strokeWidth = options.strokeWidth || 2;
    this.backgroundColor = options.backgroundColor || '#ffffff';

    // Initialize canvas
    this.initializeCanvas();

    // Bind event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Initialize canvas with background color
   */
  initializeCanvas() {
    // Set canvas size if not already set
    if (!this.canvas.width || !this.canvas.height) {
      this.canvas.width = this.canvas.offsetWidth || 400;
      this.canvas.height = this.canvas.offsetHeight || 200;
    }

    // Fill background
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Set drawing style
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  /**
   * Attach mouse and touch event listeners
   */
  attachEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);

    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd);
  }

  /**
   * Remove event listeners
   */
  detachEventListeners() {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
  }

  /**
   * Get coordinates relative to canvas
   * @param {MouseEvent|Touch} event - Mouse or touch event
   * @returns {Object} Coordinates {x, y}
   */
  getCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  /**
   * Start drawing
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  startDrawing(x, y) {
    this.isDrawing = true;
    this.lastX = x;
    this.lastY = y;
    this.isEmpty = false;

    // Begin path
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  /**
   * Draw line
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  draw(x, y) {
    if (!this.isDrawing) return;

    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Stop drawing
   */
  stopDrawing() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.ctx.closePath();
  }

  /**
   * Handle mouse down event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseDown(e) {
    e.preventDefault();
    const coords = this.getCoordinates(e);
    this.startDrawing(coords.x, coords.y);
  }

  /**
   * Handle mouse move event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseMove(e) {
    e.preventDefault();
    if (!this.isDrawing) return;
    const coords = this.getCoordinates(e);
    this.draw(coords.x, coords.y);
  }

  /**
   * Handle mouse up event
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseUp(e) {
    e.preventDefault();
    this.stopDrawing();
  }

  /**
   * Handle touch start event
   * @param {TouchEvent} e - Touch event
   */
  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const coords = this.getCoordinates(touch);
    this.startDrawing(coords.x, coords.y);
  }

  /**
   * Handle touch move event
   * @param {TouchEvent} e - Touch event
   */
  handleTouchMove(e) {
    e.preventDefault();
    if (!this.isDrawing) return;
    const touch = e.touches[0];
    const coords = this.getCoordinates(touch);
    this.draw(coords.x, coords.y);
  }

  /**
   * Handle touch end event
   * @param {TouchEvent} e - Touch event
   */
  handleTouchEnd(e) {
    e.preventDefault();
    this.stopDrawing();
  }

  /**
   * Clear the canvas
   */
  clear() {
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.isEmpty = true;
  }

  /**
   * Check if canvas is empty (no signature drawn)
   * @returns {boolean} True if canvas is empty
   */
  isCanvasEmpty() {
    return this.isEmpty;
  }

  /**
   * Get signature data as base64 image URL
   * @param {string} [format='image/png'] - Image format (image/png, image/jpeg)
   * @param {number} [quality=0.92] - Image quality (0-1) for JPEG
   * @returns {string} Base64 image data URL
   */
  getSignatureData(format = 'image/png', quality = 0.92) {
    return this.canvas.toDataURL(format, quality);
  }

  /**
   * Load signature data from base64 image URL
   * @param {string} dataUrl - Base64 image data URL
   * @returns {Promise<void>}
   */
  loadSignatureData(dataUrl) {
    return new Promise((resolve, reject) => {
      if (!dataUrl) {
        reject(new Error('Data URL is required'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.clear();
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        this.isEmpty = false;
        resolve();
      };
      img.onerror = () => {
        reject(new Error('Failed to load signature image'));
      };
      img.src = dataUrl;
    });
  }

  /**
   * Resize canvas (useful for responsive layouts)
   * @param {number} width - New width
   * @param {number} height - New height
   * @param {boolean} [preserveContent=false] - Preserve existing content
   */
  resize(width, height, preserveContent = false) {
    if (preserveContent) {
      // Save current content
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      // Resize canvas
      this.canvas.width = width;
      this.canvas.height = height;
      
      // Restore content
      this.initializeCanvas();
      this.ctx.putImageData(imageData, 0, 0);
    } else {
      // Simply resize and clear
      this.canvas.width = width;
      this.canvas.height = height;
      this.initializeCanvas();
      this.isEmpty = true;
    }
  }

  /**
   * Destroy the signature canvas and remove event listeners
   */
  destroy() {
    this.detachEventListeners();
    this.clear();
  }

  /**
   * Validate signature (check if not empty when required)
   * @param {boolean} isRequired - Whether signature is required
   * @returns {Object} Validation result {isValid, message}
   */
  validate(isRequired = false) {
    if (isRequired && this.isEmpty) {
      return {
        isValid: false,
        message: 'Signature is required'
      };
    }

    return {
      isValid: true,
      message: ''
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignatureCanvas;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.SignatureCanvas = SignatureCanvas;
}
