# Action-quality statistics (action-quality-statistics-v1)

These statistics describe performance on the constructed blinded state pack and are not estimates of real-student learning gains.

Seed: `20260816`; paired bootstrap resamples: 10000.

| Condition | Role | Judge n | Mean score (95% CI) | Hard violations | Needs-evidence accuracy | Critical errors | Judge coverage | Invariance stability | Fallback |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fixed-v2 | primary | 59 | 3.729 [3.405, 4.053] | 0.0% (0/60; 95% CI [0.000, 0.060]) | 100.0% (60/60; 95% CI [0.940, 1.000]) | 1.7% (1/59; 95% CI [0.003, 0.090]) | 98.3% (59/60; 95% CI [0.911, 0.997]) | 100.0% (22/22; 95% CI [0.851, 1.000]) | n/a |
| full-adaptive-v1 | primary | 60 | 3.883 [3.560, 4.206] | 10.0% (6/60; 95% CI [0.047, 0.201]) | 100.0% (60/60; 95% CI [0.940, 1.000]) | 1.7% (1/60; 95% CI [0.003, 0.089]) | 100.0% (60/60; 95% CI [0.940, 1.000]) | 100.0% (22/22; 95% CI [0.851, 1.000]) | n/a |
| llm-next-step-v6 | primary | 58 | 3.741 [3.376, 4.107] | 3.3% (2/60; 95% CI [0.009, 0.114]) | 100.0% (60/60; 95% CI [0.940, 1.000]) | 6.9% (4/58; 95% CI [0.027, 0.164]) | 96.7% (58/60; 95% CI [0.886, 0.991]) | 90.9% (20/22; 95% CI [0.722, 0.975]) | 1.9% (1/52; 95% CI [0.003, 0.101]) |
| no-history-v1 | secondary_ablation | 58 | 3.207 [2.804, 3.610] | 0.0% (0/60; 95% CI [0.000, 0.060]) | 100.0% (60/60; 95% CI [0.940, 1.000]) | 12.1% (7/58; 95% CI [0.060, 0.229]) | 96.7% (58/60; 95% CI [0.886, 0.991]) | 100.0% (22/22; 95% CI [0.851, 1.000]) | n/a |

## Paired judge-score differences

- full-adaptive-v1 minus fixed-v2: n=59, mean=0.153, 95% bootstrap CI=[-0.288, 0.576].
- llm-next-step-v6 minus fixed-v2: n=57, mean=-0.035, 95% bootstrap CI=[-0.263, 0.211].
- llm-next-step-v6 minus full-adaptive-v1: n=58, mean=-0.138, 95% bootstrap CI=[-0.569, 0.293].
