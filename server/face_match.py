import argparse
import json
import os
import sys

os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

import face_recognition


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"}


def normalize_path(file_path):
    return os.path.normpath(os.path.abspath(file_path))


def is_image_file(file_path):
    _, ext = os.path.splitext(file_path.lower())
    return ext in IMAGE_EXTENSIONS


def load_face_encodings(image_path):
    try:
        image = face_recognition.load_image_file(image_path)
        return face_recognition.face_encodings(image)
    except Exception as error:
        print(f"Warning: failed to load face encodings for {image_path}: {error}", file=sys.stderr)
        return []


def find_matches(selfie_path, db_path, threshold=0.6, top_n=12):
    selfie_path = normalize_path(selfie_path)
    db_path = normalize_path(db_path)

    selfie_encodings = load_face_encodings(selfie_path)
    if not selfie_encodings:
        return {"matches": []}

    target_encoding = selfie_encodings[0]
    matches = []

    for root, _, files in os.walk(db_path):
        for file_name in files:
            candidate_path = normalize_path(os.path.join(root, file_name))
            if candidate_path == selfie_path or not is_image_file(candidate_path):
                continue

            candidate_encodings = load_face_encodings(candidate_path)
            if not candidate_encodings:
                continue

            distances = face_recognition.face_distance(candidate_encodings, target_encoding)
            if len(distances) == 0:
                continue

            matches.append({"path": candidate_path, "distance": float(min(distances))})

    matches.sort(key=lambda item: item["distance"])
    accepted = [match for match in matches if match["distance"] <= threshold]
    if not accepted:
        accepted = matches[:top_n]
    else:
        accepted = accepted[:top_n]

    return {"matches": accepted}


def main():
    parser = argparse.ArgumentParser(description="Run face recognition matching against uploaded media.")
    parser.add_argument("selfie", help="Path to the selfie image file.")
    parser.add_argument("uploads_dir", help="Path to the uploads directory containing media.")
    parser.add_argument("--threshold", type=float, default=0.6, help="Distance threshold for match acceptance.")
    parser.add_argument("--top-n", type=int, default=12, help="Maximum number of results to return.")
    args = parser.parse_args()

    try:
        matches = find_matches(args.selfie, args.uploads_dir, threshold=args.threshold, top_n=args.top_n)
        print("__FACE_MATCH_RESULT__" + json.dumps(matches))
    except Exception as error:
        error_payload = {"error": str(error)}
        print("__FACE_MATCH_RESULT__" + json.dumps(error_payload))
        raise


if __name__ == "__main__":
    main()
