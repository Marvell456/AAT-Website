# InsightFace Attendance Dashboard

A real-time attendance monitoring dashboard built with **React**, **Supabase**, and **TailwindCSS**, designed to track face recognition events using InsightFace.  
This dashboard displays **live detection history**, **daily attendance summaries**, and updates automatically through **Supabase Realtime** without needing a page refresh.

---

## 🚀 Features

### 🔹 Live History
- Streams face detection events in real time
- Shows timestamp, identity, confidence, and recognition status
- Automatically updates using **Supabase Realtime** (`postgres_changes`)

### 🔹 Daily Attendance
- Groups all detections from today by person
- Displays:
  - First seen time  
  - Last seen time  
  - Total detection count  
  - Known/Unknown (Present/Visitor) status
- Automatically sorted for cleaner UI

### 🔹 Smooth UI
- Clean Tailwind layout
- Sticky header
- Animated refresh button
- Light background separation for readability

---

## 🛠️ Tech Stack

- **React (Create-React-App)**
- **Supabase**
  - Database
  - Realtime Events
  - Dashboard API
- **TailwindCSS**
- **date-fns** (time formatting)
- **TypeScript-style type definitions** (optional for dev robustness)

---

## 📦 Getting Started

### 1️⃣ Clone the repository
```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
