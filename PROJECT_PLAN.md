# KTS Wool Inventory Management System

## Project Overview
An offline Windows desktop software for managing raw wool and dyed color code inventory at Kumbeshwar Technical School (KTS), Lalitpur.

## Tech Stack
- Frontend: React + TypeScript + Vite
- Desktop Runtime: Electron
- Database: SQLite (`better-sqlite3`)
- Styling: Tailwind CSS + shadcn/ui

## Business & Data Architecture
1. **Raw Materials (Parent Level):** Bulk wool entries (e.g., "4 Count Wool White").
2. **Color Codes (Child Level):** Specific shade codes under a raw material (e.g., "MS-1", "MS-2").
3. **Dual Manual Ledger System:** Both Raw Materials and Color Codes have independent manual ledgers using the exact same columns:
   `Date` | `Description` | `Buyer` | `Lot Number` | `Rack No` | `Receiver` | `Issue (-)` | `Receive (+)` | `Balance` | `Remark`
4. **Weight Loss Tracking:** Support for `DRYING_LOSS` / moisture shrinkage adjustments that reduce stock without breaking ledger history.
5. **High Performance:** Must handle 35,000+ entries using database indexing on `(entity_type, entity_id, transaction_date)`.