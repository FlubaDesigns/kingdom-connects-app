#!/usr/bin/env python3
"""
Remove all inline styles from HTML files and replace with CSS utility classes.
"""

import re
import os
from pathlib import Path

# Mapping of inline styles to CSS classes
STYLE_MAPPINGS = [
    # Opacity
    (r'style="opacity:\s*0\.7;?"', 'class="opacity-70"'),
    (r'style="opacity:\s*0\.8;?"', 'class="opacity-80"'),
    (r'style="opacity:\s*0\.5;?"', 'class="opacity-50"'),
    (r'style="opacity:\s*0\.6;?"', 'class="opacity-60"'),
    (r'style="opacity:\s*0\.9;?"', 'class="opacity-90"'),
    
    # Display
    (r'style="display:\s*none;?"', 'class="hidden"'),
    (r'style="display:\s*block;?"', 'class="block"'),
    (r'style="display:\s*inline-block;?"', 'class="inline-block"'),
    
    # Line height
    (r'style="line-height:\s*1\.7;?"', 'class="line-height-relaxed"'),
    
    # White space
    (r'style="white-space:\s*pre-wrap;?"', 'class="text-preformatted"'),
    
    # Colors
    (r'style="color:\s*var\(--text-muted\);?"', 'class="text-muted"'),
    (r'style="color:\s*var\(--gold\);?"', 'class="text-gold"'),
    
    # Margins
    (r'style="margin:\s*1rem 0;?"', 'class="m-block"'),
    (r'style="margin:\s*1rem 0 2rem;?"', 'class="m-block-lg"'),
    (r'style="margin-bottom:\s*1rem;?"', 'class="mb-md"'),
    (r'style="margin-top:\s*1rem;?"', 'class="mt-md"'),
    
    # Text alignment
    (r'style="text-align:\s*center;?"', 'class="text-center"'),
    (r'style="justify-content:\s*center;?"', 'class="justify-center"'),
    
    # Font sizes (combined patterns)
    (r'style="font-size:\s*1\.15rem;\s*max-width:\s*700px;\s*margin:\s*1rem auto 2rem;?"', 
     'class="text-content-large text-content-center"'),
    (r'style="font-size:\s*1\.15rem;\s*line-height:\s*1\.7;\s*margin:\s*1rem 0 2rem;?"', 
     'class="text-content-large"'),
    (r'style="font-size:\s*1\.15rem;\s*margin:\s*1rem 0 2rem;?"', 
     'class="text-content-large"'),
    
    # Error card pattern
    (r'style="display:\s*none;\s*background:\s*rgba\(255,0,0,0\.1\);\s*border:\s*2px solid red;?"', 
     'class="error-card hidden"'),
    
    # Multiline complex patterns - need to handle multiple properties
    (r'style="[^"]*line-height:\s*1\.7[^"]*"', 'class="line-height-relaxed"'),
]

def remove_inline_styles_from_file(filepath):
    """Remove inline styles from a single HTML file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        changes_made = 0
        
        # Apply style mappings
        for pattern, replacement in STYLE_MAPPINGS:
            if re.search(pattern, content):
                content, count = re.subn(pattern, replacement, content)
                changes_made += count
        
        # Handle complex multi-property inline styles one by one
        # Pattern: <element style="prop: value;">
        complex_patterns = [
            # church.html patterns
            (r'<p id="churchDescription" style="line-height: 1\.7; margin: 1rem 0;">',
             '<p id="churchDescription" class="line-height-relaxed m-block">'),
            (r'<ul id="serviceTimes" style="line-height: 1\.7;">',
             '<ul id="serviceTimes" class="line-height-relaxed">'),
            (r'<h3 id="messageTitle" style="color: var\(--gold\); margin: 1rem 0 0\.5rem 0;">',
             '<h3 id="messageTitle" class="text-gold mt-md">'),
            (r'<p id="messageDate" style="color: var\(--text-muted\); font-size: 0\.9rem; margin-bottom: 1rem;">',
             '<p id="messageDate" class="text-muted text-sm mb-md">'),
            (r'<p id="messageContent" style="line-height: 1\.7; white-space: pre-wrap;">',
             '<p id="messageContent" class="line-height-relaxed text-preformatted">'),
            (r'<article class="card" id="pastorMessageCard" style="display: none;">',
             '<article class="card hidden" id="pastorMessageCard">'),
            (r'<article class="card" id="activitiesCard" style="display: none;">',
             '<article class="card hidden" id="activitiesCard">'),
            (r'<div id="errorMessage" class="card" style="display: none; background: rgba\(255,0,0,0\.1\); border: 2px solid red;">',
             '<div id="errorMessage" class="error-card hidden">'),
            
            # for-businesses.html patterns
            (r'<div class="flex-gap-center" style="justify-content: center;">',
             '<div class="flex-gap-center justify-center">'),
            (r'<p style="font-size: 1\.15rem; max-width: 700px; margin: 1rem auto 2rem;">',
             '<p class="text-content-large text-content-center">'),
            (r'<p style="font-size: 1\.15rem; margin: 1rem 0 2rem;">',
             '<p class="text-content-large">'),
        ]
        
        for pattern, replacement in complex_patterns:
            if pattern in content:
                content = content.replace(pattern, replacement)
                changes_made += 1
        
        # Save if changes were made
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return changes_made
        
        return 0
        
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return 0

def main():
    """Process all HTML files in the project."""
    html_files = list(Path('.').rglob('*.html'))
    
    # Exclude certain directories
    excluded = ['node_modules', 'attached_assets', '.git']
    html_files = [f for f in html_files if not any(ex in str(f) for ex in excluded)]
    
    total_changes = 0
    files_modified = 0
    
    for filepath in sorted(html_files):
        changes = remove_inline_styles_from_file(filepath)
        if changes > 0:
            files_modified += 1
            total_changes += changes
            print(f"✓ {filepath}: {changes} inline styles removed")
    
    print(f"\n{'='*60}")
    print(f"Summary: {total_changes} inline styles removed from {files_modified} files")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
