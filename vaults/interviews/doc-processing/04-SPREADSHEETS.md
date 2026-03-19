# Chapter 4: Spreadsheets

Spreadsheets are the lingua franca of business data. From financial models and inventory
trackers to scientific datasets and government reports, more data lives in `.xlsx` and
`.csv` files than in any database. Python offers a rich ecosystem for reading, writing,
transforming, and automating spreadsheets at scale. This chapter covers the full
spectrum: low-level cell manipulation with openpyxl and xlsxwriter, high-speed
analytics with pandas and polars, and the ever-present CSV format that bridges
every system.

```
+------------------------------------------------------------------+
|                  SPREADSHEET ECOSYSTEM IN PYTHON                 |
+------------------------------------------------------------------+
|                                                                  |
|   FILE FORMATS                                                   |
|   +-----------+  +------------+  +-----------+  +----------+     |
|   | .xlsx     |  | .xls       |  | .csv      |  | .ods     |    |
|   | (OOXML)   |  | (BIFF/     |  | (Plain    |  | (Open    |    |
|   | ZIP+XML   |  |  Legacy)   |  |  Text)    |  |  Doc)    |    |
|   +-----------+  +------------+  +-----------+  +----------+     |
|        |              |               |              |            |
|        v              v               v              v            |
|   READING LIBRARIES                                              |
|   +----------------------------------------------------------+   |
|   | openpyxl     | .xlsx read/write, formatting, charts      |   |
|   | xlrd         | .xls read (legacy only)                   |   |
|   | xlsxwriter   | .xlsx write-only, rich formatting         |   |
|   | csv (stdlib) | .csv read/write, dialects, streaming      |   |
|   | pandas       | All formats via engines, DataFrames       |   |
|   | polars       | .csv/.xlsx, LazyFrames, zero-copy         |   |
|   +----------------------------------------------------------+   |
|        |                                                         |
|        v                                                         |
|   PROCESSING PIPELINE                                            |
|   +----------+    +----------+    +----------+    +----------+   |
|   | Extract  |--->| Validate |--->|Transform |--->|  Load    |   |
|   | (read)   |    | (schema) |    | (clean)  |    | (write)  |   |
|   +----------+    +----------+    +----------+    +----------+   |
|        |                                               |         |
|        v                                               v         |
|   DATA CONSUMERS                                                 |
|   +----------------------------------------------------------+   |
|   | Databases | APIs | Reports | Dashboards | ML Pipelines   |   |
|   +----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

---

## 1. Excel Formats

### 1.1 The Three Formats

| Feature         | `.xlsx` (OOXML)       | `.xls` (BIFF)         | `.csv`       |
| --------------- | --------------------- | --------------------- | ------------ |
| Introduced      | Office 2007           | Office 97             | 1970s        |
| Binary format   | ZIP archive of XML    | Binary (BIFF8)        | Plain text   |
| Max rows        | 1,048,576             | 65,536                | Unlimited    |
| Max columns     | 16,384 (XFD)          | 256 (IV)              | Unlimited    |
| Multiple sheets | Yes                   | Yes                   | No           |
| Formulas        | Yes                   | Yes                   | No           |
| Formatting      | Full (styles, charts) | Full                  | None         |
| File size       | Compressed (small)    | Uncompressed (large)  | Smallest     |
| Python library  | openpyxl, xlsxwriter  | xlrd (read), xlwt (w) | csv (stdlib) |

### 1.2 XLSX Internals

An `.xlsx` file is simply a ZIP archive containing XML files:

```python
import zipfile

with zipfile.ZipFile("report.xlsx", "r") as z:
    for name in z.namelist():
        print(name)

# Typical output:
# [Content_Types].xml
# _rels/.rels
# xl/workbook.xml          <-- workbook metadata
# xl/worksheets/sheet1.xml <-- actual cell data
# xl/worksheets/sheet2.xml
# xl/sharedStrings.xml     <-- deduplicated string table
# xl/styles.xml            <-- formatting definitions
# xl/theme/theme1.xml      <-- color theme
# docProps/app.xml
# docProps/core.xml
```

Examining sheet XML reveals the cell structure:

```python
import zipfile
from xml.etree import ElementTree as ET

with zipfile.ZipFile("report.xlsx", "r") as z:
    with z.open("xl/worksheets/sheet1.xml") as f:
        tree = ET.parse(f)
        root = tree.getroot()
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

        for row in root.findall(".//s:row", ns):
            row_num = row.get("r")
            for cell in row.findall("s:c", ns):
                ref = cell.get("r")       # e.g., "A1"
                cell_type = cell.get("t")  # "s" = shared string, "n" = number
                value_el = cell.find("s:v", ns)
                value = value_el.text if value_el is not None else None
                print(f"  {ref}: type={cell_type}, value={value}")
```

### 1.3 When to Use Which Library

```
Decision Tree:
                    Need to read or write?
                    /                     \
                READ                    WRITE
                /                         \
        Format?                      Need rich formatting?
       /    |    \                   /                    \
    .xlsx  .xls  .csv           YES                      NO
      |      |      |            |                        |
  openpyxl  xlrd   csv      xlsxwriter              openpyxl
  (or       (only  module   (best charts,           (simpler
   pandas)  for    (or      conditional fmt,         API)
            legacy  pandas)  sparklines)
            files)
```

---

## 2. Reading Excel with openpyxl

### 2.1 Opening Workbooks

```python
from openpyxl import load_workbook

# Basic open
wb = load_workbook("report.xlsx")

# Read-only mode for large files (streaming, lower memory)
wb_ro = load_workbook("large_report.xlsx", read_only=True)

# Load with data_only=True to get computed values instead of formulas
wb_data = load_workbook("report.xlsx", data_only=True)

# Keep VBA macros (for .xlsm files)
wb_macro = load_workbook("macro_enabled.xlsm", keep_vba=True)
```

### 2.2 Iterating Sheets, Rows, and Cells

```python
from openpyxl import load_workbook

wb = load_workbook("report.xlsx")

# List all sheet names
print(wb.sheetnames)  # ['Sales', 'Inventory', 'Summary']

# Access sheet by name
ws = wb["Sales"]

# Access active sheet
ws = wb.active

# Sheet dimensions
print(ws.dimensions)    # e.g., "A1:F100"
print(ws.min_row, ws.max_row)      # 1, 100
print(ws.min_column, ws.max_column) # 1, 6

# Iterate all rows
for row in ws.iter_rows(min_row=1, max_row=ws.max_row,
                        min_col=1, max_col=ws.max_column):
    values = [cell.value for cell in row]
    print(values)

# Iterate with values_only for simpler access
for row in ws.iter_rows(values_only=True):
    print(row)  # tuple of values

# Access individual cells
cell = ws["A1"]
cell = ws.cell(row=1, column=1)
print(cell.value, cell.data_type, cell.coordinate)

# Iterate columns instead of rows
for col in ws.iter_cols(min_col=1, max_col=3):
    col_values = [cell.value for cell in col]
    print(col_values)
```

### 2.3 Cell Values, Types, and Formatting

```python
from openpyxl import load_workbook

wb = load_workbook("report.xlsx")
ws = wb.active

for row in ws.iter_rows(min_row=1, max_row=5):
    for cell in row:
        print(f"Cell {cell.coordinate}:")
        print(f"  Value:       {cell.value}")
        print(f"  Data type:   {cell.data_type}")  # 's'=string, 'n'=numeric, 'd'=date
        print(f"  Number fmt:  {cell.number_format}")
        print(f"  Font:        {cell.font.name}, size={cell.font.size}")
        print(f"  Fill color:  {cell.fill.start_color.rgb}")
        print(f"  Bold:        {cell.font.bold}")
        print(f"  Alignment:   {cell.alignment.horizontal}")
```

### 2.4 Formulas vs Computed Values

```python
from openpyxl import load_workbook

# Load with formulas visible
wb_formulas = load_workbook("report.xlsx")
ws_f = wb_formulas.active
print(ws_f["C10"].value)  # '=SUM(C2:C9)'

# Load with computed values (requires Excel to have saved cached values)
wb_data = load_workbook("report.xlsx", data_only=True)
ws_d = wb_data.active
print(ws_d["C10"].value)  # 42500.0 (the computed result, or None if not cached)
```

**Important caveat**: `data_only=True` reads the _cached_ result that Excel stored
on last save. If the file was created programmatically without Excel, cached values
may be `None`. To get computed values from programmatic files, you would need a
calculation engine like `formulas` or `xlcalc`.

### 2.5 Handling Merged Cells

```python
from openpyxl import load_workbook

wb = load_workbook("report.xlsx")
ws = wb.active

# List merged cell ranges
print(ws.merged_cells.ranges)  # e.g., [<MergedCellRange A1:D1>]

# Merged cells: only the top-left cell has the value
# Other cells in the range return None
for merge_range in ws.merged_cells.ranges:
    print(f"Merged: {merge_range}")
    top_left = ws.cell(
        row=merge_range.min_row,
        column=merge_range.min_col
    )
    print(f"  Value: {top_left.value}")

# Helper: get value for any cell, resolving merged cells
def get_cell_value(ws, row, col):
    cell = ws.cell(row=row, column=col)
    if cell.value is not None:
        return cell.value
    for merge_range in ws.merged_cells.ranges:
        if cell.coordinate in merge_range:
            return ws.cell(
                row=merge_range.min_row,
                column=merge_range.min_col
            ).value
    return None
```

### 2.6 Reading Charts and Images (Limitations)

openpyxl has **limited** support for reading embedded objects:

```python
from openpyxl import load_workbook

wb = load_workbook("report.xlsx")
ws = wb.active

# Images: openpyxl does NOT preserve images on read
# Charts: openpyxl does NOT read charts from existing files

# To extract images, work with the ZIP directly:
import zipfile
from pathlib import Path

with zipfile.ZipFile("report.xlsx", "r") as z:
    for name in z.namelist():
        if name.startswith("xl/media/"):
            image_data = z.read(name)
            output_path = Path("extracted") / Path(name).name
            output_path.parent.mkdir(exist_ok=True)
            output_path.write_bytes(image_data)
            print(f"Extracted: {output_path}")
```

---

## 3. Writing Excel with openpyxl

### 3.1 Creating Workbooks and Sheets

```python
from openpyxl import Workbook

wb = Workbook()
ws = wb.active
ws.title = "Sales Report"

# Add more sheets
ws2 = wb.create_sheet("Inventory")
ws3 = wb.create_sheet("Summary", 0)  # Insert at position 0

# Copy a sheet
ws_copy = wb.copy_worksheet(ws)

# Remove a sheet
wb.remove(ws_copy)

wb.save("output.xlsx")
```

### 3.2 Writing Data, Formulas, and Dates

```python
from openpyxl import Workbook
from datetime import datetime, date

wb = Workbook()
ws = wb.active

# Write headers
headers = ["Product", "Quantity", "Unit Price", "Total", "Date"]
ws.append(headers)

# Write data rows
data = [
    ("Widget A", 150, 9.99, None, date(2025, 1, 15)),
    ("Widget B", 230, 14.50, None, date(2025, 2, 20)),
    ("Gadget C", 75, 29.99, None, date(2025, 3, 10)),
]

for i, row in enumerate(data, start=2):
    ws.append(row)
    # Add formula for Total column (column D)
    ws.cell(row=i, column=4, value=f"=B{i}*C{i}")

# Add a SUM formula at the bottom
last_row = ws.max_row + 1
ws.cell(row=last_row, column=4, value=f"=SUM(D2:D{last_row - 1})")

# Set date format
for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=5, max_col=5):
    for cell in row:
        cell.number_format = "YYYY-MM-DD"

wb.save("sales.xlsx")
```

### 3.3 Cell Formatting

```python
from openpyxl import Workbook
from openpyxl.styles import (
    Font, PatternFill, Border, Side,
    Alignment, numbers
)

wb = Workbook()
ws = wb.active

# Font styling
header_font = Font(
    name="Calibri",
    size=14,
    bold=True,
    italic=False,
    color="FFFFFF"  # white text
)

# Fill (background color)
header_fill = PatternFill(
    start_color="4472C4",
    end_color="4472C4",
    fill_type="solid"
)

# Border
thin_border = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin")
)

thick_bottom = Border(
    bottom=Side(style="thick", color="4472C4")
)

# Alignment
center_align = Alignment(
    horizontal="center",
    vertical="center",
    wrap_text=True
)

# Apply formatting to headers
headers = ["Product", "Q1", "Q2", "Q3", "Q4", "Total"]
for col, header in enumerate(headers, start=1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = header_font
    cell.fill = header_fill
    cell.border = thin_border
    cell.alignment = center_align

# Number formats for data cells
ws["B2"] = 1234.567
ws["B2"].number_format = "#,##0.00"          # 1,234.57

ws["C2"] = 0.156
ws["C2"].number_format = "0.0%"              # 15.6%

ws["D2"] = 50000
ws["D2"].number_format = "$#,##0"            # $50,000

ws["E2"] = -1234.56
ws["E2"].number_format = '#,##0.00;[Red]-#,##0.00'  # Negative in red

# Column widths
ws.column_dimensions["A"].width = 25
ws.column_dimensions["B"].width = 15

# Row heights
ws.row_dimensions[1].height = 30

wb.save("formatted.xlsx")
```

### 3.4 Conditional Formatting

```python
from openpyxl import Workbook
from openpyxl.formatting.rule import (
    CellIsRule, ColorScaleRule, DataBarRule,
    FormulaRule, IconSetRule
)
from openpyxl.styles import PatternFill, Font

wb = Workbook()
ws = wb.active

# Sample data
ws.append(["Name", "Score"])
for name, score in [("Alice", 92), ("Bob", 67), ("Carol", 85),
                     ("Dave", 45), ("Eve", 78)]:
    ws.append([name, score])

# Highlight cells above 80 in green
green_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
green_font = Font(color="006100")
ws.conditional_formatting.add(
    "B2:B6",
    CellIsRule(operator="greaterThan", formula=["80"],
               fill=green_fill, font=green_font)
)

# Highlight cells below 50 in red
red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
red_font = Font(color="9C0006")
ws.conditional_formatting.add(
    "B2:B6",
    CellIsRule(operator="lessThan", formula=["50"],
               fill=red_fill, font=red_font)
)

# Color scale (gradient from red to green)
ws.conditional_formatting.add(
    "B2:B6",
    ColorScaleRule(
        start_type="min", start_color="F8696B",
        mid_type="percentile", mid_value=50, mid_color="FFEB84",
        end_type="max", end_color="63BE7B"
    )
)

# Data bars
ws.conditional_formatting.add(
    "B2:B6",
    DataBarRule(start_type="min", end_type="max",
                color="4472C4", showValue=True)
)

# Formula-based rule (highlight entire row if score < 50)
ws.conditional_formatting.add(
    "A2:B6",
    FormulaRule(
        formula=["$B2<50"],
        fill=PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
    )
)

wb.save("conditional.xlsx")
```

### 3.5 Data Validation

```python
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation

wb = Workbook()
ws = wb.active

# Dropdown list validation
status_validation = DataValidation(
    type="list",
    formula1='"Active,Inactive,Pending"',
    allow_blank=True
)
status_validation.error = "Please select a valid status"
status_validation.errorTitle = "Invalid Status"
status_validation.prompt = "Choose a status from the list"
status_validation.promptTitle = "Status"
ws.add_data_validation(status_validation)

# Apply to a range
status_validation.add("C2:C100")

# Integer range validation
age_validation = DataValidation(
    type="whole",
    operator="between",
    formula1=0,
    formula2=150
)
age_validation.error = "Age must be between 0 and 150"
ws.add_data_validation(age_validation)
age_validation.add("B2:B100")

# Date validation
date_validation = DataValidation(
    type="date",
    operator="greaterThan",
    formula1="2020-01-01"
)
ws.add_data_validation(date_validation)
date_validation.add("D2:D100")

# Headers
ws.append(["Name", "Age", "Status", "Start Date"])

wb.save("validated.xlsx")
```

### 3.6 Adding Charts

```python
from openpyxl import Workbook
from openpyxl.chart import (
    BarChart, LineChart, PieChart, Reference
)

wb = Workbook()
ws = wb.active

# Sample data
ws.append(["Month", "Revenue", "Expenses"])
monthly_data = [
    ("Jan", 45000, 32000), ("Feb", 52000, 35000),
    ("Mar", 48000, 31000), ("Apr", 61000, 38000),
    ("May", 55000, 34000), ("Jun", 67000, 40000),
]
for row in monthly_data:
    ws.append(row)

# --- Bar Chart ---
bar_chart = BarChart()
bar_chart.type = "col"
bar_chart.title = "Revenue vs Expenses"
bar_chart.y_axis.title = "Amount ($)"
bar_chart.x_axis.title = "Month"

categories = Reference(ws, min_col=1, min_row=2, max_row=7)
revenue = Reference(ws, min_col=2, min_row=1, max_row=7)
expenses = Reference(ws, min_col=3, min_row=1, max_row=7)

bar_chart.add_data(revenue, titles_from_data=True)
bar_chart.add_data(expenses, titles_from_data=True)
bar_chart.set_categories(categories)
bar_chart.shape = 4
ws.add_chart(bar_chart, "E2")

# --- Line Chart ---
line_chart = LineChart()
line_chart.title = "Revenue Trend"
line_chart.y_axis.title = "Revenue ($)"
line_chart.add_data(revenue, titles_from_data=True)
line_chart.set_categories(categories)
line_chart.style = 10
ws.add_chart(line_chart, "E18")

# --- Pie Chart (on a new sheet) ---
ws2 = wb.create_sheet("Breakdown")
ws2.append(["Category", "Amount"])
for cat, amt in [("Salaries", 180000), ("Rent", 60000),
                  ("Marketing", 45000), ("Utilities", 15000)]:
    ws2.append([cat, amt])

pie = PieChart()
pie.title = "Expense Breakdown"
labels = Reference(ws2, min_col=1, min_row=2, max_row=5)
values = Reference(ws2, min_col=2, min_row=2, max_row=5)
pie.add_data(values)
pie.set_categories(labels)
ws2.add_chart(pie, "D2")

wb.save("charts.xlsx")
```

### 3.7 Freeze Panes and Auto-Filter

```python
from openpyxl import Workbook

wb = Workbook()
ws = wb.active

# Write headers and data
headers = ["ID", "Name", "Department", "Salary"]
ws.append(headers)
for i in range(1, 51):
    ws.append([i, f"Employee {i}", ["Eng", "Sales", "HR"][i % 3], 50000 + i * 1000])

# Freeze the top row (headers stay visible while scrolling)
ws.freeze_panes = "A2"

# Auto-filter on all columns
ws.auto_filter.ref = ws.dimensions

# Add a filter condition (note: this sets the UI, not the data)
ws.auto_filter.add_filter_column(2, ["Eng"])

# Print settings
ws.print_title_rows = "1:1"  # Repeat row 1 on every printed page
ws.sheet_properties.pageSetUpPr.fitToPage = True

wb.save("filtered.xlsx")
```

---

## 4. Writing Excel with xlsxwriter

### 4.1 Why xlsxwriter

xlsxwriter is a **write-only** library with several advantages over openpyxl for
output-heavy workflows:

- More complete chart support (sparklines, trendlines, error bars)
- Better conditional formatting options
- Worksheet protection with granular permissions
- VBA macro injection
- Memory optimization mode for very large files
- More control over page setup and printing

Trade-off: it cannot read existing files, only create new ones.

### 4.2 Creating Formatted Reports

```python
import xlsxwriter

wb = xlsxwriter.Workbook("report_xlsxwriter.xlsx")
ws = wb.add_worksheet("Sales")

# Define formats
title_fmt = wb.add_format({
    "bold": True,
    "font_size": 16,
    "font_color": "#FFFFFF",
    "bg_color": "#4472C4",
    "border": 1,
    "align": "center",
    "valign": "vcenter",
})

header_fmt = wb.add_format({
    "bold": True,
    "font_size": 11,
    "bg_color": "#D9E2F3",
    "border": 1,
    "text_wrap": True,
})

money_fmt = wb.add_format({
    "num_format": "$#,##0.00",
    "border": 1,
})

pct_fmt = wb.add_format({
    "num_format": "0.0%",
    "border": 1,
})

date_fmt = wb.add_format({
    "num_format": "yyyy-mm-dd",
    "border": 1,
})

# Title row (merged)
ws.merge_range("A1:E1", "Quarterly Sales Report", title_fmt)
ws.set_row(0, 30)

# Headers
headers = ["Product", "Units Sold", "Revenue", "Margin %", "Date"]
for col, header in enumerate(headers):
    ws.write(1, col, header, header_fmt)

# Data
data = [
    ("Widget A", 1500, 14985.00, 0.32, "2025-01-15"),
    ("Widget B", 2300, 33350.00, 0.28, "2025-02-20"),
    ("Gadget C", 750, 22492.50, 0.45, "2025-03-10"),
]

for row_idx, (product, units, revenue, margin, dt) in enumerate(data, start=2):
    ws.write_string(row_idx, 0, product)
    ws.write_number(row_idx, 1, units)
    ws.write_number(row_idx, 2, revenue, money_fmt)
    ws.write_number(row_idx, 3, margin, pct_fmt)
    ws.write_string(row_idx, 4, dt, date_fmt)

# Column widths
ws.set_column("A:A", 15)
ws.set_column("B:B", 12)
ws.set_column("C:C", 15)
ws.set_column("D:D", 12)
ws.set_column("E:E", 14)

# Autofilter
ws.autofilter("A1:E4")

# Freeze panes
ws.freeze_panes(2, 0)

wb.close()
```

### 4.3 Charts and Sparklines

```python
import xlsxwriter

wb = xlsxwriter.Workbook("charts_xlsxwriter.xlsx")
ws = wb.add_worksheet()

# Data
ws.write_row(0, 0, ["Month", "Sales", "Returns"])
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
sales =  [120, 150, 170, 160, 200, 210]
returns = [10, 12, 8, 15, 11, 9]

for i, (m, s, r) in enumerate(zip(months, sales, returns), start=1):
    ws.write_string(i, 0, m)
    ws.write_number(i, 1, s)
    ws.write_number(i, 2, r)

# Combined bar + line chart
chart = wb.add_chart({"type": "column"})
chart.add_series({
    "name":       "=Sheet1!$B$1",
    "categories": "=Sheet1!$A$2:$A$7",
    "values":     "=Sheet1!$B$2:$B$7",
    "fill":       {"color": "#4472C4"},
})

line_chart = wb.add_chart({"type": "line"})
line_chart.add_series({
    "name":       "=Sheet1!$C$1",
    "categories": "=Sheet1!$A$2:$A$7",
    "values":     "=Sheet1!$C$2:$C$7",
    "line":       {"color": "#ED7D31", "width": 2.5},
    "marker":     {"type": "circle", "size": 5},
})

chart.combine(line_chart)
chart.set_title({"name": "Sales & Returns"})
chart.set_y_axis({"name": "Units"})
chart.set_size({"width": 600, "height": 400})
ws.insert_chart("E2", chart)

# Sparklines (inline mini-charts)
ws.add_sparkline("D2", {
    "range":    "Sheet1!B2:B7",
    "type":     "column",
    "style":    12,
})

ws.add_sparkline("D3", {
    "range":    "Sheet1!C2:C7",
    "type":     "line",
    "markers":  True,
    "style":    2,
})

wb.close()
```

### 4.4 Worksheet Protection

```python
import xlsxwriter

wb = xlsxwriter.Workbook("protected.xlsx")
ws = wb.add_worksheet()

unlocked = wb.add_format({"locked": False})
locked_hidden = wb.add_format({"locked": True, "hidden": True})

ws.write("A1", "Editable cell:")
ws.write("B1", "Type here", unlocked)

ws.write("A3", "Formula (hidden):")
ws.write_formula("B3", "=B1&' processed'", locked_hidden)

# Protect the sheet (users can only edit unlocked cells)
ws.protect("secretpassword", {
    "objects":               False,
    "scenarios":             False,
    "format_cells":          True,
    "format_columns":        True,
    "format_rows":           True,
    "insert_columns":        False,
    "insert_rows":           False,
    "delete_columns":        False,
    "delete_rows":           False,
    "select_locked_cells":   True,
    "select_unlocked_cells": True,
    "sort":                  True,
    "autofilter":            True,
})

wb.close()
```

---

## 5. CSV Processing

### 5.1 csv Module Basics

```python
import csv

# --- Reading with csv.reader ---
with open("data.csv", "r", newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    headers = next(reader)
    for row in reader:
        # row is a list of strings
        name, age, email = row
        print(f"{name} ({age}): {email}")

# --- Reading with DictReader ---
with open("data.csv", "r", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        # row is an OrderedDict
        print(f"{row['name']} ({row['age']}): {row['email']}")

# --- Writing with csv.writer ---
with open("output.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["name", "age", "email"])
    writer.writerow(["Alice", 30, "alice@example.com"])
    writer.writerows([
        ["Bob", 25, "bob@example.com"],
        ["Carol", 35, "carol@example.com"],
    ])

# --- Writing with DictWriter ---
with open("output.csv", "w", newline="", encoding="utf-8") as f:
    fieldnames = ["name", "age", "email"]
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerow({"name": "Alice", "age": 30, "email": "alice@example.com"})
```

**Why `newline=""`?** The csv module handles line terminators internally. Without
`newline=""`, you may get double line breaks on Windows.

### 5.2 Encoding Issues

```python
import csv

# UTF-8 with BOM (common from Excel on Windows)
with open("excel_export.csv", "r", encoding="utf-8-sig") as f:
    reader = csv.reader(f)
    headers = next(reader)  # BOM is stripped by utf-8-sig

# Latin-1 / ISO-8859-1 (common in European data)
with open("european.csv", "r", encoding="latin-1") as f:
    reader = csv.reader(f, delimiter=";")  # European CSVs often use semicolons
    for row in reader:
        print(row)

# Auto-detect encoding with chardet
import chardet

def detect_encoding(file_path):
    with open(file_path, "rb") as f:
        raw = f.read(10000)  # Read first 10KB
    result = chardet.detect(raw)
    return result["encoding"]

encoding = detect_encoding("mystery.csv")
with open("mystery.csv", "r", encoding=encoding) as f:
    reader = csv.reader(f)
    for row in reader:
        print(row)
```

### 5.3 Dialect Detection

```python
import csv

# Sniff the dialect from a sample
with open("unknown.csv", "r", newline="") as f:
    sample = f.read(4096)
    dialect = csv.Sniffer().sniff(sample)
    print(f"Delimiter: {dialect.delimiter!r}")
    print(f"Quote char: {dialect.quotechar!r}")
    print(f"Line terminator: {dialect.lineterminator!r}")

    f.seek(0)
    reader = csv.reader(f, dialect=dialect)
    for row in reader:
        print(row)

# Register a custom dialect
csv.register_dialect("pipes", delimiter="|", quoting=csv.QUOTE_MINIMAL)

with open("pipe_delimited.csv", "r") as f:
    reader = csv.reader(f, dialect="pipes")
    for row in reader:
        print(row)

# Common quoting modes:
# csv.QUOTE_MINIMAL  - Quote only when necessary (default)
# csv.QUOTE_ALL      - Quote all fields
# csv.QUOTE_NONNUMERIC - Quote non-numeric fields
# csv.QUOTE_NONE     - Never quote (use escapechar for special chars)
```

### 5.4 Large CSV Handling (Streaming)

```python
import csv
from collections import defaultdict

def process_large_csv(file_path, chunk_size=10000):
    """Process a large CSV without loading it all into memory."""
    totals = defaultdict(float)
    row_count = 0

    with open(file_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        chunk = []

        for row in reader:
            chunk.append(row)
            row_count += 1

            if len(chunk) >= chunk_size:
                # Process chunk
                for r in chunk:
                    totals[r["category"]] += float(r["amount"])
                chunk = []

        # Process remaining rows
        for r in chunk:
            totals[r["category"]] += float(r["amount"])

    print(f"Processed {row_count} rows")
    return dict(totals)


# Memory-efficient line counting
def count_csv_rows(file_path):
    with open(file_path, "r") as f:
        return sum(1 for _ in f) - 1  # Subtract header
```

---

## 6. pandas for Spreadsheets

### 6.1 read_excel / to_excel

```python
import pandas as pd

# Basic read
df = pd.read_excel("report.xlsx")

# With options
df = pd.read_excel(
    "report.xlsx",
    sheet_name="Sales",       # Specific sheet (name or index)
    header=0,                 # Row index for headers (0-based)
    usecols="A:D",            # Only read columns A through D
    skiprows=[1, 2],          # Skip specific rows
    nrows=1000,               # Read only first 1000 rows
    dtype={"ID": str, "Amount": float},  # Force dtypes
    na_values=["N/A", ""],    # Additional NA markers
    engine="openpyxl",        # Engine (openpyxl for .xlsx, xlrd for .xls)
)

# Read all sheets at once
all_sheets = pd.read_excel("report.xlsx", sheet_name=None)
# Returns dict: {"Sheet1": df1, "Sheet2": df2, ...}

for name, df in all_sheets.items():
    print(f"Sheet '{name}': {len(df)} rows")

# Write to Excel
df.to_excel("output.xlsx", index=False, sheet_name="Results")
```

### 6.2 read_csv / to_csv

```python
import pandas as pd

# Basic read
df = pd.read_csv("data.csv")

# With options
df = pd.read_csv(
    "data.csv",
    encoding="utf-8-sig",       # Handle BOM
    sep=",",                    # Delimiter (auto-detect with sep=None, engine="python")
    header=0,                   # Header row
    dtype={"zip_code": str},    # Prevent zip codes like "07001" becoming 7001
    parse_dates=["date_col"],   # Parse date columns
    na_values=["N/A", "NULL"],  # Custom NA markers
    low_memory=False,           # Avoid mixed-type warnings on large files
    chunksize=None,             # Set to int for chunked reading
)

# Write to CSV
df.to_csv("output.csv", index=False, encoding="utf-8")

# Write with specific options
df.to_csv(
    "output.csv",
    index=False,
    sep="|",
    quoting=1,          # csv.QUOTE_ALL
    date_format="%Y-%m-%d",
    float_format="%.2f",
)
```

### 6.3 DataFrame Operations

```python
import pandas as pd

df = pd.read_excel("sales.xlsx")

# --- Filtering ---
high_value = df[df["amount"] > 10000]
q1_sales = df[df["date"].between("2025-01-01", "2025-03-31")]
eng_team = df[df["department"].isin(["Engineering", "DevOps"])]

# --- Grouping ---
by_dept = df.groupby("department")["amount"].agg(["sum", "mean", "count"])
print(by_dept)

# --- Pivot Tables ---
pivot = df.pivot_table(
    values="amount",
    index="department",
    columns="quarter",
    aggfunc="sum",
    fill_value=0,
    margins=True  # Add row/column totals
)
print(pivot)

# --- Adding computed columns ---
df = df.assign(
    tax=lambda x: x["amount"] * 0.08,
    total=lambda x: x["amount"] + x["amount"] * 0.08,
)

# --- String operations ---
df = df.assign(
    name_upper=lambda x: x["name"].str.upper(),
    email_domain=lambda x: x["email"].str.split("@").str[1],
)
```

### 6.4 Multi-Sheet Excel Files

```python
import pandas as pd

# Write multiple DataFrames to different sheets
with pd.ExcelWriter("multi_sheet.xlsx", engine="openpyxl") as writer:
    df_sales.to_excel(writer, sheet_name="Sales", index=False)
    df_inventory.to_excel(writer, sheet_name="Inventory", index=False)
    df_summary.to_excel(writer, sheet_name="Summary", index=False)

# Append to an existing Excel file
with pd.ExcelWriter(
    "existing.xlsx",
    engine="openpyxl",
    mode="a",                    # Append mode
    if_sheet_exists="overlay",   # Overlay existing sheet data
) as writer:
    df_new.to_excel(writer, sheet_name="NewData", index=False)
```

### 6.5 Styling pandas Output to Excel

```python
import pandas as pd

df = pd.DataFrame({
    "Product": ["Widget A", "Widget B", "Gadget C"],
    "Revenue": [45000, 52000, 38000],
    "Growth": [0.12, -0.05, 0.23],
})

# Create a Styler object
styled = (
    df.style
    .format({"Revenue": "${:,.0f}", "Growth": "{:.1%}"})
    .set_properties(**{"text-align": "center"})
    .applymap(
        lambda v: "color: red" if isinstance(v, float) and v < 0 else "",
        subset=["Growth"]
    )
    .bar(subset=["Revenue"], color="#4472C4", vmin=0)
    .set_table_styles([
        {"selector": "th", "props": [
            ("background-color", "#4472C4"),
            ("color", "white"),
            ("font-weight", "bold"),
        ]}
    ])
)

# Export styled DataFrame to Excel
styled.to_excel("styled_output.xlsx", engine="openpyxl", index=False)
```

### 6.6 Large File Handling

```python
import pandas as pd

# --- Chunked reading ---
chunks = pd.read_csv("huge_file.csv", chunksize=50000)
results = []
for chunk in chunks:
    # Process each chunk independently
    filtered = chunk[chunk["status"] == "active"]
    agg = filtered.groupby("category")["amount"].sum()
    results.append(agg)

# Combine results
final = pd.concat(results).groupby(level=0).sum()

# --- Optimize dtypes to reduce memory ---
def optimize_dtypes(df):
    for col in df.select_dtypes(include=["int64"]).columns:
        df = df.astype({col: "int32"})
    for col in df.select_dtypes(include=["float64"]).columns:
        df = df.astype({col: "float32"})
    for col in df.select_dtypes(include=["object"]).columns:
        num_unique = df[col].nunique()
        if num_unique / len(df) < 0.5:
            df = df.astype({col: "category"})
    return df

df = pd.read_csv("large.csv")
print(f"Before: {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")
df = optimize_dtypes(df)
print(f"After:  {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")

# --- Specify dtypes upfront for maximum efficiency ---
dtypes = {
    "id": "int32",
    "name": "category",
    "amount": "float32",
    "status": "category",
}
df = pd.read_csv("large.csv", dtype=dtypes, parse_dates=["date"])
```

---

## 7. polars for Speed

### 7.1 Why polars Is Faster

| Feature         | pandas                  | polars                      |
| --------------- | ----------------------- | --------------------------- |
| Backend         | NumPy (single-threaded) | Arrow (multi-threaded Rust) |
| Memory model    | Copy-heavy              | Zero-copy where possible    |
| String handling | Python objects          | Arrow UTF-8 buffers         |
| Missing values  | NaN (float only)        | Null (any type)             |
| Lazy evaluation | No                      | Yes (LazyFrame)             |
| Typical speedup | Baseline                | 5-20x faster                |

### 7.2 Reading Files

```python
import polars as pl

# Read CSV
df = pl.read_csv("data.csv")

# With options
df = pl.read_csv(
    "data.csv",
    separator=",",
    has_header=True,
    dtypes={"zip_code": pl.Utf8, "amount": pl.Float64},
    null_values=["N/A", ""],
    n_rows=1000,         # Read only first 1000 rows
    encoding="utf8",
)

# Read Excel
df = pl.read_excel(
    "report.xlsx",
    sheet_name="Sales",
    engine="openpyxl",
)

# Write
df.write_csv("output.csv")
df.write_excel("output.xlsx")
```

### 7.3 LazyFrame for Large Files

```python
import polars as pl

# Lazy reading -- builds a query plan, does not execute yet
lf = pl.scan_csv("huge_file.csv")

# Build query (nothing runs yet)
result = (
    lf
    .filter(pl.col("status") == "active")
    .filter(pl.col("amount") > 1000)
    .group_by("category")
    .agg([
        pl.col("amount").sum().alias("total"),
        pl.col("amount").mean().alias("avg"),
        pl.col("id").count().alias("count"),
    ])
    .sort("total", descending=True)
)

# Execute the optimized query plan
df = result.collect()
print(df)

# Inspect the query plan
print(result.explain())
# Shows predicate pushdown, projection pushdown, etc.
```

### 7.4 Quick Comparison with pandas

```python
# --- pandas ---
import pandas as pd

df_pd = pd.read_csv("sales.csv")
result_pd = (
    df_pd[df_pd["amount"] > 100]
    .groupby("category")["amount"]
    .agg(["sum", "mean"])
    .sort_values("sum", ascending=False)
)

# --- polars ---
import polars as pl

result_pl = (
    pl.scan_csv("sales.csv")
    .filter(pl.col("amount") > 100)
    .group_by("category")
    .agg([
        pl.col("amount").sum().alias("sum"),
        pl.col("amount").mean().alias("mean"),
    ])
    .sort("sum", descending=True)
    .collect()
)

# Conversion between the two
df_pl = pl.from_pandas(df_pd)   # pandas -> polars
df_pd = df_pl.to_pandas()       # polars -> pandas
```

---

## 8. Worked Problems

### Problem 1: Excel Report Generator with Charts

**Task**: Read sales data from a CSV file, clean it, compute summary statistics,
and produce a formatted Excel report with charts on a summary sheet.

```python
import csv
from datetime import datetime
from openpyxl import Workbook
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment, numbers

def read_sales_csv(path):
    """Read and parse sales CSV, returning list of dicts."""
    records = []
    with open(path, "r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                record = {
                    "date": datetime.strptime(row["date"].strip(), "%Y-%m-%d"),
                    "product": row["product"].strip(),
                    "category": row["category"].strip(),
                    "quantity": int(row["quantity"]),
                    "unit_price": float(row["unit_price"]),
                    "region": row["region"].strip(),
                }
                record["total"] = record["quantity"] * record["unit_price"]
                records.append(record)
            except (ValueError, KeyError) as e:
                print(f"Skipping invalid row: {row} ({e})")
    return records


def build_summary(records):
    """Aggregate records by category."""
    summary = {}
    for r in records:
        cat = r["category"]
        if cat not in summary:
            summary[cat] = {"quantity": 0, "revenue": 0.0, "count": 0}
        summary[cat]["quantity"] += r["quantity"]
        summary[cat]["revenue"] += r["total"]
        summary[cat]["count"] += 1
    return summary


def generate_report(records, output_path):
    wb = Workbook()

    # --- Styles ---
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )
    money_fmt = "$#,##0.00"
    date_fmt = "YYYY-MM-DD"

    def write_header(ws, headers):
        for col, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = border
            cell.alignment = Alignment(horizontal="center")

    # --- Detail Sheet ---
    ws_detail = wb.active
    ws_detail.title = "Detail"
    detail_headers = ["Date", "Product", "Category", "Qty", "Unit Price", "Total", "Region"]
    write_header(ws_detail, detail_headers)

    for i, r in enumerate(records, start=2):
        ws_detail.cell(row=i, column=1, value=r["date"]).number_format = date_fmt
        ws_detail.cell(row=i, column=2, value=r["product"])
        ws_detail.cell(row=i, column=3, value=r["category"])
        ws_detail.cell(row=i, column=4, value=r["quantity"])
        ws_detail.cell(row=i, column=5, value=r["unit_price"]).number_format = money_fmt
        ws_detail.cell(row=i, column=6, value=r["total"]).number_format = money_fmt
        ws_detail.cell(row=i, column=7, value=r["region"])
        for col in range(1, 8):
            ws_detail.cell(row=i, column=col).border = border

    ws_detail.freeze_panes = "A2"
    ws_detail.auto_filter.ref = ws_detail.dimensions

    # Column widths
    for col, width in enumerate([14, 20, 16, 8, 14, 14, 12], start=1):
        ws_detail.column_dimensions[chr(64 + col)].width = width

    # --- Summary Sheet ---
    ws_summary = wb.create_sheet("Summary", 0)  # Insert at front
    summary = build_summary(records)

    summary_headers = ["Category", "Orders", "Units Sold", "Revenue"]
    write_header(ws_summary, summary_headers)

    for i, (cat, vals) in enumerate(sorted(summary.items()), start=2):
        ws_summary.cell(row=i, column=1, value=cat).border = border
        ws_summary.cell(row=i, column=2, value=vals["count"]).border = border
        ws_summary.cell(row=i, column=3, value=vals["quantity"]).border = border
        cell = ws_summary.cell(row=i, column=4, value=vals["revenue"])
        cell.number_format = money_fmt
        cell.border = border

    last_row = len(summary) + 1

    # --- Bar Chart: Revenue by Category ---
    bar = BarChart()
    bar.type = "col"
    bar.title = "Revenue by Category"
    bar.y_axis.title = "Revenue ($)"
    bar.y_axis.numFmt = "$#,##0"
    cats = Reference(ws_summary, min_col=1, min_row=2, max_row=last_row)
    vals = Reference(ws_summary, min_col=4, min_row=1, max_row=last_row)
    bar.add_data(vals, titles_from_data=True)
    bar.set_categories(cats)
    bar.shape = 4
    ws_summary.add_chart(bar, "F2")

    # --- Pie Chart: Units by Category ---
    pie = PieChart()
    pie.title = "Units Sold Distribution"
    pie_cats = Reference(ws_summary, min_col=1, min_row=2, max_row=last_row)
    pie_vals = Reference(ws_summary, min_col=3, min_row=2, max_row=last_row)
    pie.add_data(pie_vals)
    pie.set_categories(pie_cats)
    ws_summary.add_chart(pie, "F18")

    wb.save(output_path)
    print(f"Report saved to {output_path}")


# Usage:
# records = read_sales_csv("sales_data.csv")
# generate_report(records, "sales_report.xlsx")
```

### Problem 2: CSV Data Cleaning Pipeline

**Task**: Build a reusable pipeline that reads messy CSV data, applies cleaning
steps, validates rows, and writes both the cleaned output and an error log.

```python
import csv
import re
from datetime import datetime
from pathlib import Path


class CleaningPipeline:
    """Configurable CSV cleaning pipeline."""

    def __init__(self):
        self._steps = []
        self._validators = []

    def add_step(self, fn):
        """Add a transformation step. fn(row_dict) -> row_dict."""
        self._steps.append(fn)
        return self

    def add_validator(self, fn, message):
        """Add a validation rule. fn(row_dict) -> bool."""
        self._validators.append((fn, message))
        return self

    def run(self, input_path, output_path, error_path):
        clean_rows = []
        error_rows = []

        # Detect encoding
        encoding = self._detect_encoding(input_path)

        with open(input_path, "r", newline="", encoding=encoding) as f:
            # Detect dialect
            sample = f.read(8192)
            try:
                dialect = csv.Sniffer().sniff(sample)
            except csv.Error:
                dialect = "excel"
            f.seek(0)

            reader = csv.DictReader(f, dialect=dialect)
            fieldnames = reader.fieldnames

            for line_num, row in enumerate(reader, start=2):
                # Apply transformation steps
                transformed = dict(row)
                for step in self._steps:
                    try:
                        transformed = step(transformed)
                    except Exception as e:
                        error_rows.append({
                            **row,
                            "_line": line_num,
                            "_error": f"Transform error: {e}",
                        })
                        transformed = None
                        break

                if transformed is None:
                    continue

                # Apply validators
                errors = []
                for validator_fn, msg in self._validators:
                    try:
                        if not validator_fn(transformed):
                            errors.append(msg)
                    except Exception as e:
                        errors.append(f"{msg} (exception: {e})")

                if errors:
                    error_rows.append({
                        **transformed,
                        "_line": line_num,
                        "_error": "; ".join(errors),
                    })
                else:
                    clean_rows.append(transformed)

        # Write clean output
        if clean_rows:
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for row in clean_rows:
                    # Only write original fields
                    writer.writerow({k: row.get(k, "") for k in fieldnames})

        # Write error log
        if error_rows:
            err_fields = list(fieldnames) + ["_line", "_error"]
            with open(error_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=err_fields)
                writer.writeheader()
                for row in error_rows:
                    writer.writerow({k: row.get(k, "") for k in err_fields})

        return {
            "total": len(clean_rows) + len(error_rows),
            "clean": len(clean_rows),
            "errors": len(error_rows),
        }

    @staticmethod
    def _detect_encoding(path):
        try:
            import chardet
            with open(path, "rb") as f:
                raw = f.read(10000)
            result = chardet.detect(raw)
            return result.get("encoding", "utf-8")
        except ImportError:
            return "utf-8"


# --- Define reusable cleaning steps ---

def strip_whitespace(row):
    return {k: v.strip() if isinstance(v, str) else v for k, v in row.items()}

def normalize_email(row):
    if "email" in row and row["email"]:
        return {**row, "email": row["email"].lower().strip()}
    return row

def parse_date(field, fmt="%Y-%m-%d"):
    def _step(row):
        val = row.get(field, "")
        if val:
            # Try multiple formats
            for f in [fmt, "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]:
                try:
                    dt = datetime.strptime(val, f)
                    return {**row, field: dt.strftime("%Y-%m-%d")}
                except ValueError:
                    continue
            raise ValueError(f"Cannot parse date: {val}")
        return row
    return _step

def normalize_phone(row):
    if "phone" in row and row["phone"]:
        digits = re.sub(r"\D", "", row["phone"])
        if len(digits) == 10:
            formatted = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
            return {**row, "phone": formatted}
        elif len(digits) == 11 and digits[0] == "1":
            formatted = f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
            return {**row, "phone": formatted}
    return row


# --- Build and run pipeline ---

def clean_contacts(input_csv, output_csv, error_csv):
    pipeline = CleaningPipeline()

    # Transformation steps
    pipeline.add_step(strip_whitespace)
    pipeline.add_step(normalize_email)
    pipeline.add_step(normalize_phone)
    pipeline.add_step(parse_date("signup_date"))

    # Validation rules
    pipeline.add_validator(
        lambda r: r.get("name", "").strip() != "",
        "Name is required"
    )
    pipeline.add_validator(
        lambda r: re.match(r"^[\w.+-]+@[\w-]+\.[\w.]+$", r.get("email", "")),
        "Invalid email format"
    )
    pipeline.add_validator(
        lambda r: r.get("age", "").isdigit() and 0 < int(r["age"]) < 150,
        "Age must be between 1 and 149"
    )

    result = pipeline.run(input_csv, output_csv, error_csv)
    print(f"Processed {result['total']} rows: "
          f"{result['clean']} clean, {result['errors']} errors")
    return result


# Usage:
# clean_contacts("raw_contacts.csv", "clean_contacts.csv", "errors.csv")
```

---

## Appendix: Spreadsheet Processing Cheat Sheet

```
==============================================================================
                    SPREADSHEET PROCESSING CHEAT SHEET
==============================================================================

OPENPYXL (read/write .xlsx)
------------------------------------------------------------------------------
  from openpyxl import Workbook, load_workbook

  # Read
  wb = load_workbook("file.xlsx")              # Full access
  wb = load_workbook("f.xlsx", read_only=True) # Streaming (large files)
  wb = load_workbook("f.xlsx", data_only=True) # Cached values, not formulas
  ws = wb["SheetName"]                         # Access sheet
  ws = wb.active                               # Active sheet
  val = ws["A1"].value                         # Cell by reference
  val = ws.cell(row=1, column=1).value         # Cell by index (1-based)
  for row in ws.iter_rows(values_only=True):   # Iterate rows as tuples
  for row in ws.iter_rows():                   # Iterate rows as Cell objects
  ws.merged_cells.ranges                       # List merged ranges

  # Write
  wb = Workbook()
  ws = wb.active
  ws.title = "Sheet1"
  ws.append([1, 2, 3])                        # Append row
  ws["A1"] = "Hello"                           # Write cell
  ws.cell(row=1, column=1, value="Hello")      # Write cell (index)
  ws["B1"] = "=SUM(A1:A10)"                   # Write formula
  ws.merge_cells("A1:D1")                      # Merge cells
  ws.freeze_panes = "A2"                       # Freeze top row
  ws.auto_filter.ref = ws.dimensions           # Auto-filter
  wb.save("output.xlsx")

  # Formatting
  from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
  cell.font = Font(bold=True, size=14, color="FF0000")
  cell.fill = PatternFill(start_color="FFFF00", fill_type="solid")
  cell.border = Border(bottom=Side(style="thick"))
  cell.alignment = Alignment(horizontal="center", wrap_text=True)
  cell.number_format = "$#,##0.00"

XLSXWRITER (write-only .xlsx, richer features)
------------------------------------------------------------------------------
  import xlsxwriter
  wb = xlsxwriter.Workbook("file.xlsx")
  ws = wb.add_worksheet("Sheet1")
  fmt = wb.add_format({"bold": True, "bg_color": "#4472C4"})
  ws.write(row, col, value, fmt)               # 0-based indexing
  ws.write_formula(row, col, "=SUM(A1:A10)")
  ws.merge_range("A1:D1", "Title", fmt)
  ws.set_column("A:A", 20)                     # Column width
  ws.set_row(0, 30)                            # Row height
  ws.freeze_panes(1, 0)                        # Freeze after row 0
  ws.autofilter("A1:D100")
  chart = wb.add_chart({"type": "column"})
  ws.insert_chart("F2", chart)
  ws.add_sparkline("E2", {"range": "A2:D2"})
  ws.protect("password")
  wb.close()                                   # MUST close (not save)

CSV (stdlib)
------------------------------------------------------------------------------
  import csv

  # Read
  with open("f.csv", "r", newline="", encoding="utf-8") as f:
      reader = csv.reader(f)          # List of lists
      reader = csv.DictReader(f)      # List of dicts

  # Write
  with open("f.csv", "w", newline="", encoding="utf-8") as f:
      writer = csv.writer(f)
      writer.writerow(["a", "b"])     # Single row
      writer.writerows([[1,2],[3,4]]) # Multiple rows

      writer = csv.DictWriter(f, fieldnames=["a", "b"])
      writer.writeheader()
      writer.writerow({"a": 1, "b": 2})

  # Dialect detection
  dialect = csv.Sniffer().sniff(sample_text)

  # Encodings: "utf-8", "utf-8-sig" (BOM), "latin-1", "cp1252"

PANDAS
------------------------------------------------------------------------------
  import pandas as pd

  # Read
  df = pd.read_excel("f.xlsx", sheet_name="S1", engine="openpyxl")
  df = pd.read_csv("f.csv", encoding="utf-8-sig", dtype={"zip": str})
  dfs = pd.read_excel("f.xlsx", sheet_name=None)  # All sheets -> dict

  # Write
  df.to_excel("out.xlsx", index=False, sheet_name="Data")
  df.to_csv("out.csv", index=False)

  # Multi-sheet write
  with pd.ExcelWriter("out.xlsx", engine="openpyxl") as w:
      df1.to_excel(w, sheet_name="S1", index=False)
      df2.to_excel(w, sheet_name="S2", index=False)

  # Chunked reading (large files)
  for chunk in pd.read_csv("huge.csv", chunksize=50000):
      process(chunk)

  # Key operations
  df[df["col"] > 100]                          # Filter
  df.groupby("cat")["val"].sum()               # Group
  df.pivot_table(values="v", index="a", columns="b", aggfunc="sum")

POLARS
------------------------------------------------------------------------------
  import polars as pl

  # Eager
  df = pl.read_csv("f.csv")
  df = pl.read_excel("f.xlsx", sheet_name="S1")

  # Lazy (optimized query plan)
  lf = pl.scan_csv("huge.csv")
  result = (
      lf.filter(pl.col("x") > 100)
        .group_by("cat")
        .agg(pl.col("val").sum())
        .collect()                             # Execute
  )

  # Conversion
  pl_df = pl.from_pandas(pd_df)               # pandas -> polars
  pd_df = pl_df.to_pandas()                   # polars -> pandas

QUICK DECISION GUIDE
------------------------------------------------------------------------------
  Need to...                        Use...
  --------------------------------  ----------------------------------
  Read .xlsx with formatting        openpyxl
  Write .xlsx with rich charts      xlsxwriter
  Read/write .xlsx simply           openpyxl or pandas
  Process CSV (stdlib, no deps)     csv module
  Analyze tabular data              pandas
  Handle very large files (>1GB)    polars (or pandas with chunks)
  Read legacy .xls                  xlrd
  Read .ods (LibreOffice)           odfpy (via pandas engine)

==============================================================================
```
