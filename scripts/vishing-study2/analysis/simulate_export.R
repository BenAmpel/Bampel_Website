# Simulated Vishing Study 2 export, in the real export's 133 columns (export-columns.csv), with known effects planted,
# so analyze_study2.R can be checked for recovering them before any real data exist. Base R only.
#
#   Rscript simulate_export.R [out.csv] [n_per_arm] [seed]
#
# Effects (the power simulation's main scenario, updated for the 10-call shift with the within-subject outage):
#   passive benign false alarms, post: A0 .32, A1 .32, A2 .22, A3 .22, A4 .30 (pre .35 in every arm); locking removes
#   half of A2's and A3's reduction; attack clips flagged .70 pre, post A0 .72, A1 .72, A2 .74, A3 .66, A4 .80
#   calm-attack disclosure, directory up: A0 .40, A1 .40, A2 .37, A3 .45, A4 .27 (down: A4 keeps half its benefit)
#   looked-up callbacks on attacks, directory up: A0 .10, A1 .10, A2 .12, A3 .10, A4 .25
#   legitimate completion, directory up: .72 (A2 .77); down: .70 (A4 .62)
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args) >= 1) args[1] else "simulated_export.csv"
n_arm <- if (length(args) >= 2) as.integer(args[2]) else 150L
set.seed(if (length(args) >= 3) as.integer(args[3]) else 20261022L)
here <- function() { a <- grep("^--file=", commandArgs(FALSE), value = TRUE); if (length(a)) dirname(sub("^--file=", "", a)) else "." }
cols <- strsplit(readLines(file.path(here(), "export-columns.csv"), n = 1), ",")[[1]]

arms <- c("a0", "a1", "a2", "a3", "a4")
SD_U <- 0.65; SD_CLIP <- 0.30; SD_LIVE <- 1.0
lat <- function(p, sd) qnorm(p) * sqrt(1 + sd^2 + SD_CLIP^2)          # marginal probability -> probit intercept
lgt <- function(p, sd) qlogis(p) * sqrt(1 + 3 * sd^2 / pi^2)            # marginal probability -> logit intercept (approx.)
fa_post <- c(a0 = .32, a1 = .32, a2 = .22, a3 = .22, a4 = .30); FA_PRE <- .35
hit_post <- c(a0 = .72, a1 = .72, a2 = .74, a3 = .66, a4 = .80); HIT_PRE <- .70
disc_calm <- c(a0 = .40, a1 = .40, a2 = .37, a3 = .45, a4 = .27); disc_urg <- c(a0 = .25, a1 = .25, a2 = .24, a3 = .26, a4 = .15)
cb_up <- c(a0 = .10, a1 = .10, a2 = .12, a3 = .10, a4 = .25)
comp_up <- c(a0 = .72, a1 = .72, a2 = .77, a3 = .72, a4 = .72); comp_down <- c(a0 = .70, a1 = .70, a2 = .75, a3 = .70, a4 = .62)
route_cb <- c(a0 = .40, a1 = .40, a2 = .45, a3 = .40, a4 = .70)   # the request to call back: reached the real number
# A fourth argument "null" gives every arm A0's values (no training effects anywhere), to check false positives.
NULL_WORLD <- length(args) >= 4 && args[4] == "null"
if (NULL_WORLD) for (nm in c("fa_post", "hit_post", "disc_calm", "disc_urg", "cb_up", "comp_up", "comp_down", "route_cb")) { v <- get(nm); v[] <- v[["a0"]]; assign(nm, v) }

# 72 clips: 8 cells x 9. A participant gets one set of 3 clips per cell (24 clips); in half the cells 2 go before
# training and 1 after, in the other half the reverse, so each phase has 12 clips at 6/6 on every factor. Half of
# each phase's attack clips and half of its benign clips are locked.
cells <- expand.grid(structure = c("attack", "benign"), surface = c("high", "low"), topic = c("financial", "community"), stringsAsFactors = FALSE)
cells$code <- paste0(toupper(substr(cells$structure, 1, 1)), toupper(substr(cells$surface, 1, 1)), toupper(substr(cells$topic, 1, 1)))
clip_eff <- setNames(rnorm(72, 0, SD_CLIP), as.vector(outer(cells$code, 1:9, paste0)))
slots <- data.frame(slot = c("atk-calm-1", "atk-calm-2", "atk-calm-3", "atk-urgent-1", "atk-urgent-2", "ben-calm-1", "ben-calm-2", "ben-calm-3", "ben-urgent-1", "ben-urgent-2"),
                    intent = rep(c("attack", "benign"), each = 5), surface = c("calm", "calm", "calm", "urgent", "urgent", "calm", "calm", "calm", "urgent", "urgent"), stringsAsFactors = FALSE)
slot_eff <- setNames(rnorm(nrow(slots), 0, 0.3), slots$slot)
parity <- with(cells, (structure == "attack") + (surface == "high") + (topic == "financial")) %% 2 == 0

rows <- list(); k <- 0
add <- function(rec) { k <<- k + 1; rows[[k]] <<- rec }
for (a in arms) for (i in seq_len(n_arm)) {
  code <- sprintf("P-%s-%03d", a, i); u <- rnorm(1, 0, SD_U); s <- rnorm(1, 0, 0.3); v <- rnorm(1, 0, SD_LIVE)
  set_id <- sample(0:2, 1); form <- sample(c("A", "B"), 1)
  plan <- do.call(rbind, lapply(seq_len(nrow(cells)), function(c) {
    ids <- paste0(cells$code[c], sample(3 * set_id + 1:3)); npre <- if (parity[c]) 2 else 1
    data.frame(clip_id = ids, phase = c(rep("pre", npre), rep("post", 3 - npre)), cells[rep(c, 3), c("structure", "surface", "topic")], stringsAsFactors = FALSE)
  }))
  plan$locked <- 0L
  for (ph in c("pre", "post")) for (st in c("attack", "benign")) { w <- which(plan$phase == ph & plan$structure == st); plan$locked[sample(w, length(w) %/% 2)] <- 1L }
  for (j in seq_len(nrow(plan))) {
    cl <- plan[j, ]; ben <- cl$structure == "benign"; ph <- cl$phase
    p <- if (ph == "pre") (if (ben) FA_PRE else HIT_PRE) else if (ben) fa_post[[a]] else hit_post[[a]]
    if (ph == "post" && ben && cl$locked == 1 && a %in% c("a2", "a3")) p <- p + (FA_PRE - .03 - fa_post[[a]]) * 0.5   # locking removes half
    eta <- lat(p, SD_U) + u + s * (!ben) + clip_eff[[cl$clip_id]] + rnorm(1)
    ans <- if (eta > 0) "suspicious" else "legitimate"
    add(list(code = code, condition = a, session = 2, item_kind = "audio", block_title = if (ph == "pre") "Recorded calls, first set" else "Recorded calls, second set",
      clip_id = cl$clip_id, phase = ph, locked = cl$locked, structure = cl$structure, surface = cl$surface, topic = cl$topic, clip_list = set_id, live_final = ans, decision = ans))
  }
  down <- c(sample(c("atk-calm-1", "atk-calm-2", "atk-calm-3"), 1), sample(c("atk-urgent-1", "atk-urgent-2"), 1), sample(c("ben-calm-1", "ben-calm-2", "ben-calm-3"), 1), "ben-urgent-2")
  for (r in sample(nrow(slots))) {
    sl <- slots[r, ]; dd <- as.integer(sl$slot %in% down)
    rec <- list(code = code, condition = a, session = 2, item_kind = "call", call_slot = sl$slot, call_intent = sl$intent, structure = sl$intent,
                surface = sl$surface, call_directory_down = dd, shift_form = form, call_answered = 1)
    if (sl$intent == "attack") {
      base <- if (sl$surface == "calm") disc_calm[[a]] else disc_urg[[a]]; ref <- if (sl$surface == "calm") .42 else .27
      p <- if (dd == 1) (if (a == "a4") base + 0.5 * (ref - base) else base + .02) else base
      d <- runif(1) < plogis(lgt(p, SD_LIVE) + v + slot_eff[[sl$slot]])
      cbk <- if (dd == 1) 0L else as.integer(runif(1) < plogis(lgt(cb_up[[a]], SD_LIVE) + v))
      rec <- c(rec, list(call_disclosure = as.integer(d), call_disclosed = if (d) "code" else "", call_callbacks_lookedup = cbk, call_callback_resolved = cbk,
                         call_outcome = if (d) "disclosed" else if (cbk == 1) "verified" else "resisted"))
    } else if (sl$slot == "ben-urgent-1") {
      cbk <- as.integer(runif(1) < plogis(lgt(route_cb[[a]], SD_LIVE) + v))
      rec <- c(rec, list(call_benign_completed_on_call = 0L, call_benign_completed_via_callback = cbk, call_callbacks_lookedup = cbk, call_callback_resolved = cbk, call_outcome = "agreed"))
    } else {
      cp <- runif(1) < plogis(lgt(if (dd == 1) comp_down[[a]] else comp_up[[a]], SD_LIVE) - 0.3 * v + slot_eff[[sl$slot]])
      rec <- c(rec, list(call_benign_completed_on_call = as.integer(cp), call_benign_completed_via_callback = 0L, call_callbacks_lookedup = 0L, call_callback_resolved = 0L,
                         call_outcome = if (cp) "completed" else "not_completed"))
    }
    add(rec)
  }
}
df <- as.data.frame(matrix("", nrow = length(rows), ncol = length(cols), dimnames = list(NULL, cols)), stringsAsFactors = FALSE)
for (nm in cols) { vals <- vapply(rows, function(r) if (is.null(r[[nm]])) "" else as.character(r[[nm]]), ""); df[[nm]] <- vals }
write.csv(df, out, row.names = FALSE)
cat(sprintf("wrote %s: %d rows (%d participants)\n", out, nrow(df), n_arm * length(arms)))
