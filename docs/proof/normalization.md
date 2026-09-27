# Normalization Proof

_Generated from `data/fixtures.json` by `npm run proof -w @evenhand/judging-engine` (`src/judging-engine/src/proof.ts`). A test regenerates this file and fails if it differs, so every number below is what the code computes today._

## 1. Data

121 reviews of 40 projects by 29 judges. Each review's score is the mean of its 3 criteria (equal weights: the fixtures carry none). The earlier copy of the Dry Harbour duplicate (prj_07) is held out of judging, as in the portal; its 5 reviews are used only for the test–retest in §7.

## 2. Choosing λ by leave-one-out error

Chosen: **λ_b = 32, λ_q = 16** (leave-one-review-out MSE 0.3961, inside the grid). μ = 3.573, residual σ̂ = 0.603. Rows are λ_b, columns λ_q; each cell is the leave-one-out mean squared error.

**How much signal is there?** Predicting every review by the mean of all the others gives a leave-one-out MSE of 0.3996; the fitted model improves on that by 0.9%. In the fixtures, which project was judged and who judged it explain very little of any one score, so the λ that predicts best is a large one: project qualities are pulled strongly towards the mean. The honest reading is not a precise ranking of 40 projects but the tie groups in §4. On synthetic events with real differences between projects (§9) the same code recovers the true ranking well.

| λ_b \ λ_q | 0.125 | 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16 | 32 | 64 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.125 | 0.7123 | 0.6763 | 0.6283 | 0.5756 | 0.5306 | 0.5025 | 0.4902 | 0.4866 | 0.4861 | 0.4864 |
| 0.25 | 0.6915 | 0.6577 | 0.6119 | 0.5613 | 0.5182 | 0.4917 | 0.4803 | 0.4774 | 0.4773 | 0.4778 |
| 0.5 | 0.6625 | 0.6312 | 0.5883 | 0.5404 | 0.4998 | 0.4752 | 0.4653 | 0.4632 | 0.4636 | 0.4643 |
| 1 | 0.6279 | 0.5995 | 0.5597 | 0.5149 | 0.4769 | 0.4543 | 0.4458 | 0.4445 | 0.4453 | 0.4463 |
| 2 | 0.5947 | 0.5688 | 0.5322 | 0.4902 | 0.4544 | 0.4332 | 0.4254 | 0.4246 | 0.4258 | 0.4269 |
| 4 | 0.5707 | 0.5469 | 0.5126 | 0.4727 | 0.4380 | 0.4171 | 0.4094 | 0.4085 | 0.4096 | 0.4108 |
| 8 | 0.5595 | 0.5368 | 0.5039 | 0.4650 | 0.4305 | 0.4091 | 0.4007 | 0.3993 | 0.4001 | 0.4010 |
| 16 | 0.5577 | 0.5357 | 0.5034 | 0.4647 | 0.4297 | 0.4075 | 0.3981 | 0.3961 | 0.3965 | 0.3973 |
| 32 | 0.5599 | 0.5381 | 0.5060 | 0.4672 | 0.4318 | 0.4087 | 0.3986 | **0.3961** | 0.3962 | 0.3968 |
| 64 | 0.5624 | 0.5408 | 0.5087 | 0.4698 | 0.4339 | 0.4103 | 0.3997 | 0.3969 | 0.3968 | 0.3973 |

## 3. Judge leniency

b̂ is how much more (+) or less (−) generous than average a judge is, on the 1–5 scale. Judges with one review are shrunk towards 0: one score says little about a judge. Flat judges (the same marks on every project) are marked ◼: jdg_07.

| Judge | Reviews | Mean given | b̂ |
|---|---:|---:|---:|
| jdg_02 Wei Lindqvist | 6 | 4.22 | +0.10 |
| jdg_15 Yuki Sato | 6 | 4.06 | +0.08 |
| jdg_30 Rafa Okonkwo | 4 | 4.08 | +0.05 |
| jdg_13 Rosa Moreau | 3 | 4.00 | +0.04 |
| jdg_07 Iva Petrova ◼ | 3 | 4.00 | +0.04 |
| jdg_22 Felix Roth | 5 | 3.73 | +0.02 |
| jdg_03 Priya Nair | 2 | 3.83 | +0.02 |
| jdg_19 Mira Kaur | 3 | 3.67 | +0.01 |
| jdg_21 Sana Aziz | 3 | 3.67 | +0.01 |
| jdg_11 Amara Silva | 6 | 3.61 | +0.01 |
| jdg_26 Jonas Vogel | 9 | 3.59 | +0.01 |
| jdg_16 Nadia Rahman | 6 | 3.61 | 0.00 |
| jdg_04 Noor Haddad | 4 | 3.58 | 0.00 |
| jdg_17 Bruno Costa | 2 | 3.50 | 0.00 |
| jdg_05 Kofi Mensah | 2 | 3.50 | 0.00 |
| jdg_06 Lena Kovac | 3 | 3.44 | −0.01 |
| jdg_23 Anya Sokolova | 1 | 3.33 | −0.01 |
| jdg_18 Lars Berg | 3 | 3.44 | −0.01 |
| jdg_29 Ines Rocha | 9 | 3.52 | −0.01 |
| jdg_09 Sofia Duarte | 5 | 3.47 | −0.01 |
| jdg_08 Marek Nowak | 3 | 3.44 | −0.01 |
| jdg_12 Dilan Yilmaz | 1 | 3.00 | −0.02 |
| jdg_25 Thandi Dlamini | 5 | 3.47 | −0.02 |
| jdg_28 Pavel Ivanov | 2 | 3.17 | −0.02 |
| jdg_27 Leila Nasser | 2 | 3.00 | −0.03 |
| jdg_10 Hiro Tanaka | 3 | 3.22 | −0.03 |
| jdg_14 Emeka Adeyemi | 3 | 3.00 | −0.05 |
| jdg_24 Diego Herrera | 11 | 3.36 | −0.05 |
| jdg_20 Otto Brandt | 6 | 3.11 | −0.07 |

## 4. Raw vs normalized ranking

Sorted by normalized score (μ + q̂). "Move" is the change against ranking by raw mean. "Group" is a tie group: projects within one pooled SD of the group's leader, without chaining; read ranks inside a group as equal.

| Rank | Group | Project | Reviews | Raw mean | Normalized | ± SD | Move |
|---:|---:|---|---:|---:|---:|---:|---:|
| 1 | 1 | prj_11 Salt Ledger | 4 | 4.33 | 3.72 | 0.15 | · |
| 2 | 1 | prj_34 Iron Switch | 3 | 4.33 | 3.69 | 0.15 | · |
| 3 | 1 | prj_37 Salt Loom | 4 | 4.08 | 3.68 | 0.15 | ▲2 |
| 4 | 1 | prj_25 Dry Relay | 3 | 4.11 | 3.66 | 0.15 | · |
| 5 | 1 | prj_33 Slow Trail | 3 | 4.00 | 3.64 | 0.15 | ▲1 |
| 6 | 1 | prj_16 Salt Kiln | 3 | 4.00 | 3.64 | 0.15 | ▲1 |
| 7 | 1 | prj_10 Still Beacon | 2 | 4.17 | 3.64 | 0.15 | ▼4 |
| 8 | 1 | prj_41 Dry Harbour | 4 | 3.83 | 3.62 | 0.15 | ▲1 |
| 9 | 1 | prj_08 North Drift | 5 | 3.80 | 3.62 | 0.14 | ▲1 |
| 10 | 1 | prj_21 Copper Kiln | 3 | 3.89 | 3.62 | 0.15 | ▼2 |
| 11 | 1 | prj_04 Green Switch | 3 | 3.78 | 3.60 | 0.15 | · |
| 12 | 1 | prj_38 Deep Beacon | 3 | 3.78 | 3.60 | 0.15 | · |
| 13 | 1 | prj_36 Salt Drift | 3 | 3.67 | 3.59 | 0.15 | ▲2 |
| 14 | 1 | prj_15 Copper Orbit | 2 | 3.67 | 3.58 | 0.15 | ▼1 |
| 15 | 1 | prj_19 Small Relay | 2 | 3.67 | 3.58 | 0.15 | ▼1 |
| 16 | 1 | prj_31 Salt Ferry | 3 | 3.56 | 3.57 | 0.15 | ▲1 |
| 17 | 2 | prj_17 Small Loom | 3 | 3.56 | 3.57 | 0.15 | ▼1 |
| 18 | 2 | prj_09 Hollow Signal | 3 | 3.56 | 3.57 | 0.15 | ▲1 |
| 19 | 2 | prj_02 Small Meadow | 3 | 3.56 | 3.57 | 0.15 | ▼1 |
| 20 | 2 | prj_18 Open Kiln | 2 | 3.50 | 3.57 | 0.15 | · |
| 21 | 2 | prj_39 Paper Anchor | 2 | 3.50 | 3.57 | 0.15 | ▲1 |
| 22 | 2 | prj_24 Glass Beacon | 2 | 3.50 | 3.57 | 0.15 | ▼1 |
| 23 | 2 | prj_12 Open Beacon | 3 | 3.44 | 3.56 | 0.15 | ▲4 |
| 24 | 2 | prj_32 Loud Ledger | 3 | 3.44 | 3.56 | 0.15 | ▲2 |
| 25 | 2 | prj_01 Glass Signal | 3 | 3.44 | 3.55 | 0.15 | ▼1 |
| 26 | 2 | prj_27 Flat Thread | 3 | 3.44 | 3.55 | 0.15 | ▲2 |
| 27 | 2 | prj_29 Flat Relay | 2 | 3.33 | 3.55 | 0.15 | ▲5 |
| 28 | 2 | prj_35 Warm Beacon | 5 | 3.47 | 3.55 | 0.14 | ▼5 |
| 29 | 2 | prj_28 Flat Meadow | 3 | 3.44 | 3.54 | 0.15 | ▼4 |
| 30 | 2 | prj_13 Quiet Anchor | 3 | 3.33 | 3.54 | 0.15 | ▲1 |
| 31 | 2 | prj_14 Green Lantern | 5 | 3.40 | 3.54 | 0.14 | ▼2 |
| 32 | 2 | prj_03 Deep Compass | 3 | 3.33 | 3.53 | 0.15 | ▼2 |
| 33 | 2 | prj_20 Paper Thread | 3 | 3.22 | 3.52 | 0.15 | · |
| 34 | 2 | prj_26 Amber Hours | 3 | 3.22 | 3.52 | 0.15 | · |
| 35 | 2 | prj_40 Slow Loom | 2 | 3.00 | 3.51 | 0.15 | ▲3 |
| 36 | 2 | prj_30 Paper Harbour | 3 | 3.11 | 3.50 | 0.15 | ▲1 |
| 37 | 2 | prj_06 Dry Compass | 3 | 3.11 | 3.50 | 0.15 | ▼2 |
| 38 | 2 | prj_22 Dry Bridge | 3 | 3.11 | 3.50 | 0.15 | ▼2 |
| 39 | 2 | prj_23 Slow Quarry | 3 | 2.89 | 3.47 | 0.15 | ▲1 |
| 40 | 2 | prj_05 North Compass | 3 | 2.89 | 3.46 | 0.15 | ▼1 |

32 of 40 projects change rank; 2 tie groups. Spearman ρ between raw and normalized ranking: 0.985.

## 5. Spread of judges before and after

Standard deviation of judges' mean scores: **0.323 before**, **0.292 after** taking out each judge's b̂. What remains is mostly that judges saw different projects, which the model keeps.

## 6. Sensitivity

| Variant | Spearman ρ with the chosen ranking | Same top 5 |
|---|---:|---:|
| λ × 0.5 | 0.999 | 5 of 5 |
| λ × 2 | 0.999 | 5 of 5 |
| functionality counts double | 0.934 | 5 of 5 |
| innovation counts double | 0.928 | 4 of 5 |
| quality counts double | 0.925 | 4 of 5 |

## 7. Test–retest on the Dry Harbour duplicate

The same team submitted the same project twice (prj_07 and prj_41); these judges scored both. Their differences estimate a judge's own noise on an identical project.

| Judge | prj_07 | prj_41 | Difference |
|---|---:|---:|---:|
| jdg_19 | 2.33 | 3.67 | +1.33 |
| jdg_21 | 3.67 | 4.67 | +1.00 |
| jdg_26 | 4.67 | 3.67 | −1.00 |

Mean absolute difference: **1.11**. If each review carried the model's noise (σ̂ = 0.60), two reviews of the same work would differ by 0.68 on average (2σ/√π). These judges disagree with themselves more than that, on only 3 pairs: consistent with noisy judging, and too few pairs to estimate each judge's own noise.

## 8. Against the usual alternatives

| Method | Spearman ρ with the normalized ranking | Notes |
|---|---:|---|
| Raw mean | 0.985 | Rewards drawing generous judges |
| Per-judge z-score | 0.863 | Divides by each judge's SD: drops jdg_07, jdg_12, jdg_19, jdg_23 (SD 0) and assumes every judge saw average projects |
| Borda / rank-based | – | Throws away score gaps; not used |
| Bradley–Terry | – | Needs pairwise comparisons; the fixtures have ratings only |

## 9. Synthetic recovery (known truth)

Seeded events generated with a known quality per project and leniency per judge (`src/synthetic.ts`): 40 projects in 5 tracks of different strength, 25 track judges + 5 bridge judges, 3 reviews per project, noise SD 0.4. Mean Spearman ρ between each method and the true ranking over 20 seeds:

| Judge leniency SD | Joint model | Raw mean | Per-judge z-score | Joint beats raw |
|---:|---:|---:|---:|---:|
| 0.5 | 0.920 | 0.896 | 0.736 | 18 of 20 |
| 1 | 0.897 | 0.772 | 0.736 | 20 of 20 |

## 10. Connectivity

Every judge and project is in one connected group: all judges can be compared with each other through shared projects and bridge judges.

