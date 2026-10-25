
import io
import os

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from transformers import pipeline

app = FastAPI(title="CivicLens AI Service", version="0.1.0")

MODEL_ID = os.getenv(
    "CIVICLENS_MODEL",
    "openai/clip-vit-base-patch32",
)

CANDIDATES = [
    "a photograph of a pothole in a road",
    "a photograph of damaged road pavement",
    "a photograph of a broken streetlight",
    "a photograph of overflowing garbage bins",
    "a photograph of a blocked drainage system",
    "a photograph of a water leak",
    "a photograph of a normal street without visible damage",
]

classifier = None


@app.on_event("startup")
def load_model():
    global classifier
    classifier = pipeline(
        "zero-shot-image-classification",
        model=MODEL_ID,
    )


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "CivicLens AI",
        "model": MODEL_ID,
        "loaded": classifier is not None,
    }


@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    if file.content_type not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        raise HTTPException(400, "Unsupported image type")

    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "Image exceeds 5 MB")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Invalid image file")

    try:
        results = classifier(image, candidate_labels=CANDIDATES)
    except Exception as error:
        raise HTTPException(500, "Image classification failed") from error

    best = results[0]
    label_to_category = {
        CANDIDATES[0]: "pothole",
        CANDIDATES[1]: "road_damage",
        CANDIDATES[2]: "streetlight",
        CANDIDATES[3]: "garbage",
        CANDIDATES[4]: "drainage",
        CANDIDATES[5]: "water_supply",
        CANDIDATES[6]: "other",
    }

    return {
        "predictedCategory": label_to_category[best["label"]],
        "confidence": float(best["score"]),
        "model": MODEL_ID,
        "provisional": True,
        "topPredictions": [
            {
                "label": label_to_category[item["label"]],
                "confidence": float(item["score"]),
            }
            for item in results[:3]
        ],
    }
