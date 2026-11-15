# stress_lr_v1 — results (plain words)

**What this is.** A small model that guesses "calm" vs "stressed" from three numbers computed over a 60-second window of pulse (blood-volume pulse) data: average pulse, how much the beat-to-beat pulse varies, and how far the pulse is above that person's own calm baseline.

**Data.** WESAD (Schmidt et al., ICMI 2018), wrist BVP from the Empatica E4 at 64 Hz, 15 subjects (S2–S17, no S12). Only "baseline" and "stress" segments are used. 60 s windows every 15 s; windows with fewer than 20 valid beat intervals are dropped. 1592 windows remain (33% stress). WESAD is for non-commercial scientific use; the data is not in this repo.

**How it was tested.** Leave-one-subject-out: train on 14 people, test on the 15th, repeat for everyone. Numbers are mean ± SD across the 15 people. Balanced accuracy treats calm and stress equally (0.5 = coin flip).

| Model | Features | Balanced accuracy | F1 (stress) |
|---|---|---|---|
| Majority class | – | 0.500 ± 0.000 | 0.000 ± 0.000 |
| Threshold rule | relativePulseBpm | 0.813 ± 0.144 | 0.716 ± 0.236 |
| Threshold rule | pulseRateBpm only | 0.727 ± 0.160 | 0.624 ± 0.251 |
| **Logistic regression (shipped)** | all 3 | **0.803 ± 0.133** | **0.702 ± 0.217** |
| Logistic regression | without relativePulseBpm | 0.787 ± 0.150 | 0.689 ± 0.231 |
| Random forest (comparison only) | all 3 | 0.804 ± 0.130 | 0.710 ± 0.212 |
| Random forest | without relativePulseBpm | 0.740 ± 0.135 | 0.637 ± 0.218 |

Full per-subject numbers: `results_per_subject.csv`; chart: `results.png`.

**Take-aways.** The personal-baseline feature helps (clearest for random forest and the simple rule). A one-line threshold on it is as good as logistic regression, so the model is not doing anything magical. Results vary a lot between people (SD ≈ 0.13–0.16): for some people it works well, for others it is close to guessing.

**Honest limits.**
- Sensor is the Empatica E4, not our band. Our band's signal quality, placement and sampling are different; **not validated on our band**.
- Stress here means a lab stress task (Trier-style public speaking and mental arithmetic) versus sitting still. Exercise, caffeine, excitement, illness or talking also raise pulse; real-life stress is not tested.
- `relativePulseBpm` needs a calm baseline from the same person. In testing, each held-out person's own baseline windows were used to compute it, so a calibration period is required in real use.
- 15 mostly young volunteers; no claim about other groups.
- Beats are detected with a simple peak finder; wrist pulse is motion-sensitive, so the beat-to-beat SD is noisy (not true HRV).
- This is a wellbeing/biofeedback signal, **not a medical or diagnostic tool**.

**Files.** `train.py` (reproduces everything; includes a check that the documented formula matches scikit-learn's `predict_proba` on 5 windows), `stress_lr_v1.json` (the exported model). The score is `1 / (1 + exp(-(intercept + Σ coef[i]·(x[i]−scalerMean[i])/scalerStd[i])))`, stress if ≥ 0.5.
