"""
recommend.py — Content-Based Laptop Recommendation System
using Feature Engineering, Normalization, and Cosine Similarity.

Algorithm:
  1. Hard-filter laptops by budget (strict) + optional hard constraints.
  2. Normalize numerical features with MinMaxScaler.
  3. Build a user preference vector; compute cosine similarity.
  4. Compute purpose-weighted purpose_score via configurable weight tables.
  5. Blend into final hybrid score:
       final = preference(0.35) + performance(0.25) + value(0.20) + purpose(0.20)
  6. Return top-5 + best_match / best_value / best_performance cards.
"""

import os
import re
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "laptop.csv")

# ---------------------------------------------------------------------------
# Purpose-based weight tables
# Keys: gpu, cpu, ram, ssd, price_val  — must sum to 1.0
# ---------------------------------------------------------------------------
PURPOSE_WEIGHTS = {
    "Gaming":           {"gpu": 0.35, "cpu": 0.25, "ram": 0.15, "ssd": 0.10, "price_val": 0.15},
    "Programming":      {"gpu": 0.05, "cpu": 0.30, "ram": 0.30, "ssd": 0.15, "price_val": 0.20},
    "Machine Learning": {"gpu": 0.40, "cpu": 0.25, "ram": 0.20, "ssd": 0.10, "price_val": 0.05},
    "Video Editing":    {"gpu": 0.30, "cpu": 0.25, "ram": 0.25, "ssd": 0.15, "price_val": 0.05},
    "Student":          {"gpu": 0.05, "cpu": 0.20, "ram": 0.20, "ssd": 0.15, "price_val": 0.40},
    "Office Work":      {"gpu": 0.05, "cpu": 0.25, "ram": 0.25, "ssd": 0.15, "price_val": 0.30},
    "Business":         {"gpu": 0.05, "cpu": 0.25, "ram": 0.25, "ssd": 0.15, "price_val": 0.30},
    "Graphic Design":   {"gpu": 0.30, "cpu": 0.20, "ram": 0.25, "ssd": 0.15, "price_val": 0.10},
}
_DEFAULT_WEIGHTS = {"gpu": 0.20, "cpu": 0.25, "ram": 0.20, "ssd": 0.15, "price_val": 0.20}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_model_series(model_name: str, brand: str) -> str:
    """Derive a conservative model-series name for grouping variants."""
    name = str(model_name).strip()
    name = re.sub(r"\s+[Ll]aptop\s*$", "", name).strip()
    # Remove trailing SKU codes (6+ uppercase chars/digits, possibly hyphen-separated)
    name = re.sub(r"\s+[A-Z0-9]{6,}(-[A-Z0-9]+)*\s*$", "", name).strip()
    # Remove trailing 4-digit year
    name = re.sub(r"\s+\d{4}\s*$", "", name).strip()
    words = name.split()
    return " ".join(words[:3])


def gpu_score_fn(graphics_str: str) -> float:
    """Return a normalized GPU tier score in [0, 1]."""
    g = str(graphics_str).lower()
    if "rtx 40" in g or "rtx4" in g:          return 1.00
    if "rtx 30" in g or "rtx3" in g:          return 0.86
    if "rtx 20" in g or "rtx2" in g:          return 0.76
    if "rtx" in g:                             return 0.70
    if "gtx 1660" in g:                        return 0.65
    if "gtx 1650" in g:                        return 0.55
    if "gtx" in g:                             return 0.50
    if "radeon rx 7" in g or "radeon rx 6" in g: return 0.72
    if "radeon rx" in g:                       return 0.60
    if "radeon" in g and "vega" not in g:      return 0.38
    if "radeon vega" in g or "vega" in g:      return 0.25
    if "iris xe" in g:                         return 0.22
    if "uhd" in g or "intel" in g:            return 0.10
    if "amd" in g:                             return 0.20
    return 0.15


def load_and_enrich() -> pd.DataFrame:
    """Load the CSV, coerce types, drop dupes, add derived columns."""
    df = pd.read_csv(DATASET_PATH)

    required_num = ["ram(GB)", "ssd(GB)", "Hard Disk(GB)", "no_of_cores",
                    "no_of_threads", "spec_score", "price", "screen_size(inches)"]
    required_str = ["model_name", "brand", "processor_name", "Operating System",
                    "graphics", "resolution (pixels)"]

    for col in required_num:
        if col not in df.columns:
            df[col] = 0
        df[col] = pd.to_numeric(df[col], errors="coerce")
        med = df[col].median()
        df[col] = df[col].fillna(med if not pd.isna(med) else 0)

    for col in required_str:
        if col not in df.columns:
            df[col] = "Unknown"
        df[col] = df[col].fillna("Unknown").astype(str)

    # Drop rows with invalid prices
    df = df[df["price"] > 0]
    df = df.drop_duplicates(subset=["model_name", "price"]).reset_index(drop=True)

    # Derived columns
    df["model_series"] = df.apply(
        lambda r: normalize_model_series(r["model_name"], r["brand"]), axis=1
    )
    df["variant_id"] = df.index
    df["gpu_score"]   = df["graphics"].apply(gpu_score_fn)

    return df


# ---------------------------------------------------------------------------
# Pros / Cons generator
# ---------------------------------------------------------------------------

def _generate_pros_cons(row: pd.Series):
    pros, cons = [], []
    gpu   = str(row["graphics"]).lower()
    ram   = float(row["ram(GB)"])
    ssd   = float(row["ssd(GB)"])
    hdd   = float(row.get("Hard Disk(GB)", 0) or 0)
    spec  = float(row["spec_score"])
    price = float(row["price"])
    cores = int(row["no_of_cores"])

    # RAM
    if ram >= 32:
        pros.append(f"Excellent {int(ram)}GB RAM — heavy multitasking ready")
    elif ram >= 16:
        pros.append(f"{int(ram)}GB RAM — great for multitasking & development")
    elif ram >= 8:
        pros.append(f"{int(ram)}GB RAM — adequate for everyday use")
    else:
        cons.append(f"Only {int(ram)}GB RAM — may feel limited for modern apps")

    # GPU
    if "rtx 40" in gpu:
        pros.append("Latest NVIDIA RTX 40-series GPU — top-tier gaming & creative work")
    elif "rtx 30" in gpu:
        pros.append("NVIDIA RTX 30-series GPU — excellent for gaming and ML workloads")
    elif "rtx 20" in gpu:
        pros.append("NVIDIA RTX 20-series GPU — ray-tracing capable")
    elif "rtx" in gpu:
        pros.append("NVIDIA RTX GPU — ray-tracing and DLSS support")
    elif "gtx 1660" in gpu:
        pros.append("NVIDIA GTX 1660 — solid 1080p gaming performance")
    elif "gtx 1650" in gpu:
        pros.append("NVIDIA GTX 1650 — entry-level dedicated graphics")
    elif "gtx" in gpu:
        pros.append("NVIDIA GTX dedicated graphics card")
    elif "radeon rx 7" in gpu or "radeon rx 6" in gpu:
        pros.append("AMD Radeon RX GPU — strong AMD graphics performance")
    elif "radeon rx" in gpu:
        pros.append("AMD dedicated Radeon graphics")
    else:
        cons.append("Integrated graphics — not suitable for gaming or GPU-intensive tasks")

    # Storage
    if ssd >= 1024:
        pros.append(f"{int(ssd)}GB SSD — ample high-speed storage")
    elif ssd >= 512:
        pros.append(f"{int(ssd)}GB SSD — sufficient for most users")
    elif ssd > 0:
        cons.append(f"Only {int(ssd)}GB SSD — consider external storage")

    if hdd > 0:
        pros.append(f"Additional {int(hdd)}GB HDD for bulk storage")
    elif ssd < 256 and hdd == 0:
        cons.append("Very limited storage — no HDD backup available")

    # Spec score / CPU
    if spec >= 80:
        pros.append(f"High spec score ({int(spec)}) — premium performance tier")
    elif spec >= 65:
        pros.append(f"Good spec score ({int(spec)}) — solid mid-range performance")
    else:
        cons.append(f"Moderate spec score ({int(spec)}) — entry-level performance")

    if cores >= 14:
        pros.append(f"{cores}-core processor — excellent parallel performance")
    elif cores >= 8:
        pros.append(f"{cores}-core CPU — strong for development & creative tasks")
    elif cores <= 2:
        cons.append(f"Only {cores}-core processor — limited multitasking")

    # Safety nets
    if not pros:
        pros.append("Budget-friendly option")
    if not cons:
        if price > 120000:
            cons.append("Premium price point")
        else:
            cons.append("No significant weaknesses")

    return pros[:5], cons[:4]


# ---------------------------------------------------------------------------
# Why explanation
# ---------------------------------------------------------------------------

def _generate_why(row: pd.Series, user_prefs: dict, budget: float) -> str:
    parts = []
    model  = str(row["model_name"])
    price  = int(float(row["price"]))
    ram    = int(float(row["ram(GB)"]))
    gpu    = str(row["graphics"])
    spec   = int(float(row["spec_score"]))
    purpose = str(user_prefs.get("purpose") or "")

    parts.append(
        f"{model} was selected because it fits your ₹{int(budget):,} budget at ₹{price:,}"
    )
    ram_pref = user_prefs.get("ram")
    if ram_pref:
        try:
            if ram >= int(ram_pref):
                parts.append(f"meets your {ram_pref}GB RAM requirement with {ram}GB installed")
        except (ValueError, TypeError):
            pass
    elif ram >= 16:
        parts.append(f"comes with a generous {ram}GB RAM")

    graph_pref = str(user_prefs.get("graphics") or "").lower()
    g_lower    = gpu.lower()
    if graph_pref and graph_pref in g_lower:
        parts.append(f"has your preferred {gpu}")
    elif "rtx" in g_lower or "gtx" in g_lower or "radeon rx" in g_lower:
        parts.append(f"includes dedicated {gpu} for enhanced graphics")

    if purpose:
        parts.append(f"and is well-suited for {purpose} tasks")

    if spec >= 70:
        parts.append(f"backed by a strong spec score of {spec}")

    return ". ".join(parts) + "."


# ---------------------------------------------------------------------------
# Alternatives finder
# ---------------------------------------------------------------------------

def _find_alternatives(row: pd.Series, df: pd.DataFrame, budget: float):
    """Return (cheaper_alt, better_perf_alt) dicts or None."""
    price = float(row["price"])
    idx   = row.name

    pool = df.copy() if budget <= 0 else df[df["price"] <= budget].copy()

    # Cheap performance proxy using raw columns
    spec_max = pool["spec_score"].max() or 1
    ram_max  = pool["ram(GB)"].max() or 1
    ssd_max  = pool["ssd(GB)"].clip(lower=1).max() or 1
    pool["_perf"] = (
        pool["spec_score"] / spec_max * 0.35 +
        pool["ram(GB)"]   / ram_max   * 0.25 +
        pool["ssd(GB)"].clip(lower=1) / ssd_max * 0.15 +
        pool["graphics"].apply(gpu_score_fn) * 0.25
    )

    my_perf = pool.loc[idx, "_perf"] if idx in pool.index else pool["_perf"].mean()

    cheaper_df = pool[
        (pool.index != idx) &
        (pool["price"] <= price * 0.90) &
        (pool["_perf"] >= my_perf * 0.80)
    ]
    cheaper = None
    if not cheaper_df.empty:
        cr = cheaper_df.loc[cheaper_df["price"].idxmin()]
        cheaper = {
            "model_name": str(cr["model_name"]),
            "price":      int(cr["price"]),
            "laptop_id":  int(cr.name),
        }

    better_df = pool[
        (pool.index != idx) &
        (pool["_perf"] >= my_perf * 1.05)
    ]
    better = None
    if not better_df.empty:
        br = better_df.loc[better_df["_perf"].idxmax()]
        better = {
            "model_name": str(br["model_name"]),
            "price":      int(br["price"]),
            "laptop_id":  int(br.name),
        }

    return cheaper, better


# ---------------------------------------------------------------------------
# Suitable-for tags
# ---------------------------------------------------------------------------

def _suitable_for(row: pd.Series):
    tags = []
    gpu  = str(row["graphics"]).lower()
    ram  = float(row["ram(GB)"])
    spec = float(row["spec_score"])
    size = float(row["screen_size(inches)"])

    if "rtx" in gpu or "gtx" in gpu:
        tags += ["Gaming", "Video Editing"]
    if "radeon rx" in gpu:
        tags.append("Gaming")
    if ram >= 16:
        tags.append("Programming")
    if spec >= 70:
        tags.append("Machine Learning")
    if size <= 14.0:
        tags.append("Student")
    if not tags:
        tags = ["Office Work", "Business"]

    return list(dict.fromkeys(tags))[:4]   # deduplicate, keep order, max 4


# ---------------------------------------------------------------------------
# Build single result dict
# ---------------------------------------------------------------------------

def _build_result(row: pd.Series, user_prefs: dict, budget: float, df: pd.DataFrame) -> dict:
    cheaper, better = _find_alternatives(row, df, budget)
    pros, cons      = _generate_pros_cons(row)
    why             = _generate_why(row, user_prefs, budget)

    perf = round(min(100.0, float(row.get("performance_score", 0.5)) * 100))
    val  = round(min(100.0, float(row.get("value_score",       0.5)) * 100))
    rec  = round(float(row.get("recommendation_score", 75.0)), 1)

    return {
        "laptop_id":           int(row.name),
        "model_name":          str(row["model_name"]),
        "brand":               str(row["brand"]),
        "price":               int(float(row["price"])),
        "processor":           str(row["processor_name"]),
        "ram":                 int(float(row["ram(GB)"])),
        "ssd":                 int(float(row["ssd(GB)"])),
        "hdd":                 int(float(row.get("Hard Disk(GB)", 0) or 0)),
        "graphics":            str(row["graphics"]),
        "screen_size":         float(row["screen_size(inches)"]),
        "resolution":          str(row["resolution (pixels)"]),
        "os":                  str(row["Operating System"]),
        "no_of_cores":         int(float(row["no_of_cores"])),
        "no_of_threads":       int(float(row["no_of_threads"])),
        "spec_score":          int(float(row["spec_score"])),
        "recommendation_score": rec,
        "performance_score":   perf,
        "value_score":         val,
        "model_series":        str(row.get("model_series", "")),
        "suitable_for":        _suitable_for(row),
        "pros":                pros,
        "cons":                cons,
        "why_explanation":     why,
        "cheaper_alternative": cheaper,
        "better_alternative":  better,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def get_recommendations(user_prefs: dict):
    """
    Returns (results, best_match, best_value, best_performance).
    Each is a laptop dict; results is a list of up to 5.
    All four values are None / [] when no matches found.
    """
    df = load_and_enrich()

    # Parse user preferences
    try:
        budget = float(user_prefs.get("budget") or 0)
    except (ValueError, TypeError):
        budget = 50000.0
    if budget <= 0:
        budget = 50000.0

    ram_pref  = None
    ssd_pref  = None
    try:
        v = user_prefs.get("ram")
        if v:
            ram_pref = int(v)
    except (ValueError, TypeError):
        pass
    try:
        v = user_prefs.get("storage")
        if v:
            ssd_pref = int(v)
    except (ValueError, TypeError):
        pass

    brand_pref  = str(user_prefs.get("brand")     or "").strip().lower()
    proc_pref   = str(user_prefs.get("processor")  or "").strip().lower()
    graph_pref  = str(user_prefs.get("graphics")   or "").strip().lower()
    os_pref     = str(user_prefs.get("os")         or "").strip().lower()
    screen_pref = user_prefs.get("screen")
    res_pref    = user_prefs.get("resolution")
    purpose     = str(user_prefs.get("purpose")    or "").strip()

    # ---- Step 1: Hard filters ----
    f = df[df["price"] <= budget].copy()
    if f.empty:
        return [], None, None, None

    # RAM hard filter (if user explicitly requested minimum)
    if ram_pref:
        tmp = f[f["ram(GB)"] >= ram_pref]
        if not tmp.empty:
            f = tmp

    # Soft filters: skip if would leave result empty
    def _soft(frame, mask):
        tmp = frame[mask]
        return tmp if not tmp.empty else frame

    if ssd_pref:
        f = _soft(f, f["ssd(GB)"] >= ssd_pref)
    if brand_pref:
        f = _soft(f, f["brand"].str.lower() == brand_pref)
    if proc_pref:
        f = _soft(f, f["processor_name"].str.lower().str.contains(proc_pref, na=False))
    if graph_pref:
        f = _soft(f, f["graphics"].str.lower().str.contains(graph_pref, na=False))
    if os_pref:
        f = _soft(f, f["Operating System"].str.lower().str.contains(os_pref, na=False))

    if f.empty:
        return [], None, None, None

    f = f.copy()

    # ---- Step 2: Normalize numerical features ----
    num_cols = ["price", "spec_score", "ram(GB)", "ssd(GB)", "no_of_cores"]

    if len(f) >= 2:
        scaler = MinMaxScaler()
        scaled = scaler.fit_transform(f[num_cols].values)
        f["price_norm"] = scaled[:, 0]
        f["spec_norm"]  = scaled[:, 1]
        f["ram_norm"]   = scaled[:, 2]
        f["ssd_norm"]   = scaled[:, 3]
        f["cpu_norm"]   = scaled[:, 4]
    else:
        for c in ["price_norm", "spec_norm", "ram_norm", "ssd_norm", "cpu_norm"]:
            f[c] = 0.5

    f["price_inv_norm"] = 1.0 - f["price_norm"]   # low price → high value

    # ---- Cosine similarity (against ideal user vector) ----
    cos_features = ["spec_score", "ram(GB)", "ssd(GB)", "no_of_cores"]
    ideal_ram = float(ram_pref or f["ram(GB)"].mean())
    ideal_ssd = float(ssd_pref or f["ssd(GB)"].mean())
    ideal_vec = np.array([[
        f["spec_score"].max(),
        max(ideal_ram, f["ram(GB)"].mean()),
        max(ideal_ssd, f["ssd(GB)"].mean()),
        f["no_of_cores"].max(),
    ]])
    cos_scaler = MinMaxScaler()
    X_cos = cos_scaler.fit_transform(f[cos_features].values)
    q_cos = cos_scaler.transform(ideal_vec)
    f["cosine_sim"] = cosine_similarity(q_cos, X_cos)[0]

    # ---- GPU score ----
    f["gpu_score"] = f["graphics"].apply(gpu_score_fn)

    # ---- Step 3: Performance & Value scores ----
    f["performance_score"] = (
        f["spec_norm"]  * 0.30 +
        f["ram_norm"]   * 0.20 +
        f["ssd_norm"]   * 0.15 +
        f["cpu_norm"]   * 0.15 +
        f["gpu_score"]  * 0.20
    ).clip(0, 1)

    f["value_score"] = (
        f["performance_score"] * 0.60 +
        f["price_inv_norm"]    * 0.40
    ).clip(0, 1)

    # ---- Preference match score (categorical + cosine) ----
    def pref_match(row):
        score, total = 0.0, 0
        if brand_pref:
            total += 1
            if brand_pref == str(row["brand"]).lower():
                score += 1.0
        if proc_pref:
            total += 1
            if proc_pref in str(row["processor_name"]).lower():
                score += 1.0
        if graph_pref:
            total += 1
            if graph_pref in str(row["graphics"]).lower():
                score += 1.0
        if os_pref:
            total += 1
            if os_pref in str(row["Operating System"]).lower():
                score += 1.0
        if screen_pref:
            try:
                sp = float(screen_pref)
                ss = float(row["screen_size(inches)"])
                total += 1
                if (sp == 16 and ss >= 16.0) or \
                   (sp == 15 and 15.0 <= ss < 16.0) or \
                   (sp == 13 and ss < 15.0):
                    score += 1.0
            except (ValueError, TypeError):
                pass
        if res_pref:
            try:
                total += 1
                if str(res_pref) in str(row["resolution (pixels)"]):
                    score += 1.0
            except (ValueError, TypeError):
                pass
        if ram_pref:
            total += 1
            if float(row["ram(GB)"]) >= ram_pref:
                score += 1.0
        if ssd_pref:
            total += 1
            if float(row["ssd(GB)"]) >= ssd_pref:
                score += 1.0
        cat_score = score / total if total > 0 else 0.5
        # Blend categorical match with cosine similarity
        return cat_score * 0.60 + float(row["cosine_sim"]) * 0.40

    f["preference_score"] = f.apply(pref_match, axis=1).clip(0, 1)

    # ---- Step 4: Purpose-weighted score ----
    weights = PURPOSE_WEIGHTS.get(purpose, _DEFAULT_WEIGHTS)
    f["purpose_score"] = (
        f["gpu_score"]      * weights["gpu"] +
        f["spec_norm"]      * weights["cpu"] +
        f["ram_norm"]       * weights["ram"] +
        f["ssd_norm"]       * weights["ssd"] +
        f["price_inv_norm"] * weights["price_val"]
    ).clip(0, 1)

    # ---- Final hybrid score ----
    f["final_score"] = (
        f["preference_score"] * 0.35 +
        f["performance_score"] * 0.25 +
        f["value_score"]        * 0.20 +
        f["purpose_score"]      * 0.20
    ).clip(0, 1)

    # Scale to 65–97 for display
    fs_max, fs_min = f["final_score"].max(), f["final_score"].min()
    if fs_max > fs_min:
        f["recommendation_score"] = 65 + (f["final_score"] - fs_min) / (fs_max - fs_min) * 32
    else:
        f["recommendation_score"] = 80.0
    f["recommendation_score"] = f["recommendation_score"].round(1)

    # ---- Identify category winners ----
    best_match_idx  = f["final_score"].idxmax()
    best_value_idx  = f["value_score"].idxmax()
    best_perf_idx   = f["performance_score"].idxmax()

    # Top 5 by final_score
    top5 = f.sort_values("final_score", ascending=False).head(5)

    results = []
    for _, row in top5.iterrows():
        r = _build_result(row, user_prefs, budget, df)
        r["is_best_match"]       = bool(row.name == best_match_idx)
        r["is_best_value"]       = bool(row.name == best_value_idx)
        r["is_best_performance"] = bool(row.name == best_perf_idx)
        results.append(r)

    # Category cards
    bm = _build_result(f.loc[best_match_idx], user_prefs, budget, df)
    bm["category"] = "Best Match"

    bv = _build_result(f.loc[best_value_idx], user_prefs, budget, df)
    bv["category"] = "Best Value"
    bv["value_score_display"] = round(float(f.loc[best_value_idx, "value_score"]) * 100)

    bp = _build_result(f.loc[best_perf_idx], user_prefs, budget, df)
    bp["category"] = "Best Performance"
    bp["perf_score_display"] = round(float(f.loc[best_perf_idx, "performance_score"]) * 100)

    return results, bm, bv, bp


# ---------------------------------------------------------------------------
# Auxiliary query functions (used by Flask routes)
# ---------------------------------------------------------------------------

def get_unique_brands():
    """Return sorted list of unique brands for the brand dropdown."""
    df = pd.read_csv(DATASET_PATH)
    return sorted(df["brand"].dropna().unique().tolist())


def get_laptop_by_id(laptop_id: int):
    """Return a full laptop detail dict for a given dataframe index, or None."""
    df = load_and_enrich()
    if laptop_id not in df.index:
        return None
    return _build_result(df.loc[laptop_id], {}, 0, df)


def get_variants_by_series(model_series: str):
    """Return all laptop configs that share the same model_series."""
    df = load_and_enrich()
    variants_df = df[df["model_series"] == model_series].sort_values("price")
    rows = []
    for _, row in variants_df.iterrows():
        rows.append({
            "laptop_id":   int(row.name),
            "model_name":  str(row["model_name"]),
            "processor":   str(row["processor_name"]),
            "ram":         int(float(row["ram(GB)"])),
            "ssd":         int(float(row["ssd(GB)"])),
            "hdd":         int(float(row.get("Hard Disk(GB)", 0) or 0)),
            "graphics":    str(row["graphics"]),
            "screen_size": float(row["screen_size(inches)"]),
            "os":          str(row["Operating System"]),
            "price":       int(float(row["price"])),
        })
    return rows


def search_laptops(query: str):
    """Search by model name, brand, processor, or graphics (first 10 hits)."""
    df = load_and_enrich()
    q = str(query).lower().strip()
    if not q:
        return []
    mask = (
        df["model_name"].str.lower().str.contains(q, na=False)  |
        df["brand"].str.lower().str.contains(q, na=False)       |
        df["processor_name"].str.lower().str.contains(q, na=False) |
        df["graphics"].str.lower().str.contains(q, na=False)
    )
    hits = df[mask].head(10)
    return [
        {
            "laptop_id":   int(r.name),
            "model_name":  str(r["model_name"]),
            "brand":       str(r["brand"]),
            "price":       int(float(r["price"])),
            "processor":   str(r["processor_name"]),
            "ram":         int(float(r["ram(GB)"])),
            "ssd":         int(float(r["ssd(GB)"])),
            "hdd":         int(float(r.get("Hard Disk(GB)", 0) or 0)),
            "graphics":    str(r["graphics"]),
            "screen_size": float(r["screen_size(inches)"]),
            "os":          str(r["Operating System"]),
            "spec_score":  int(float(r["spec_score"])),
        }
        for _, r in hits.iterrows()
    ]
