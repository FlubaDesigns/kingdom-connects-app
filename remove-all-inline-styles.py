#!/usr/bin/env python3
"""
Comprehensive inline style removal - removes ALL inline styles from HTML files.
"""

import re
from pathlib import Path

# Comprehensive style-to-class mappings
REPLACEMENTS = [
    # Screen reader (29 instances)
    (r'style="position: absolute; left: -9999px;"', 'class="sr-only"'),
    
    # Opacity + line-height combinations
    (r'style="opacity: 0\.9; line-height: 1\.6;"', 'class="opacity-90 line-height-normal"'),
    (r'style="line-height: 1\.8;"', 'class="line-height-relaxed"'),
    
    # Gold section titles
    (r'style="font-size: 1\.15rem; font-weight: 700; color: var\(--gold\); margin-bottom: 0\.75rem;"', 'class="text-gold text-lg mt-md"'),
    
    # Card highlights
    (r'style="background: rgba\(255,255,255,0\.05\); border: 1px solid rgba\(255,255,255,0\.1\); border-radius: 8px; padding: 1\.5rem; margin-bottom: 1rem;"', 'class="card-highlight"'),
    
    # Icon circles
    (r'style="width: 60px; height: 60px; background: var\(--gold\); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1\.8rem; font-weight: 800; color: var\(--dark-blue\);"', 'class="icon-circle-gold"'),
    
    # Form control max-width
    (r'style="max-width: 200px;"', 'class="max-w-xs"'),
    (r'style="max-width: 250px;"', 'class="max-w-xs"'),
    (r'style="max-width: 480px;"', 'class="max-w-sm"'),
    (r'style="max-width: 800px; margin: 2rem auto; background: var\(--card-bg\); border-radius: 8px; padding: 2rem; position: relative;"', 'class="max-w-lg mx-auto-content-lg card"'),
    
    # Text sizes and margins
    (r'style="margin: 0; font-size: 1\.1rem;"', 'class="m-0 text-lg"'),
    (r'style="margin: 0; color: var\(--text-muted\); font-size: 0\.875rem;"', 'class="m-0 text-muted text-sm"'),
    (r'style="font-size: 0\.875rem;"', 'class="text-sm"'),
    (r'style="font-size: 2\.5rem; font-weight: 800;"', 'class="text-3xl"'),
    (r'style="font-style: italic; line-height: 1\.6; margin-bottom: 12px;"', 'class="text-content-italic mb-sm"'),
    
    # Flex layouts
    (r'style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid var\(--border-color\);"', 'class="flex-between-center mt-md pt-md border-top"'),
    (r'style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;"', 'class="flex gap-md mb-md"'),
    (r'style="display: flex; align-items: center; gap: 0\.5rem;"', 'class="flex gap-sm"'),
    (r'style="display: flex; justify-content: space-between; margin-bottom: 0\.5rem;"', 'class="flex-between-center mb-sm"'),
    (r'style="flex-wrap: wrap;"', 'class="flex-wrap"'),
    
    # Colors
    (r'style="color: #ff6b6b;"', 'class="text-error"'),
    (r'style="color: #aaa;"', 'class="text-muted"'),
    (r'style="color: #ff9800;"', 'class="text-orange"'),
    (r'style="color: #4caf50;"', 'class="text-gold"'),
    (r'style="color:#ef4444;"', 'class="text-red"'),
    
    # Empty states
    (r'style="text-align: center; padding: 2rem; color: #aaa;"', 'class="empty-state-table"'),
    (r'style="text-align: center; color: #aaa; padding: 2rem;"', 'class="empty-state-table"'),
    (r'style="text-align: center; padding: 3rem 1rem;"', 'class="text-center p-xl"'),
    
    # Overflow
    (r'style="overflow-x: auto;"', 'class="overflow-x-auto"'),
    
    # Spacing
    (r'style="margin-top: 1\.5rem;"', 'class="mt-lg"'),
    (r'style="padding: 0\.5rem 0; display: block;"', 'class="p-sm block"'),
    
    # Progress bars
    (r'style="background: rgba\(255,255,255,0\.1\); height: 20px; border-radius: 10px; overflow: hidden;"', 'class="progress-bar-container"'),
    
    # Widths
    (r'style="width: 60%;"', 'class="w-60"'),
    (r'style="width: 40%;"', 'class="w-40"'),
    (r'style="width: 20%;"', 'class="w-20"'),
    (r'style="width: 100%;"', 'class="w-full"'),
    
    # Display
    (r' style="display: none;"', ' class="hidden"'),
    
    # Complex modals
    (r'style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba\(0,0,0,0\.8\); z-index: 1000; overflow-y: auto;"', 'class="modal hidden"'),
    (r'style="position: absolute; top: 1rem; right: 1rem; background: #f44336; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 1\.5rem; font-weight: bold;"', 'class="modal-close-btn"'),
]

def remove_inline_styles(filepath):
    """Remove all inline styles from a file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        changes = 0
        
        # Apply all replacements
        for pattern, replacement in REPLACEMENTS:
            content, count = re.subn(pattern, replacement, content)
            changes += count
        
        # Handle JavaScript template literals - replace style="" with class=""
        # Pattern for JS template literal style attributes
        js_patterns = [
            # Button backgrounds
            (r"style=\"background: #d32f2f;\"", 'class="btn-danger"'),
            (r"style=\"background: #50c878;\"", 'class="btn-success"'),
            (r"style=\"background: #f4a261;\"", 'class="btn-warning"'),
            (r"style='background: #d32f2f;'", "class='btn-danger'"),
            (r"style='background: #50c878;'", "class='btn-success'"),
            (r"style='background: #f4a261;'", "class='btn-warning'"),
            
            # Empty messages in template literals
            (r"<td colspan=\"\d+\" style=\"text-align: center; padding: 2rem; color: #aaa;\">", '<td colspan="\\g<1>" class="empty-state-table">'),
            (r'<p style="text-align: center; color: #aaa; padding: 2rem;">', '<p class="empty-state-table">'),
            (r'<p style="color: #f4a261;">', '<p class="text-orange">'),
            (r'<p style="color: #aaa; margin-top: 1rem;">', '<p class="text-muted mt-md">'),
            (r'<p style="color: #aaa;">', '<p class="text-muted">'),
            
            # Generic error messages
            (r'<p style="color: #ff6b6b;">', '<p class="text-error">'),
            
            # Divs with background highlights
            (r'<div style="background: rgba\(212, 175, 55, 0\.05\); padding: 1rem; border-radius: 4px; margin-top: 1rem;">', '<div class="card-highlight">'),
        ]
        
        for pattern, replacement in js_patterns:
            content, count = re.subn(pattern, replacement, content)
            changes += count
        
        # Save if changed
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return changes
        
        return 0
        
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return 0

def main():
    """Process all HTML files."""
    html_files = list(Path('.').rglob('*.html'))
    excluded = ['node_modules', 'attached_assets', '.git']
    html_files = [f for f in html_files if not any(ex in str(f) for ex in excluded)]
    
    total_changes = 0
    files_modified = 0
    
    for filepath in sorted(html_files):
        changes = remove_inline_styles(filepath)
        if changes > 0:
            files_modified += 1
            total_changes += changes
            print(f"✓ {filepath}: {changes} inline styles removed")
    
    print(f"\n{'='*60}")
    print(f"Summary: {total_changes} inline styles removed from {files_modified} files")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
