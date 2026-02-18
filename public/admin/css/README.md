# CSI Portal CSS Framework

## Overview

Complete CSS framework for the CSI Portal application, including admin panel and public survey pages.

## Files

### 1. admin.css (15KB)
Complete admin UI system with CSS custom properties.

**Features:**
- CSS Custom Properties for theming
- Layout system (sidebar, header, content)
- Component library (panels, tables, buttons, forms, badges, modals, tabs)
- Responsive design with mobile breakpoints
- Utility classes for common patterns

**Components:**
- Sidebar navigation
- Admin header
- Panel component
- Table component
- Button variants (primary, secondary, success, danger, warning, info)
- Badge variants
- Form controls
- Alert component
- Modal component
- Tab component

### 2. utilities.css (12KB)
Helper classes for rapid UI development.

**Features:**
- Display utilities (flex, grid, block, inline, none)
- Flexbox utilities (direction, justify, align)
- Grid utilities (columns, gap)
- Spacing utilities (margin, padding)
- Width/height utilities
- Text utilities (alignment, transform, weight, size, color)
- Background color utilities
- Border utilities
- Shadow utilities
- Position utilities
- Overflow utilities
- Cursor utilities
- Visibility utilities
- Opacity utilities
- Z-index utilities
- Responsive grid system (12-column)
- Responsive breakpoint utilities

### 3. survey.css (10KB)
Respondent-facing survey interface styles.

**Features:**
- Loading and error screens
- Success screen
- Survey container
- Progress bar
- Hero cover
- Form elements
- Question types (text, dropdown, checkbox, radio, matrix, rating, signature)
- Navigation buttons
- Modal for signature
- Responsive design for mobile

## Color Scheme

### Primary Colors
- Primary: #2563eb (Blue)
- Secondary: #64748b (Slate)
- Success: #10b981 (Green)
- Danger: #ef4444 (Red)
- Warning: #f59e0b (Amber)
- Info: #3b82f6 (Blue)

### Neutral Colors
- Gray scale from 50 to 900
- White and dark variants

## Typography

- Font Family: 'Figtree' (via Bunny Fonts CDN)
- Font Sizes: xs (0.75rem) to 3xl (1.875rem)
- Font Weights: light (300) to bold (700)

## Spacing System

- xs: 0.25rem (4px)
- sm: 0.5rem (8px)
- md: 1rem (16px)
- lg: 1.5rem (24px)
- xl: 2rem (32px)
- 2xl: 3rem (48px)

## Responsive Breakpoints

- Mobile: < 576px (base styles)
- Small: ≥ 576px (landscape phones)
- Medium: ≥ 768px (tablets)
- Large: ≥ 992px (desktops)
- Extra Large: ≥ 1200px (large desktops)

## Browser Support

- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Edge (latest 2 versions)
- Safari (latest 2 versions)

## Usage

### Admin Panel
```html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSI Portal - Admin</title>
    <link rel="stylesheet" href="css/admin.css">
    <link rel="stylesheet" href="css/utilities.css">
</head>
<body>
    <!-- Admin content -->
</body>
</html>
```

### Survey Pages
```html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSI Survey</title>
    <link rel="stylesheet" href="css/survey.css">
</head>
<body>
    <!-- Survey content -->
</body>
</html>
```

## Component Examples

### Button
```html
<button class="btn btn-primary">Primary Button</button>
<button class="btn btn-secondary">Secondary Button</button>
<button class="btn btn-success">Success Button</button>
<button class="btn btn-danger">Danger Button</button>
```

### Panel
```html
<div class="panel">
    <div class="panel-header">
        <h3>Panel Title</h3>
    </div>
    <div class="panel-body">
        Panel content goes here
    </div>
</div>
```

### Form
```html
<div class="form-group">
    <label for="input">Label <span class="required">*</span></label>
    <input type="text" id="input" class="form-control" required>
    <span class="form-text">Helper text</span>
</div>
```

### Badge
```html
<span class="badge badge-primary">Primary</span>
<span class="badge badge-success">Success</span>
<span class="badge badge-danger">Danger</span>
```

### Alert
```html
<div class="alert alert-success">Success message</div>
<div class="alert alert-error">Error message</div>
<div class="alert alert-warning">Warning message</div>
<div class="alert alert-info">Info message</div>
```

## Utility Class Examples

### Spacing
```html
<div class="mt-3 mb-4 p-3">Content with margin and padding</div>
```

### Flexbox
```html
<div class="d-flex justify-between align-center gap-3">
    <div>Item 1</div>
    <div>Item 2</div>
</div>
```

### Grid
```html
<div class="d-grid grid-cols-3 gap-3">
    <div>Column 1</div>
    <div>Column 2</div>
    <div>Column 3</div>
</div>
```

### Text
```html
<p class="text-center text-lg font-bold text-primary">Centered bold text</p>
```

## Customization

### CSS Custom Properties
Override CSS variables to customize the theme:

```css
:root {
    --primary-color: #your-color;
    --font-family: 'Your Font', sans-serif;
    --spacing-md: 1.5rem;
}
```

### Adding Custom Components
Follow the existing patterns and naming conventions:

```css
.your-component {
    /* Use CSS variables */
    background-color: var(--primary-color);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
}
```

## Performance

### File Sizes
- admin.css: ~15KB uncompressed
- utilities.css: ~12KB uncompressed
- survey.css: ~10KB uncompressed
- Total: ~37KB (~25KB minified)

### Optimization Tips
1. Minify CSS for production
2. Enable gzip compression
3. Use HTTP/2 for parallel loading
4. Consider critical CSS for above-the-fold content

## Accessibility

- WCAG AA compliant color contrast
- Visible focus indicators
- Keyboard navigation support
- Touch-friendly targets (min 44x44px on mobile)
- Semantic HTML structure

## Documentation

- `browser-compatibility-notes.md` - Cross-browser testing results
- `responsive-design-notes.md` - Responsive design testing and patterns

## Maintenance

### Adding New Components
1. Follow existing naming conventions
2. Use CSS custom properties for colors and spacing
3. Ensure responsive behavior
4. Test across browsers
5. Document usage

### Updating Colors
Update CSS custom properties in `:root` selector in admin.css or survey.css.

### Adding Utilities
Add new utility classes to utilities.css following the existing pattern.

## License

Part of the CSI Portal project for PT Astra Otoparts Tbk.
