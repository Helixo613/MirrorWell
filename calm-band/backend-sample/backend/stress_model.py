"""Optional EXPERIMENTAL stress-estimate model (logistic regression), pure Python.

Loaded from the JSON file named by env CALMBAND_MODEL. No file configured, or a missing/invalid file,
means NO model: load() returns None and the backend behaves exactly as it did before this module
existed (stressEstimate is null everywhere). No scikit-learn or numpy is needed at runtime.

score = 1 / (1 + exp(-(intercept + sum(coef[i] * (x[i] - scalerMean[i]) / scalerStd[i]))))
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

FEATURES = ["pulseRateBpm", "pulseRateSdBpm", "relativePulseBpm"]
LABEL = "experimental: not a medical measure"


def _finite(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _vec(d: dict, key: str):
    v = d.get(key)
    if not (isinstance(v, list) and len(v) == len(FEATURES) and all(_finite(x) for x in v)):
        raise ValueError(f"{key} must be {len(FEATURES)} finite numbers")
    return [float(x) for x in v]


def parse(d) -> dict:
    """Validate a model dict; returns the cleaned model or raises ValueError."""
    if not isinstance(d, dict):
        raise ValueError("model file is not a JSON object")
    if d.get("type") != "logistic_regression":
        raise ValueError("type must be 'logistic_regression'")
    if d.get("features") != FEATURES:
        raise ValueError(f"features must be exactly {FEATURES}")
    ver = d.get("modelVersion")
    if not (isinstance(ver, str) and ver):
        raise ValueError("modelVersion must be a non-empty string")
    mean, std, coef = _vec(d, "scalerMean"), _vec(d, "scalerStd"), _vec(d, "coef")
    if any(s <= 0 for s in std):
        raise ValueError("scalerStd must be > 0")
    if not _finite(d.get("intercept")):
        raise ValueError("intercept must be a finite number")
    thr = d.get("threshold", 0.5)
    if not _finite(thr):
        raise ValueError("threshold must be a finite number")
    ev = d.get("evaluation") if isinstance(d.get("evaluation"), dict) else {}
    ba, bs = ev.get("balancedAccuracyMean"), ev.get("balancedAccuracySd")
    return {"modelVersion": ver, "scalerMean": mean, "scalerStd": std, "coef": coef,
            "intercept": float(d["intercept"]), "threshold": float(thr),
            "evaluation": {"method": ev.get("method") if isinstance(ev.get("method"), str) else None,
                           "balancedAccuracyMean": float(ba) if _finite(ba) else None,
                           "balancedAccuracySd": float(bs) if _finite(bs) else None}}


def load(path: str | None) -> dict | None:
    """The model at `path`, or None (no path, missing file or invalid file; invalid ones are reported on stderr)."""
    if not path or not path.strip():
        return None
    p = Path(path.strip())
    if not p.is_file():
        # a relative path is also tried from the repository root (calm-band/backend-sample/backend -> repo)
        alt = Path(__file__).resolve().parents[3] / p
        if p.is_absolute() or not alt.is_file():
            print(f"[calm band] CALMBAND_MODEL file not found: {path}. Running WITHOUT a model.", file=sys.stderr)
            return None
        p = alt
    try:
        return parse(json.loads(p.read_text(encoding="utf-8")))
    except (OSError, ValueError, RecursionError) as e:
        print(f"[calm band] CALMBAND_MODEL {path} is invalid ({e}). Running WITHOUT a model.", file=sys.stderr)
        return None


def score(model: dict, pulse: float, pulse_sd: float, relative: float) -> float:
    z = model["intercept"]
    for x, m, s, c in zip((pulse, pulse_sd, relative), model["scalerMean"], model["scalerStd"], model["coef"]):
        z += c * (x - m) / s
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-min(z, 700.0)))
    e = math.exp(max(z, -700.0))
    return e / (1.0 + e)


def info(model: dict | None) -> dict | None:
    """What the reviewer sessions/summary say about the model (None when there is none)."""
    if model is None:
        return None
    ev = model["evaluation"]
    return {"modelVersion": model["modelVersion"], "method": ev["method"],
            "balancedAccuracyMean": ev["balancedAccuracyMean"], "balancedAccuracySd": ev["balancedAccuracySd"],
            "label": LABEL}
