"""Train stress_lr_v1 on WESAD wrist BVP (Empatica E4). Baseline(1) vs stress(2).
Usage: python train.py <WESAD_dir> <out_dir>
Data: Schmidt et al., "Introducing WESAD", ICMI 2018 (non-commercial scientific use). Data is never committed.
"""
import sys, pickle, json, datetime, numpy as np, pandas as pd
from scipy.signal import butter, filtfilt, find_peaks
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import balanced_accuracy_score, f1_score
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

FS, LFS = 64, 700
WIN, STEP, MIN_IBI = 60, 15, 20
FEATS = ["pulseRateBpm", "pulseRateSdBpm", "relativePulseBpm"]
SUBJ = [2,3,4,5,6,7,8,9,10,11,13,14,15,16,17]  # S12 not in the public release

def beats(bvp):
    b, a = butter(3, [0.5, 8], btype="band", fs=FS)
    x = filtfilt(b, a, bvp)
    x = (x - x.mean()) / (x.std() + 1e-9)
    pk, _ = find_peaks(x, distance=int(0.33 * FS), prominence=0.5)
    return pk / FS  # seconds

def subject_windows(path, sid):
    d = pickle.load(open(path, "rb"), encoding="latin1")  # official WESAD pickle
    bvp = np.asarray(d["signal"]["wrist"]["BVP"]).ravel()
    lab = np.asarray(d["label"]).ravel()
    bt = beats(bvp)
    ibi = np.diff(bt); mid = bt[1:]
    ok = (ibi >= 0.33) & (ibi <= 1.5)          # 40-180 bpm
    # reject intervals that jump >30% from the local median (missed / double beats)
    med = pd.Series(ibi).rolling(7, center=True, min_periods=3).median().values
    ok &= np.abs(ibi - med) <= 0.3 * med
    ibi, mid = ibi[ok], mid[ok]
    pulse = 60.0 / ibi
    rows = []
    dur = len(bvp) / FS
    t = 0
    while t + WIN <= dur:
        l = lab[int(t*LFS):int((t+WIN)*LFS)]
        if l.size and (l == l[0]).all() and l[0] in (1, 2):
            m = (mid >= t) & (mid < t + WIN)
            if m.sum() >= MIN_IBI:
                p = pulse[m]
                rows.append(dict(subject=sid, label=int(l[0] == 2), t=t,
                                 pulseRateBpm=p.mean(), pulseRateSdBpm=p.std(ddof=1)))
        t += STEP
    df = pd.DataFrame(rows)
    base = df.loc[df.label == 0, "pulseRateBpm"].mean()
    df["relativePulseBpm"] = df.pulseRateBpm - base
    return df

def best_threshold(x, y):
    cands = np.unique(x); best = (-1, 0)
    for c in cands:
        s = balanced_accuracy_score(y, (x > c).astype(int))
        if s > best[0]: best = (s, c)
    return best[1]

def sc(y, p): return balanced_accuracy_score(y, p), f1_score(y, p, zero_division=0)

def main(wdir, out):
    df = pd.concat([subject_windows(f"{wdir}/S{s}/S{s}.pkl", s) for s in SUBJ], ignore_index=True)
    print(df.groupby(["subject", "label"]).size().unstack())
    print("windows:", len(df), "stress share:", df.label.mean())
    F3, F2 = FEATS, FEATS[:2]
    recs = []
    for s in SUBJ:
        tr, te = df[df.subject != s], df[df.subject == s]
        ytr, yte = tr.label.values, te.label.values
        def add(name, feats, p): 
            ba, f1 = sc(yte, p); recs.append(dict(subject=s, model=name, features=feats, bal_acc=ba, f1=f1))
        add("majority", "n/a", np.full(len(yte), int(ytr.mean() >= .5)))
        th = best_threshold(tr.relativePulseBpm.values, ytr)
        add("threshold rule", "relativePulseBpm", (te.relativePulseBpm.values > th).astype(int))
        th2 = best_threshold(tr.pulseRateBpm.values, ytr)
        add("threshold rule", "pulseRateBpm (no relative)", (te.pulseRateBpm.values > th2).astype(int))
        for fs, tag in ((F3, "3 features"), (F2, "without relativePulseBpm")):
            lr = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)).fit(tr[fs], ytr)
            add("logistic regression", tag, lr.predict(te[fs]))
            rf = RandomForestClassifier(200, min_samples_leaf=5, class_weight="balanced", random_state=0, n_jobs=-1).fit(tr[fs], ytr)
            add("random forest", tag, rf.predict(te[fs]))
    r = pd.DataFrame(recs)
    r.to_csv(f"{out}/results_per_subject.csv", index=False)
    g = r.groupby(["model", "features"]).agg(balAccMean=("bal_acc", "mean"), balAccSd=("bal_acc", "std"),
                                             f1Mean=("f1", "mean"), f1Sd=("f1", "std")).round(4).reset_index()
    g.to_csv(f"{out}/results.csv", index=False)
    print(g.to_string())
    # plot
    g["label"] = g.model + "\n" + g.features
    fig, ax = plt.subplots(1, 2, figsize=(13, 5.5))
    for a, (m, sd, t) in zip(ax, (("balAccMean", "balAccSd", "Balanced accuracy"), ("f1Mean", "f1Sd", "F1 (stress)"))):
        a.barh(g.label, g[m], xerr=g[sd], color="#4c78a8", capsize=3)
        a.set_xlim(0, 1.05); a.set_title(t + " (mean ± SD over 15 held-out subjects)", fontsize=9); a.invert_yaxis()
    ax[1].set_yticklabels([])
    plt.tight_layout(); plt.savefig(f"{out}/results.png", dpi=130)
    # final model
    e = r[(r.model == "logistic regression") & (r.features == "3 features")]
    scaler = StandardScaler().fit(df[F3]); lr = LogisticRegression(class_weight="balanced", max_iter=1000).fit(scaler.transform(df[F3]), df.label)
    spec = {"modelVersion": "stress_lr_v1", "type": "logistic_regression", "features": F3,
            "scalerMean": scaler.mean_.tolist(), "scalerStd": scaler.scale_.tolist(),
            "coef": lr.coef_[0].tolist(), "intercept": float(lr.intercept_[0]), "threshold": 0.5,
            "trainedOn": "WESAD wrist BVP (Empatica E4), 15 subjects, baseline vs stress",
            "evaluation": {"method": "leave-one-subject-out",
                           "balancedAccuracyMean": round(e.bal_acc.mean(), 4), "balancedAccuracySd": round(e.bal_acc.std(), 4),
                           "f1Mean": round(e.f1.mean(), 4), "f1Sd": round(e.f1.std(), 4)},
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
    json.dump(spec, open(f"{out}/stress_lr_v1.json", "w"), indent=1)
    # check: recompute 5 windows with the documented formula vs sklearn
    sample = df.sample(5, random_state=1)
    X = sample[F3].values
    z = spec["intercept"] + ((X - spec["scalerMean"]) / spec["scalerStd"]) @ np.array(spec["coef"])
    mine = 1 / (1 + np.exp(-z)); ref = lr.predict_proba(scaler.transform(sample[F3]))[:, 1]
    assert np.allclose(mine, ref, atol=1e-9), (mine, ref)
    print("formula check OK", mine.round(4), ref.round(4))
    print(json.dumps(spec, indent=1))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
