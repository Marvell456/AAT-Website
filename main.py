# imports 
import os, time, random
import cv2
import numpy as np
import threading
from datetime import datetime
from insightface.app import FaceAnalysis
from supabase import create_client
from dotenv import load_dotenv

# Linking with Supabase 
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if SUPABASE_URL and not SUPABASE_URL.startswith("http"):
    SUPABASE_URL = f"https://{SUPABASE_URL}"

supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized.")
    except Exception as e:
        print(f"Supabase init failed: {e}")
else:
    print("SUPABASE_URL or KEY missing in .env")

# Variables Setup 
DET_SIZE = (160, 160)
SKIP_FRAMES = 3
SIM_THRESHOLD = 0.45
UNKNOWN_SAVE_COOLDOWN = 10  # Cooldown per unknown
KNOWN_LOG_COOLDOWN = 10     # Cooldown per known
MIN_DETECTION_SCORE = 0.5   # Minimum detection confidence (0-1)
BLUR_THRESHOLD = 180        # Minimum blur before saved (unknown only)
MIN_FRAME_EDGE_DISTANCE = 30
FOLDERS = ("faces", "unknown_faces")

# Insightface Model 
app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=DET_SIZE)

# Ensure folders exist
for d in FOLDERS:
    os.makedirs(d, exist_ok=True)

# Creates a dictionary filled with each known person's embeddings (512 unique numbers for each person)
def load_known_embeddings(folder="faces"):
    known = {}
    if not os.path.exists(folder): return known
    for name in os.listdir(folder):
        p = os.path.join(folder, name)
        if not os.path.isdir(p): continue
        embs = []
        for fn in os.listdir(p):
            img_path = os.path.join(p, fn)
            img = cv2.imread(img_path)
            if img is None: continue
            res = app.get(img)
            if not res: continue
            embs.append(res[0].embedding)
        if embs:
            # if one person has more than one image = average the embedding, so one person = one embedding
            known[name] = np.mean(embs, axis=0)
    return known

# Additional Variables Setup
known_embeddings = load_known_embeddings()
names = list(known_embeddings.keys()) # Ordered list of known perople
embs_array = np.array([known_embeddings[n] for n in names]) if names else np.empty((0, 512)) # Embeddings as a matrix -> Faster comparison against detected embeddings
embs_norm = np.linalg.norm(embs_array, axis=1) if names else np.empty((0,)) #  Pre-calculate the vector norms which will be used for cosine similarity later
person_colors = {n: tuple(random.randint(180, 255) for _ in range(3)) for n in names} # Random color for each person (for bouding box and label)

# Cooldown Dictionaries
unknown_cooldowns = {} # embedding bytes -> last saved time
known_cooldowns = {}   # name -> last logged time

# Compare detected embedding with all known and returns best match + similarity score
def cosine_sim_vectorized(emb):
    if embs_array.size == 0:
        return None, 0.0
    emb = np.asarray(emb, dtype=np.float32)
    emb_norm = np.linalg.norm(emb)
    if emb_norm == 0:
        return None, 0.0
    sims = embs_array.dot(emb) / (embs_norm * emb_norm + 1e-8) 
    idx = int(np.argmax(sims))
    return idx, float(sims[idx])

# check if image is blurry
def is_face_clear(img, thresh=BLUR_THRESHOLD):
    if img is None or img.size == 0: return False
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(g, cv2.CV_64F).var() > thresh # High value = sharp

def log_to_supabase_async(name, confidence, is_known):
    # Runs in background thread (boost FPS)
    def _send():
        if not supabase: return
        try:
            data = {
                "name": name,
                "confidence": float(confidence),
                "is_known": is_known
            }
            supabase.table("detections").insert(data).execute()
            print(f"⬆️ Logged to DB: {name}")
        except Exception as e:
            # Check for RLS or other errors
            print(f"Error logging to DB: {e}")
    
    thread = threading.Thread(target=_send)
    thread.daemon = True
    thread.start()

def save_unknown(face_crop, embedding, det_score):
    global unknown_cooldowns
    now = time.time()
    emb_key = embedding.tobytes()
    
    # Must be a real face
    if det_score < MIN_DETECTION_SCORE:
        return False
        
    # Per embedding cooldown check
    if emb_key in unknown_cooldowns:
        if now - unknown_cooldowns[emb_key] < UNKNOWN_SAVE_COOLDOWN:
            return False
            
    # Face must not be blurry
    if not is_face_clear(face_crop):
        return False
        
    # Update cooldown if checks are passed
    unknown_cooldowns[emb_key] = now
    
    # Save Image
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    fname = os.path.join("unknown_faces", f"Unknown_{timestamp}_{det_score:.3f}.jpg")
    if face_crop is not None and face_crop.size > 0:
        cv2.imwrite(fname, face_crop)
        print(f"Unknown person saved (clear & real face) -> {fname}")
        return True 
    return False

#  Main 
def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1080)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    
    if not cap.isOpened():
        print("Camera failed to open.")
        return
        
    print(f"Loaded {len(names)} known people. Running (press q to quit)...")
    
    frame_id = 0
    last_detections = []
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret: break
            frame = cv2.flip(frame, 1) # Flip camera
            frame_id += 1
            
            if frame_id % SKIP_FRAMES == 0:
                last_detections = app.get(frame) # Skip some frames to boost FPS
                
            for det in last_detections:
                # Extract face + create embedding
                box = det.bbox.astype(int)
                x1, y1, x2, y2 = box[0], box[1], box[2], box[3]
                emb = det.embedding
                det_score = det.det_score 
                
                best_idx, best_score = cosine_sim_vectorized(emb) # Compare against known embeddings
                
                # Default to unknown
                name = "Unknown"
                confidence = det_score
                
                if best_idx is not None and best_score >= SIM_THRESHOLD:
                    # If known person
                    name = names[best_idx]
                    confidence = best_score
                    color = person_colors.get(name, (255, 255, 255))
                    
                    # Supabase logging cooldown
                    now = time.time()
                    last_log = known_cooldowns.get(name, 0)
                    if now - last_log > KNOWN_LOG_COOLDOWN:
                        log_to_supabase_async(name, confidence, True)
                        known_cooldowns[name] = now

                    label = f"{name} {best_score*100:.1f}%"
                    
                else:
                    # If unknown
                    color = (0, 0, 255)
                    label = f"Unknown {det_score:.2f}"
                    
                    h, w = frame.shape[:2]
                    
                    # Face has to be inside frame before saving (detects if its touching the boundaries)
                    if (x1 < MIN_FRAME_EDGE_DISTANCE or y1 < MIN_FRAME_EDGE_DISTANCE or 
                        x2 > w - MIN_FRAME_EDGE_DISTANCE or y2 > h - MIN_FRAME_EDGE_DISTANCE):
                        print("Face cutoff")
                        continue 

                    # Create a crop with padding
                    x1c, y1c = max(0, x1-30), max(0, y1-30)
                    x2c, y2c = min(w, x2+30), min(h, y2+60)
                    crop = frame[y1c:y2c, x1c:x2c]
                    
                    # save_unknown function: must be a face, not blurry, has a cooldown
                    if save_unknown(crop, emb, det_score):
                        log_to_supabase_async("Unknown", det_score, False)


                # Display bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, max(20, y1 - 8)),
                cv2.FONT_HERSHEY_DUPLEX, 0.8, color, 2, cv2.LINE_AA)
                            
            cv2.imshow("Face Recognition", frame)
            
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
                
    finally:
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()