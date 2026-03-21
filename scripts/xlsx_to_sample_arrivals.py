#!/usr/bin/env python3
"""Convert Aussies arrivals xlsx to sample-arrivals.csv. Use --print-js to emit DEFAULT_ARRIVAL_ROWS for index.html."""
import csv
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Install openpyxl: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent


def parse_date(s):
    s = str(s).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})$", s)
    if not m:
        return ""
    d, mo, y = m.groups()
    y = int(y)
    if y < 100:
        y += 2000
    return f"{y:04d}-{int(mo):02d}-{int(d):02d}"


def parse_time(val):
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        v = float(val)
        if 0 < v < 1:
            total = int(round(v * 86400))
            h, m = total // 3600, (total % 3600) // 60
            return f"{h:02d}:{m:02d}"
        iv = int(round(v))
        if 0 <= iv <= 235959:
            if iv <= 2359 and iv % 100 < 60:
                h, mi = iv // 100, iv % 100
                if h < 24:
                    return f"{h:02d}:{mi:02d}"
        return ""
    s = re.sub(r"\s+", "", str(val).strip().lower())
    s = re.sub(r"(hrs?|h)$", "", s)
    if re.match(r"^\d{1,2}:\d{2}$", s):
        a, b = s.split(":")
        return f"{int(a):02d}:{b}"
    if re.match(r"^\d{3,4}$", s):
        raw = s
        if len(raw) == 3:
            return f"0{raw[0]}:{raw[1:]}"
        return f"{raw[:2]}:{raw[2:]}"
    return ""


def fmt_mobile(val):
    if val is None or val == "":
        return ""
    s = str(val).strip()
    if re.fullmatch(r"\d+\.0", s):
        s = str(int(float(s)))
    s = re.sub(r"[^\d]", "", s)
    if len(s) == 9:
        s = "0" + s
    return s


def norm_flight(s):
    t = str(s).strip()
    if re.search(r"train", t, re.I):
        return "TRAIN"
    return t


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "Copy of Aussies airport arrivals.xlsx"
    if not xlsx.is_file():
        print(f"Missing file: {xlsx}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    _, *data = rows

    out = []
    for row in data:
        if not row or all(x is None or str(x).strip() == "" for x in row):
            continue
        name, d_raw, t_raw, flight_raw = row[0], row[1], row[2], row[3]
        mob = row[4] if len(row) > 4 else None
        name = str(name).strip() if name is not None else ""
        if not name:
            continue
        date = parse_date(d_raw)
        time = parse_time(t_raw)
        if not date or not time:
            continue
        flight = norm_flight(flight_raw) if flight_raw is not None else ""
        out.append(
            {
                "Name": name,
                "Mobile": fmt_mobile(mob),
                "Date": date,
                "Time": time,
                "Flight": flight,
                "Note": "",
            }
        )

    csv_path = ROOT / "sample-arrivals.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Name", "Mobile", "Date", "Time", "Flight", "Note"])
        w.writeheader()
        w.writerows(out)
    print(f"Wrote {len(out)} rows to {csv_path}")

    if "--print-js" in sys.argv:
        rows_js = [
            {
                "name": r["Name"],
                "mobile": r["Mobile"],
                "date": r["Date"],
                "time": r["Time"],
                "flight": r["Flight"],
                "note": r["Note"],
            }
            for r in out
        ]
        inner = ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in rows_js)
        print(f"const DEFAULT_ARRIVAL_ROWS = [\n{inner}\n];")


if __name__ == "__main__":
    main()
