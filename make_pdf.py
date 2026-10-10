from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.colors import HexColor
import re

# Read markdown
with open('DATABASE-BLING-CHECKLIST.md', 'r') as f:
    content = f.read()

# Create PDF
pdf = SimpleDocTemplate("DATABASE-BLING-CHECKLIST.pdf", pagesize=letter,
                        leftMargin=0.75*inch, rightMargin=0.75*inch,
                        topMargin=0.75*inch, bottomMargin=0.75*inch)

styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'],
                             fontSize=18, textColor=HexColor('#2c3e50'),
                             spaceAfter=12, fontName='Helvetica-Bold')

h2_style = ParagraphStyle('CustomH2', parent=styles['Heading2'],
                          fontSize=14, textColor=HexColor('#34495e'),
                          spaceAfter=8, spaceBefore=12, fontName='Helvetica-Bold')

h3_style = ParagraphStyle('CustomH3', parent=styles['Heading3'],
                          fontSize=12, textColor=HexColor('#7f8c8d'),
                          spaceAfter=6, spaceBefore=8, fontName='Helvetica-Bold')

body_style = ParagraphStyle('CustomBody', parent=styles['Normal'],
                            fontSize=10, fontName='Helvetica')

code_style = ParagraphStyle('CustomCode', parent=styles['Code'],
                            fontSize=8, fontName='Courier',
                            leftIndent=20, rightIndent=20,
                            textColor=HexColor('#000000'))

story = []

# Split into lines
lines = content.split('\n')
in_code_block = False
code_lines = []

for line in lines:
    line = line.rstrip()
    
    # Code blocks
    if line.startswith('```'):
        if in_code_block:
            # End code block
            code_text = '<br/>'.join(code_lines)
            story.append(Paragraph(code_text, code_style))
            story.append(Spacer(1, 0.1*inch))
            code_lines = []
            in_code_block = False
        else:
            in_code_block = True
        continue
    
    if in_code_block:
        # Escape XML chars
        line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        code_lines.append(line)
        continue
    
    # Headers
    if line.startswith('# '):
        text = line[2:].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        story.append(Paragraph(text, title_style))
    elif line.startswith('## '):
        text = line[3:].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        story.append(Paragraph(text, h2_style))
    elif line.startswith('### '):
        text = line[4:].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        story.append(Paragraph(text, h3_style))
    elif line == '---':
        story.append(Spacer(1, 0.2*inch))
    elif line.strip():
        # Regular text - clean markdown
        text = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
        text = re.sub(r'`(.*?)`', r'<font name="Courier" size="8">\1</font>', text)
        
        story.append(Paragraph(text, body_style))

# Build PDF
pdf.build(story)
print("✅ Created DATABASE-BLING-CHECKLIST.pdf")
