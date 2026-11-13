#!/usr/bin/env python3
# Renders src/features/listings/listings.json to a formatted xlsx in shots/ —
# upload to the registry Sheet via update_drive_file (keeps the file id stable).
# XLSX is used instead of CSV because Sheets conversion preserves its
# formatting (frozen/bold header, column widths, status colors, wrapped notes)
# while a CSV import resets all of it. Requires: pip3 install --user openpyxl
import json
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = os.path.join(os.path.dirname(__file__), '..')
reg = json.load(open(os.path.join(ROOT, 'src/features/listings/listings.json')))
cols = ['name', 'category', 'status', 'liveUrl', 'submitUrl', 'submittedAt', 'account', 'notes']
widths = [30, 14, 15, 44, 44, 14, 26, 60]

wb = Workbook()
ws = wb.active
ws.title = 'listings'
header_fill = PatternFill('solid', fgColor='EBEBEB')
ws.append(cols)
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
for c in ws[1]:
    c.font = Font(bold=True)
    c.fill = header_fill
    c.alignment = Alignment(vertical='top')
ws.freeze_panes = 'A2'

status_order = ['live', 'in-review', 'needs-account', 'needs-payment', 'blocked', 'unknown', 'queued']
listings = sorted(reg['listings'],
                  key=lambda l: status_order.index(l['status']) if l['status'] in status_order else len(status_order))
for l in listings:
    ws.append([l.get(k) or '' for k in cols])

status_fill = {
    'live': PatternFill('solid', fgColor='E6F4EA'),
    'in-review': PatternFill('solid', fgColor='FEF7E0'),
    'queued': PatternFill('solid', fgColor='F1F3F4'),
    'needs-account': PatternFill('solid', fgColor='FCE8E6'),
    'needs-payment': PatternFill('solid', fgColor='FCE8E6'),
    'blocked': PatternFill('solid', fgColor='FCE8E6'),
    'unknown': PatternFill('solid', fgColor='FEF7E0'),
}
for row in ws.iter_rows(min_row=2):
    fill = status_fill.get(row[2].value)
    if fill:
        row[2].fill = fill
    for c in row:
        c.alignment = Alignment(vertical='top', wrap_text=(c.column == 8))

ws.auto_filter.ref = f'A1:H{ws.max_row}'
os.makedirs(os.path.join(ROOT, 'shots'), exist_ok=True)
out = os.path.join(ROOT, 'shots', 'listings.xlsx')
wb.save(out)
print(f'wrote {out} ({ws.max_row - 1} listings)')
