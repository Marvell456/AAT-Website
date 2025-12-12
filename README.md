This is an excellent project combining computer vision (InsightFace), real-time processing, and database logging (Supabase). A well-structured README is essential for sharing it\!

Here is a comprehensive README drafted for your project.

-----

# 🤖 InsightFace Real-Time Attendance Dashboard

A full-stack, real-time application for monitoring and logging attendance using local video feed and facial recognition. It utilizes **InsightFace** for high-accuracy face detection and embedding, and **Supabase** for secure, real-time logging and display.

The project consists of two main parts:

1.  **Backend (`main.py`):** The Python script that performs video processing and logging.
2.  **Frontend (`AttendanceDashboard.tsx`):** The Next.js/React dashboard for viewing attendance history and daily records.

## 🌟 Features

  * **Real-Time Processing:** Uses OpenCV and InsightFace for low-latency face recognition.
  * **Vectorized Comparison:** Uses pre-calculated embeddings and vectorized cosine similarity for fast matching against known faces.
  * **Smart Logging:** Uses a cooldown mechanism for known users to prevent spamming the database.
  * **Intelligent Unknown Face Curation:** Automatically saves crops of unknown, clear faces (checking for blurriness and frame-edge distance) with a cooldown to build a dataset for future enrollment.
  * **Asynchronous Database Writing:** Logs detections to Supabase in a background thread to maintain high FPS in the main video loop.
  * **Live Dashboard:** A web interface built with Next.js/TypeScript/Tailwind CSS displays all logged events in real-time.

## 🛠️ Prerequisites

To run this project, you need:

### Backend (Python)

  * Python 3.8+
  * A local webcam or video input device.
  * **Supabase Project:** A working Supabase instance (used for the database/logging).
  * **Known Faces:** A collection of labeled images of known individuals (see "Setup: Enroll Known Faces").

### Frontend (Dashboard)

  * Node.js and npm/yarn/pnpm.
  * Vercel account (recommended for easy deployment).

## 💻 Local Setup (Backend)

### 1\. Project Initialization

```bash
# Clone the repository (if applicable) or create the project directory
mkdir insightface-attendance
cd insightface-attendance

# Create the necessary data folders
mkdir faces
mkdir unknown_faces
```

### 2\. Install Python Dependencies

You will need the following Python libraries. It is highly recommended to use a virtual environment (`venv`).

```bash
pip install opencv-python numpy python-dotenv supabase insightface onnxruntime
```

### 3\. Enroll Known Faces

To teach the system who is "known," you must provide labeled images:

1.  In the root directory, create a folder named `faces`.
2.  Inside `faces`, create a sub-folder for **each known person** using their name (e.g., `faces/Alice`).
3.  Place 1 to 5 clear, high-quality images of that person inside their respective folder.

Example structure:

```
insightface-attendance/
├── faces/
│   ├── Alice/
│   │   ├── alice_1.jpg
│   │   └── alice_2.jpg
│   └── Bob/
│       ├── bob_a.png
│       └── bob_b.png
└── main.py
```

### 4\. Configure Supabase Secrets

Create a file named **`.env`** in the root directory and add your Supabase credentials:

```ini
# .env file
SUPABASE_URL="[YOUR_SUPABASE_PROJECT_URL]"
SUPABASE_KEY="[YOUR_SUPABASE_ANON_KEY]"
```

### 5\. Run the System

Execute the main Python script:

```bash
python main.py
```

A window will open displaying your camera feed, bounding boxes, and recognition results. Press `q` to quit.

## ⚙️ Database Structure (Supabase)

The Python script logs all detections to a single table named **`detections`**.

You must create this table in your Supabase dashboard with the following schema:

| Column Name | Type | Constraint | Description |
| :--- | :--- | :--- | :--- |
| `id` | `bigint` | Primary Key | Auto-incrementing ID. |
| `created_at` | `timestamptz` | Default: `now()` | Automatic timestamp of the detection. |
| `name` | `text` | Not Null | The recognized name (e.g., "Alice" or "Unknown"). |
| `confidence` | `double precision`| Not Null | The matching score (similarity or detection score). |
| `is_known` | `boolean` | Not Null | `TRUE` if the person is registered, `FALSE` otherwise. |

> **⚠️ Security Note:** Ensure **Row Level Security (RLS)** is enabled on the `detections` table to prevent unauthorized writes or reads, especially if deploying the dashboard publicly.

## 🖥️ Frontend Deployment (Dashboard)

The dashboard (`AttendanceDashboard.tsx`) is designed to be part of a standard Next.js application.

1.  **Next.js Project:** Ensure you have a Next.js project initialized and the `.tsx` file is in the correct location (e.g., `app/page.tsx`).
2.  **Dependencies:** Install Tailwind CSS and `date-fns` for the dashboard UI.
    ```bash
    npm install tailwindcss date-fns
    ```
3.  **Vercel Deployment:** The easiest way to publish the dashboard is via Vercel:
      * Push your Next.js project to GitHub.
      * Import the repository into Vercel.
      * **Crucially:** Add the Supabase keys as **Environment Variables** in Vercel settings (using the `NEXT_PUBLIC_` prefix):
          * `NEXT_PUBLIC_SUPABASE_URL`
          * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4.  **Supabase CORS:** After deployment, remember to add your Vercel URL (e.g., `https://my-dashboard.vercel.app`) to your Supabase project's **API Settings** $\rightarrow$ **CORS Origins** to allow the web app to connect to the database.

## 🧠 Project Logic Highlights

The core strength of the `main.py` script lies in its optimized face processing loop:

| Logic Point | Function | Benefit |
| :--- | :--- | :--- |
| **FPS Boost** | `frame_id % SKIP_FRAMES == 0` | Only runs the heavy InsightFace detection/embedding every 3rd frame, boosting the overall frame rate. |
| **Fast Matching** | `cosine_sim_vectorized(emb)` | Avoids Python loops for comparison by using highly optimized **NumPy** vector operations against the pre-calculated `embs_array`. |
| **Data Curation** | `save_unknown()` | Prevents the `unknown_faces` folder from filling up with blurry, partial, or duplicate detections, providing a clean dataset for manual review and enrollment. |
| **Non-Blocking IO** | `log_to_supabase_async()` | Uses Python `threading` to perform the slow network operation (sending data to Supabase) in the background, ensuring the video feed never freezes. |