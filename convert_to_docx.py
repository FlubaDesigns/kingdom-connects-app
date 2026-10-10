import re
from datetime import datetime

# Read the markdown file
with open('DATABASE-BLING-CHECKLIST.md', 'r') as f:
    content = f.read()

# Simple markdown to HTML conversion
html_content = content

# Convert headers
html_content = re.sub(r'^# (.*?)$', r'<h1>\1</h1>', html_content, flags=re.MULTILINE)
html_content = re.sub(r'^## (.*?)$', r'<h2>\1</h2>', html_content, flags=re.MULTILINE)
html_content = re.sub(r'^### (.*?)$', r'<h3>\1</h3>', html_content, flags=re.MULTILINE)

# Convert bold
html_content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_content)

# Convert checkboxes
html_content = re.sub(r'\[ \]', r'☐', html_content)
html_content = re.sub(r'\[x\]', r'☑', html_content)

# Convert code blocks
html_content = re.sub(r'```json\n(.*?)\n```', r'<pre style="background: #f5f5f5; padding: 10px; border-left: 3px solid #4CAF50;">\1</pre>', html_content, flags=re.DOTALL)
html_content = re.sub(r'```javascript\n(.*?)\n```', r'<pre style="background: #f5f5f5; padding: 10px; border-left: 3px solid #2196F3;">\1</pre>', html_content, flags=re.DOTALL)
html_content = re.sub(r'```\n(.*?)\n```', r'<pre style="background: #f5f5f5; padding: 10px;">\1</pre>', html_content, flags=re.DOTALL)

# Convert inline code
html_content = re.sub(r'`(.*?)`', r'<code style="background: #f0f0f0; padding: 2px 5px;">\1</code>', html_content)

# Convert horizontal rules
html_content = html_content.replace('---', '<hr>')

# Convert line breaks to paragraphs
paragraphs = html_content.split('\n\n')
html_paragraphs = []
for p in paragraphs:
    if not p.strip().startswith('<'):
        p = f'<p>{p}</p>'
    html_paragraphs.append(p)
html_content = '\n'.join(html_paragraphs)

# Create full HTML document
full_html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Kingdom Connects - Database Bling Checklist</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }}
        h1 {{
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #34495e;
            border-bottom: 2px solid #95a5a6;
            padding-bottom: 8px;
            margin-top: 30px;
        }}
        h3 {{
            color: #7f8c8d;
            margin-top: 20px;
        }}
        pre {{
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }}
        code {{
            font-family: 'Courier New', monospace;
        }}
        hr {{
            border: none;
            border-top: 1px solid #bdc3c7;
            margin: 30px 0;
        }}
    </style>
</head>
<body>
{html_content}
</body>
</html>'''

# Write HTML file
with open('DATABASE-BLING-CHECKLIST.html', 'w') as f:
    f.write(full_html)

print("✅ Created DATABASE-BLING-CHECKLIST.html")
print("You can open this in Microsoft Word and save as .docx")
