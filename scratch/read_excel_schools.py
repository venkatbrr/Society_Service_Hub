import pandas as pd
import json

file_path = r"C:\Users\venka\Downloads\West_Hyderabad_Schools_Directory_Kokapet_to_Patancheru.xlsx"

try:
    xl = pd.ExcelFile(file_path)
    print("Sheet names:", xl.sheet_names)
    
    for sheet in xl.sheet_names:
        print(f"\n--- Sheet: {sheet} ---")
        df = xl.parse(sheet)
        print("Columns:", df.columns.tolist())
        print("Row count:", len(df))
        print("First 3 rows:")
        print(df.head(3).to_dict(orient='records'))
except Exception as e:
    print("Error reading excel:", e)
