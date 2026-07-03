import os
import io
import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image
from flask import Flask, request, jsonify, render_template


app = Flask(__name__)

# ── Device ──────────────────────────────────────────────────────────────────
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Class labels (same order as ImageFolder would produce) ───────────────────
CLASS_NAMES = [
    "Apple Fresh", "Apple Rotten",
    "Banana Fresh", "Banana Rotten",
    "Strawberry Fresh", "Strawberry Rotten",
]

FRUIT_EMOJI = {
    "Apple":      "🍎",
    "Banana":     "🍌",
    "Strawberry": "🍓",
}

# ── Confidence threshold for out-of-distribution detection (0-100) ───────────
CONFIDENCE_THRESHOLD = 65.0


# ── ViT implementation (must match training exactly) ─────────────────────────
class PatchEmbedding(nn.Module):
    def __init__(self, img_size=224, patch_size=16, in_channels=3, embed_dim=768):
        super().__init__()
        self.num_patches = (img_size // patch_size) ** 2
        self.proj = nn.Conv2d(in_channels, embed_dim, kernel_size=patch_size, stride=patch_size)

    def forward(self, x):
        x = self.proj(x)                      # (B, E, H/P, W/P)
        x = x.flatten(2).transpose(1, 2)      # (B, N, E)
        return x


class Attention(nn.Module):
    """Custom attention matching training code (qkv / proj naming)."""
    def __init__(self, embed_dim=768, num_heads=12, dropout=0.0):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim  = embed_dim // num_heads
        self.scale     = self.head_dim ** -0.5
        self.qkv  = nn.Linear(embed_dim, embed_dim * 3)
        self.proj = nn.Linear(embed_dim, embed_dim)
        self.attn_drop = nn.Dropout(dropout)
        self.proj_drop = nn.Dropout(dropout)

    def forward(self, x):
        B, N, C = x.shape
        qkv = self.qkv(x).reshape(B, N, 3, self.num_heads, self.head_dim)
        qkv = qkv.permute(2, 0, 3, 1, 4)          # (3, B, H, N, D)
        q, k, v = qkv.unbind(0)
        attn = (q @ k.transpose(-2, -1)) * self.scale
        attn = attn.softmax(dim=-1)
        attn = self.attn_drop(attn)
        x = (attn @ v).transpose(1, 2).reshape(B, N, C)
        x = self.proj_drop(self.proj(x))
        return x


class MLP(nn.Module):
    """MLP matching training code (fc1 / fc2 naming)."""
    def __init__(self, embed_dim=768, mlp_ratio=4.0, dropout=0.1):
        super().__init__()
        hidden = int(embed_dim * mlp_ratio)
        self.fc1  = nn.Linear(embed_dim, hidden)
        self.act  = nn.GELU()
        self.drop1= nn.Dropout(dropout)
        self.fc2  = nn.Linear(hidden, embed_dim)
        self.drop2= nn.Dropout(dropout)

    def forward(self, x):
        return self.drop2(self.fc2(self.drop1(self.act(self.fc1(x)))))


class TransformerBlock(nn.Module):
    def __init__(self, embed_dim=768, num_heads=12, mlp_ratio=4.0, dropout=0.1):
        super().__init__()
        self.norm1 = nn.LayerNorm(embed_dim)
        self.attn  = Attention(embed_dim, num_heads, dropout)
        self.norm2 = nn.LayerNorm(embed_dim)
        self.mlp   = MLP(embed_dim, mlp_ratio, dropout)

    def forward(self, x):
        x = x + self.attn(self.norm1(x))
        x = x + self.mlp(self.norm2(x))
        return x


class VisionTransformer(nn.Module):
    def __init__(self, img_size=224, patch_size=16, in_channels=3,
                 num_classes=6, embed_dim=768, depth=12,
                 num_heads=12, mlp_ratio=4.0, dropout=0.1):
        super().__init__()
        self.patch_embed = PatchEmbedding(img_size, patch_size, in_channels, embed_dim)
        num_patches = self.patch_embed.num_patches

        self.cls_token = nn.Parameter(torch.zeros(1, 1, embed_dim))
        self.pos_embed = nn.Parameter(torch.zeros(1, num_patches + 1, embed_dim))
        self.dropout   = nn.Dropout(dropout)

        self.blocks = nn.ModuleList([
            TransformerBlock(embed_dim, num_heads, mlp_ratio, dropout)
            for _ in range(depth)
        ])

        self.norm = nn.LayerNorm(embed_dim)
        self.head = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        B = x.shape[0]
        x = self.patch_embed(x)
        cls = self.cls_token.expand(B, -1, -1)
        x   = torch.cat([cls, x], dim=1)
        x   = self.dropout(x + self.pos_embed)
        for blk in self.blocks:
            x = blk(x)
        x = self.norm(x[:, 0])
        return self.head(x)


# ── Load model ───────────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "vit.pth")

model = VisionTransformer(num_classes=len(CLASS_NAMES))
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.to(DEVICE)
model.eval()
print(f"[OK] Model loaded from {MODEL_PATH}  |  device: {DEVICE}")

# ── Gatekeeper Model (ImageNet MobileNet-V3) ──────────────────────────────────
GATEKEEPER_MODEL = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT)
GATEKEEPER_MODEL.to(DEVICE)
GATEKEEPER_MODEL.eval()
print("[OK] Gatekeeper model (MobileNet-V3) loaded successfully.")

VALID_IMAGENET_INDICES = {948, 949, 954}  # 948: Granny Smith (apple), 949: strawberry, 954: banana

# ImageNet indices of OTHER fruits/foods that are NOT supported by our ViT model
OTHER_FRUIT_INDICES = {
    383,   # mango
    945,   # bell pepper (looks like fruit)
    950,   # orange
    951,   # lemon
    952,   # fig
    953,   # pineapple
    955,   # jackfruit
    956,   # custard apple
    957,   # pomegranate
    959,   # acorn squash
    # Common misclassifications
    953,   # pineapple (duplicate for safety)
}

# Minimum combined probability required for valid fruit classes to pass gatekeeper
GATEKEEPER_MIN_PROB = 0.15  # 15%


# ── Preprocessing ─────────────────────────────────────────────────────────────
TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    try:
        img_bytes = file.read()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        return jsonify({"error": f"Cannot read image: {str(e)}"}), 400

    tensor = TRANSFORM(img).unsqueeze(0).to(DEVICE)

    # ── Tahap 1: Gatekeeper Check ──
    with torch.no_grad():
        gatekeeper_logits = GATEKEEPER_MODEL(tensor)
        gatekeeper_probs = torch.softmax(gatekeeper_logits, dim=1)[0]

    # Hitung total probabilitas kelas buah yang valid (apel, pisang, stroberi)
    valid_prob = sum(gatekeeper_probs[i].item() for i in VALID_IMAGENET_INDICES)
    # Hitung total probabilitas kelas buah lain yang TIDAK didukung
    other_fruit_prob = sum(gatekeeper_probs[i].item() for i in OTHER_FRUIT_INDICES)

    # Cek kelas tertinggi dari top-1 prediksi
    top1_idx = gatekeeper_probs.argmax().item()

    # TOLAK jika:
    # 1. Kelas tertinggi adalah buah lain yang tidak didukung secara meyakinkan (mencegah jeruk/mangga masuk)
    # 2. Probabilitas buah lain jauh lebih besar dari buah valid
    # Catatan: Kita hapus syarat ketat "harus terdeteksi sebagai apel/pisang/stroberi" 
    # karena buah busuk seringkali bentuknya sudah hancur/berjamur sehingga tidak dikenali oleh MobileNet
    is_rejected = (
        top1_idx in OTHER_FRUIT_INDICES
        or (other_fruit_prob > valid_prob and other_fruit_prob > 0.20)
    )

    if is_rejected:
        zero_probs = [
            {"label": name, "prob": 0.0}
            for name in CLASS_NAMES
        ]
        return jsonify({
            "label":      "Tidak Dikenali",
            "fruit":      "Tidak Dikenali",
            "condition":  "Unknown",
            "confidence": 0.0,
            "emoji":      "❓",
            "all_probs":  zero_probs,
            "unrecognized": True
        })

    # ── Tahap 2: Custom ViT Predict ──
    with torch.no_grad():
        logits = model(tensor)
        probs  = torch.softmax(logits, dim=1)[0]

    top_prob, top_idx = probs.max(0)
    label = CLASS_NAMES[top_idx.item()]
    confidence = round(top_prob.item() * 100, 2)

    fruit, condition = label.rsplit(" ", 1)
    emoji = FRUIT_EMOJI.get(fruit, "🍑")

    all_probs = [
        {"label": CLASS_NAMES[i], "prob": round(probs[i].item() * 100, 2)}
        for i in range(len(CLASS_NAMES))
    ]
    all_probs.sort(key=lambda x: x["prob"], reverse=True)

    # Check if confidence is below threshold
    if confidence < CONFIDENCE_THRESHOLD:
        return jsonify({
            "label":      "Tidak Dikenali",
            "fruit":      "Tidak Dikenali",
            "condition":  "Unknown",
            "confidence": confidence,
            "emoji":      "❓",
            "all_probs":  all_probs,
            "unrecognized": True
        })

    return jsonify({
        "label":      label,
        "fruit":      fruit,
        "condition":  condition,
        "confidence": confidence,
        "emoji":      emoji,
        "all_probs":  all_probs,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
