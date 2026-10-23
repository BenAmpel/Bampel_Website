# Vishing Study 2: the preregistered analysis, run on the lab's trials export (admin/export.csv).
#
#   Rscript analyze_study2.R export.csv [out_prefix]
#
# Writes <out_prefix>_results.csv (one row per test) and prints the table. Needs glmmTMB and emmeans.
# Model specifications follow preregistration §5 (isr-readiness/3-analysis-power.md M1-M6, updated for the 10-call
# shift, no caller ID and the within-subject directory outage). Every primary test is one-sided in the predicted
# direction on the probability scale, Holm-adjusted across the five primary directional tests; the equivalence and
# non-inferiority components are outside Holm.
suppressPackageStartupMessages({
  .libPaths(c(file.path(Sys.getenv("HOME"), "Library/R/arm64/4.6/library"), .libPaths()))
  library(glmmTMB); library(emmeans)
})
emm_options(lmer.df = "asymptotic")
args <- commandArgs(trailingOnly = TRUE)
if (!length(args)) stop("usage: Rscript analyze_study2.R export.csv [out_prefix]")
out_prefix <- if (length(args) >= 2) args[2] else sub("\\.csv$", "", args[1])
d <- read.csv(args[1], colClasses = "character", na.strings = character())
num <- function(x) suppressWarnings(as.numeric(x))
ARMS <- c("a0", "a1", "a2", "a3", "a4")
d <- d[d$session == "2" & d$condition %in% ARMS & d$test %in% c("", "0", "false"), ]

# ---------- passive clips ----------
pas <- d[d$item_kind == "audio" & d$clip_id != "", ]
pas$suspicious <- as.integer(ifelse(pas$live_final != "", pas$live_final, pas$decision) == "suspicious")
pas$arm <- factor(pas$condition, levels = ARMS)
pas$st <- ifelse(pas$structure == "attack", 0.5, -0.5)          # coefficient on st = d'; intercept = -c
pas$locked <- as.integer(pas$locked == "1")
# Person-level pre-phase sensitivity and criterion (log-linear correction), standardized: the covariates for the
# post-phase tests (randomization makes the pre-test a covariate, not a baseline to difference).
pre <- pas[pas$phase == "pre", ]
sdt <- do.call(rbind, lapply(split(pre, pre$code), function(x) {
  h <- (sum(x$suspicious[x$structure == "attack"]) + .5) / (sum(x$structure == "attack") + 1)
  f <- (sum(x$suspicious[x$structure == "benign"]) + .5) / (sum(x$structure == "benign") + 1)
  data.frame(code = x$code[1], pre_d = qnorm(h) - qnorm(f), pre_c = -(qnorm(h) + qnorm(f)) / 2)
}))
sdt$pre_d <- as.numeric(scale(sdt$pre_d)); sdt$pre_c <- as.numeric(scale(sdt$pre_c))
post <- merge(pas[pas$phase == "post", ], sdt, by = "code")

# Engagement flag (per-protocol sensitivity only): the same answer on all 12 clips of a block.
same <- tapply(pas$suspicious, paste(pas$code, pas$phase), function(v) length(v) == 12 && length(unique(v)) == 1)
flagged <- unique(sub(" .*", "", names(same)[same]))

# ---------- live calls ----------
calls <- d[d$item_kind == "call" & d$call_slot != "", ]
calls$arm <- factor(calls$condition, levels = ARMS)
calls$down <- as.integer(calls$call_directory_down == "1")
calls$calm <- calls$surface == "calm"
calls$disclosed <- as.integer(calls$call_disclosure == "1")
calls$lookedup <- as.integer(num(calls$call_callbacks_lookedup) > 0)
calls$completed <- as.integer(calls$call_benign_completed_on_call == "1" | calls$call_benign_completed_via_callback == "1")
calls$verified <- as.integer(calls$call_callback_resolved == "1")
atk <- calls[calls$call_intent == "attack", ]; ben <- calls[calls$call_intent == "benign", ]

# ---------- helpers ----------
# Contrasts are population-averaged risk differences: emmeans' bias adjustment integrates the predicted probability
# over the random intercepts (sigma = their combined SD), instead of reporting it for a participant at the mean.
sig <- function(fit) sqrt(sum(vapply(VarCorr(fit)$cond, function(m) m[1, 1], 0)))
pr <- function(e, fit) regrid(e, bias.adjust = TRUE, sigma = sig(fit))
res <- list()
one_sided <- function(name, fit, spec, by = NULL, at = NULL, contr, side, family = "primary") {
  e <- if (is.null(at)) emmeans(fit, spec, by = by) else emmeans(fit, spec, by = by, at = at)
  r <- pr(e, fit)
  ct <- contrast(r, contr)
  if (!is.null(by)) ct <- ct[which(summary(ct)[[by]] == at[[by]])]
  s <- summary(ct, infer = c(TRUE, TRUE), side = side, level = .95)
  ci <- confint(ct, level = .90)
  res[[length(res) + 1]] <<- data.frame(family = family, test = name, contrast = names(contr)[1], estimate = s$estimate, se = s$SE,
    ci90_lo = ci$asymp.LCL, ci90_hi = ci$asymp.UCL, p = s$p.value, stringsAsFactors = FALSE)
}
person_rate <- function(x, y) tapply(x[[y]], x$code, mean)
tost <- function(name, x, y, a, b, margin, type = c("equivalence", "noninferiority")) {
  type <- match.arg(type)
  ra <- person_rate(x[x$condition == a, ], y); rb <- person_rate(x[x$condition == b, ], y)
  diff <- mean(ra) - mean(rb); va <- var(ra) / length(ra); vb <- var(rb) / length(rb); se <- sqrt(va + vb)
  df <- (va + vb)^2 / (va^2 / (length(ra) - 1) + vb^2 / (length(rb) - 1))
  p_low <- pt((diff + margin) / se, df, lower.tail = FALSE)   # H0: diff <= -margin
  p_high <- pt((diff - margin) / se, df)                       # H0: diff >= +margin
  p <- if (type == "equivalence") max(p_low, p_high) else p_low
  q <- qt(.95, df)
  res[[length(res) + 1]] <<- data.frame(family = type, test = name, contrast = sprintf("%s - %s (margin %.2f)", a, b, margin), estimate = diff, se = se,
    ci90_lo = diff - q * se, ci90_hi = diff + q * se, p = p, stringsAsFactors = FALSE)
}
ctr <- function(arms, w, nm) setNames(list(setNames(w, arms)[ARMS] |> (\(v) ifelse(is.na(v), 0, v))()), nm)
probit <- binomial(link = "probit")

# ---------- H1a and H2: post-phase benign false alarms (probit SDT model with pre-phase covariates) ----------
m1 <- glmmTMB(suspicious ~ arm * st + pre_c + pre_d + locked + (1 + st | code) + (1 | clip_id), data = post, family = probit)
one_sided("H1a cue training lowers false alarms", m1, ~ arm | st, at = list(st = -0.5), contr = ctr(c("a2", "a0"), c(1, -1), "A2 - A0, benign post"), side = "<")
one_sided("H2 template beats instruction", m1, ~ arm | st, at = list(st = -0.5), contr = ctr(c("a3", "a1"), c(1, -1), "A3 - A1, benign post"), side = "<")

# ---------- H1b: completion of calm legitimate requests ----------
cb <- ben[ben$calm, ]
m_h1b <- glmmTMB(completed ~ arm + down + (1 | code) + (1 | call_slot), data = cb, family = binomial)
one_sided("H1b cue training raises calm completion", m_h1b, ~ arm, contr = ctr(c("a2", "a0"), c(1, -1), "A2 - A0, calm legitimate"), side = ">")

# ---------- H3a: disclosure to calm attackers ----------
ca <- atk[atk$calm, ]
m_h3a <- glmmTMB(disclosed ~ arm + down + (1 | code) + (1 | call_slot), data = ca, family = binomial)
one_sided("H3a structural beats cue training on calm attacks", m_h3a, ~ arm, contr = ctr(c("a4", "a2"), c(1, -1), "A4 - A2, calm attack"), side = "<")

# ---------- H4a: looked-up callbacks on attack calls (directory up) ----------
au <- atk[atk$down == 0, ]
m_h4a <- glmmTMB(lookedup ~ arm + (1 | code) + (1 | call_slot), data = au, family = binomial)
one_sided("H4a structural training raises looked-up callbacks", m_h4a, ~ arm, contr = ctr(c("a4", "a0"), c(1, -1), "A4 - A0, attack, directory up"), side = ">")

# ---------- equivalence and non-inferiority (participant-level proportions, outside Holm) ----------
tost("H3b cue training no better than placebo on calm attacks", ca[ca$down == 0, ], "disclosed", "a2", "a0", .15, "equivalence")
tost("H4b structural training does not lower legitimate completion", ben[ben$down == 0, ], "completed", "a4", "a0", .10, "noninferiority")

# ---------- secondary ----------
m_out <- glmmTMB(disclosed ~ arm * down + calm + (1 | code) + (1 | call_slot), data = atk, family = binomial)
e_out <- pr(emmeans(m_out, ~ arm * down), m_out)
ic <- contrast(e_out, list("(A4 - A0) x (down - up)" = with(as.data.frame(e_out), ifelse(arm == "a4" & down == 1, 1, ifelse(arm == "a4" & down == 0, -1, ifelse(arm == "a0" & down == 1, -1, ifelse(arm == "a0" & down == 0, 1, 0)))))))
s <- summary(ic, infer = c(TRUE, TRUE), side = ">"); ci <- confint(ic, level = .90)
res[[length(res) + 1]] <- data.frame(family = "secondary", test = "S1 outage removes structural training's protection", contrast = "(A4 - A0) x (down - up), disclosure",
  estimate = s$estimate, se = s$SE, ci90_lo = ci$asymp.LCL, ci90_hi = ci$asymp.UCL, p = s$p.value)
pb <- post[post$structure == "benign", ]
m_lock <- glmmTMB(suspicious ~ arm * locked + pre_c + pre_d + (1 | code) + (1 | clip_id), data = pb, family = probit)
e_lock <- pr(emmeans(m_lock, ~ arm * locked), m_lock)
lc <- contrast(e_lock, list("(A2 - A0) x (locked - free)" = with(as.data.frame(e_lock), ifelse(arm == "a2" & locked == 1, 1, ifelse(arm == "a2" & locked == 0, -1, ifelse(arm == "a0" & locked == 1, -1, ifelse(arm == "a0" & locked == 0, 1, 0)))))))
s <- summary(lc, infer = c(TRUE, TRUE), side = ">"); ci <- confint(lc, level = .90)
res[[length(res) + 1]] <- data.frame(family = "secondary", test = "S2 locking shrinks cue training's false-alarm reduction", contrast = "(A2 - A0) x (locked - free), benign FA",
  estimate = s$estimate, se = s$SE, ci90_lo = ci$asymp.LCL, ci90_hi = ci$asymp.UCL, p = s$p.value)
# S3 (cell selectivity, the theory's P2): A3's false-alarm reduction is larger on calm (low-surface) legitimate clips
# than on urgent ones, and A3 raises disclosure to calm attackers.
pb$sf <- ifelse(pb$surface == "high", 0.5, -0.5)
m_sel <- glmmTMB(suspicious ~ arm * sf + pre_c + pre_d + locked + (1 | code) + (1 | clip_id), data = pb, family = probit)
e_sel <- pr(emmeans(m_sel, ~ arm * sf, at = list(sf = c(-0.5, 0.5))), m_sel)
sc <- contrast(e_sel, list("(A3 - A0) x (calm - urgent), benign FA" = with(as.data.frame(e_sel), ifelse(arm == "a3" & sf < 0, 1, ifelse(arm == "a3" & sf > 0, -1, ifelse(arm == "a0" & sf < 0, -1, ifelse(arm == "a0" & sf > 0, 1, 0)))))))
s <- summary(sc, infer = c(TRUE, TRUE), side = "<"); ci <- confint(sc, level = .90)
res[[length(res) + 1]] <- data.frame(family = "secondary", test = "S3a template training's reduction is larger on calm legitimate clips", contrast = "(A3 - A0) x (calm - urgent), benign FA",
  estimate = s$estimate, se = s$SE, ci90_lo = ci$asymp.LCL, ci90_hi = ci$asymp.UCL, p = s$p.value)
one_sided("S3b template training raises disclosure to calm attackers", m_h3a, ~ arm, contr = ctr(c("a3", "a0"), c(1, -1), "A3 - A0, calm attack"), side = ">", family = "secondary")
# S4 (evidence weights): per-arm structure and surface coefficients in the post-phase probit model (latent scale).
post$sf <- ifelse(post$surface %in% c("high", "urgent"), 0.5, -0.5)
m_w <- glmmTMB(suspicious ~ arm * (st + sf) + pre_c + pre_d + locked + (1 + st | code) + (1 | clip_id), data = post, family = probit)
w <- function(name, var, a, side) {
  tr <- emtrends(m_w, ~ arm, var = var); ct <- contrast(tr, ctr(c(a, "a0"), c(1, -1), sprintf("%s - A0, %s weight", toupper(a), var)))
  s <- summary(ct, infer = c(TRUE, TRUE), side = side); ci <- confint(ct, level = .90)
  res[[length(res) + 1]] <<- data.frame(family = "secondary", test = name, contrast = sprintf("%s - A0, %s weight (probit)", toupper(a), var),
    estimate = s$estimate, se = s$SE, ci90_lo = ci$asymp.LCL, ci90_hi = ci$asymp.UCL, p = s$p.value)
}
w("S4a cue training raises the surface weight", "sf", "a2", ">")
w("S4b template training lowers the surface weight", "sf", "a3", "<")
w("S4c structural training raises the structure weight", "st", "a4", ">")
nv <- atk[atk$verified == 0, ]
m_comp <- glmmTMB(disclosed ~ arm + calm + down + (1 | code) + (1 | call_slot), data = nv, family = binomial)
one_sided("S5 complacency (two-sided)", m_comp, ~ arm, contr = ctr(c("a4", "a0"), c(1, -1), "A4 - A0, unverified attacks"), side = "=", family = "secondary")

# ---------- table ----------
out <- do.call(rbind, res)
prim <- out$family == "primary"
out$p_holm <- NA; out$p_holm[prim] <- p.adjust(out$p[prim], method = "holm")
out$supported <- ifelse(prim, out$p_holm < .05, out$p < .05)
out$n_participants <- length(unique(d$code)); out$n_flagged_same_answer <- length(flagged)
write.csv(out, paste0(out_prefix, "_results.csv"), row.names = FALSE)
fmt <- out; num_cols <- c("estimate", "se", "ci90_lo", "ci90_hi", "p", "p_holm")
fmt[num_cols] <- lapply(fmt[num_cols], function(v) ifelse(is.na(v), "", formatC(v, digits = 3, format = "f")))
print(fmt[, c("family", "test", "estimate", "ci90_lo", "ci90_hi", "p", "p_holm", "supported")], row.names = FALSE, right = FALSE)
cat(sprintf("\n%d participants; %d flagged for the same answer on every clip of a block (per-protocol sensitivity only)\n", length(unique(d$code)), length(flagged)))
