#!/usr/bin/env python3
"""
Move breadcrumbs inside <main> on all pages.
- Skip index.html (homepage)
- Standardize breadcrumb class
- Add breadcrumbs where missing
"""

import os
import re
import sys

SKIP_DIRS = ['node_modules', '.cache', 'attached_assets', 'MASTER-EXPORT', 'functions']
SKIP_FILES = ['index.html']  # Homepage only

BREADCRUMB_SCRIPT = '<script src="/js/breadcrumbs.js" defer></script>'

def get_html_files():
    """Get all HTML files to process."""
    files = []
    for root, dirs, filenames in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in filenames:
            if f.endswith('.html'):
                path = os.path.join(root, f)
                # Skip root index.html only
                if path == './index.html':
                    continue
                files.append(path)
    return sorted(files)

def fix_breadcrumbs(filepath):
    """Fix breadcrumbs in a single file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Pattern 1: Breadcrumbs outside main (before <main)
    # Match: <div id="breadcrumbs"...></div> followed by <main
    pattern_outside = r'(<div id="breadcrumbs"[^>]*></div>\s*)\n(\s*<main[^>]*>)'
    
    # Check if breadcrumbs are already inside main
    pattern_inside = r'<main[^>]*>\s*<div id="breadcrumbs"'
    
    if re.search(pattern_inside, content):
        # Already inside main, just ensure class is correct
        content = re.sub(
            r'<div id="breadcrumbs"[^>]*>',
            '<div id="breadcrumbs" class="breadcrumb-container">',
            content
        )
    elif re.search(pattern_outside, content):
        # Breadcrumbs outside - move inside main
        def move_inside(m):
            main_tag = m.group(2)
            return f'{main_tag}\n      <div id="breadcrumbs" class="breadcrumb-container"></div>\n'
        content = re.sub(pattern_outside, move_inside, content)
    elif '<main' in content and 'id="breadcrumbs"' not in content:
        # No breadcrumbs at all - add them inside main
        def add_breadcrumbs(m):
            return f'{m.group(0)}\n      <div id="breadcrumbs" class="breadcrumb-container"></div>'
        content = re.sub(r'<main[^>]*>', add_breadcrumbs, content)
    
    # Ensure breadcrumbs.js script is included
    if 'id="breadcrumbs"' in content and 'breadcrumbs.js' not in content:
        # Add script before </body>
        content = content.replace('</body>', f'  {BREADCRUMB_SCRIPT}\n</body>')
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    files = get_html_files()
    print(f"Found {len(files)} HTML files to process")
    
    modified = 0
    for f in files:
        if fix_breadcrumbs(f):
            print(f"  Modified: {f}")
            modified += 1
    
    print(f"\nDone. Modified {modified} files.")

if __name__ == '__main__':
    main()
