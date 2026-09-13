/* ============================================================
   LaptopScout — script.js
   Features:
     - Purpose button grid toggle
     - Form validation + loading overlay
     - Score ring animation
     - Sort cards
     - Laptop detail modal
     - Variants panel (desktop + offcanvas mobile)
     - Compare system (up to 3 laptops → comparison modal)
     - Save to localStorage
     - Navbar search with live dropdown
     - Saved laptops page
   ============================================================ */

(function () {
  "use strict";

  /* ===========================================================
     Utility
  =========================================================== */
  function fmt(n) {
    return Number(n).toLocaleString("en-IN");
  }
  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  /* ===========================================================
     Purpose buttons
  =========================================================== */
  const purposeGrid = document.getElementById("purposeGrid");
  const purposeInput = document.getElementById("purposeInput");

  if (purposeGrid) {
    const purposes = [
      { label: "Gaming",           icon: "bi-controller",      value: "Gaming" },
      { label: "Programming",      icon: "bi-code-slash",       value: "Programming" },
      { label: "Student",          icon: "bi-mortarboard",      value: "Student" },
      { label: "Video Editing",    icon: "bi-film",             value: "Video Editing" },
      { label: "Machine Learning", icon: "bi-robot",            value: "Machine Learning" },
      { label: "Office Work",      icon: "bi-briefcase",        value: "Office Work" },
      { label: "Business",         icon: "bi-bar-chart-line",   value: "Business" },
      { label: "Graphic Design",   icon: "bi-palette",          value: "Graphic Design" },
    ];

    purposes.forEach(function (p) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ls-purpose-btn";
      btn.dataset.value = p.value;
      btn.innerHTML = `<i class="bi ${p.icon}"></i>${esc(p.label)}`;
      btn.addEventListener("click", function () {
        if (btn.classList.contains("active")) {
          btn.classList.remove("active");
          purposeInput.value = "";
        } else {
          purposeGrid.querySelectorAll(".ls-purpose-btn").forEach(function (b) {
            b.classList.remove("active");
          });
          btn.classList.add("active");
          purposeInput.value = p.value;
        }
      });
      purposeGrid.appendChild(btn);
    });
  }

  /* ===========================================================
     Form validation + loading overlay
  =========================================================== */
  const form = document.getElementById("recommendationForm");
  const loadingOverlay = document.getElementById("loadingOverlay");

  if (form) {
    form.addEventListener("submit", function (e) {
      const budgetEl = document.getElementById("budget");
      const val = parseFloat(budgetEl ? budgetEl.value : 0);
      if (!val || val < 10000) {
        e.preventDefault();
        budgetEl && budgetEl.focus();
        const hint = document.querySelector(".ls-budget-hint");
        if (hint) {
          hint.textContent = "⚠ Please enter a valid budget of at least ₹10,000.";
          hint.style.color = "#DC2626";
          setTimeout(function () {
            hint.textContent = "Enter your maximum budget in Indian Rupees";
            hint.style.color = "";
          }, 3000);
        }
        return;
      }
      if (loadingOverlay) {
        loadingOverlay.classList.remove("d-none");
        // Rotate loading messages
        const messages = [
          "Analyzing laptops…",
          "Applying your preferences…",
          "Calculating recommendation scores…",
          "Finding the best matches…",
        ];
        let i = 0;
        const titleEl = loadingOverlay.querySelector(".ls-loading-title");
        if (titleEl) {
          const interval = setInterval(function () {
            i = (i + 1) % messages.length;
            titleEl.textContent = messages[i];
          }, 1200);
          // Keep ref so we could clear it (page navigation will stop it anyway)
        }
      }
    });
  }

  /* ===========================================================
     Score ring animation (result page)
  =========================================================== */
  function animateRings() {
    document.querySelectorAll(".ls-score-ring").forEach(function (el) {
      const score = parseFloat(el.dataset.score || 0);
      // start from 0 and animate to score
      let current = 0;
      const target = score;
      const step = target / 30;
      const interval = setInterval(function () {
        current = Math.min(current + step, target);
        el.style.setProperty("--pct", current.toFixed(1));
        if (current >= target) clearInterval(interval);
      }, 20);
    });
  }

  /* ===========================================================
     Data from page (embedded JSON)
  =========================================================== */
  let RECS = [];
  try {
    const dataEl = document.getElementById("ls-rec-data");
    if (dataEl) {
      RECS = JSON.parse(dataEl.textContent);
    }
  } catch (e) {
    console.warn("Could not parse recommendation data:", e);
  }

  function findRec(laptopId) {
    return RECS.find(function (r) { return r.laptop_id === laptopId; }) || null;
  }

  /* ===========================================================
     Sort cards
  =========================================================== */
  const sortBtns = document.querySelectorAll(".ls-sort-btn");
  const recContainer = document.getElementById("recCardsContainer");

  sortBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");

      if (!recContainer) return;
      const cards = Array.from(recContainer.querySelectorAll(".ls-rec-card"));
      const sortKey = btn.dataset.sort;

      cards.sort(function (a, b) {
        const getNum = function (el, attr) { return parseFloat(el.dataset[attr] || 0); };
        if (sortKey === "match")       return getNum(b, "recScore")   - getNum(a, "recScore");
        if (sortKey === "value")       return getNum(b, "valScore")   - getNum(a, "valScore");
        if (sortKey === "price")       return getNum(a, "price")      - getNum(b, "price");
        if (sortKey === "performance") return getNum(b, "perfScore")  - getNum(a, "perfScore");
        return 0;
      });

      cards.forEach(function (card) { recContainer.appendChild(card); });
    });
  });

  /* ===========================================================
     Details modal
  =========================================================== */
  const detailsModalEl = document.getElementById("detailsModal");
  const detailsModal   = detailsModalEl ? new bootstrap.Modal(detailsModalEl) : null;

  window.showDetails = function (laptopId) {
    const laptop = findRec(laptopId);
    if (!laptop || !detailsModal) return;

    const titleEl = document.getElementById("detailsModalLabel");
    const bodyEl  = document.getElementById("detailsModalBody");
    if (titleEl) titleEl.textContent = laptop.model_name;

    if (bodyEl) {
      const hdd = laptop.hdd > 0 ? `<br><span class='ls-detail-spec-label'>HDD</span> ${fmt(laptop.hdd)}GB` : "";
      bodyEl.innerHTML = `
        <div class="ls-detail-header">
          <div>
            <div class="ls-detail-name">${esc(laptop.model_name)}</div>
            <div class="ls-detail-brand">${esc(laptop.brand)}</div>
          </div>
          <div class="ls-detail-price">₹${fmt(laptop.price)}</div>
        </div>

        <div class="ls-detail-grid">
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Processor</div>
            <div class="ls-detail-spec-val">${esc(laptop.processor)}</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">RAM</div>
            <div class="ls-detail-spec-val">${laptop.ram}GB</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">SSD Storage</div>
            <div class="ls-detail-spec-val">${laptop.ssd}GB SSD${laptop.hdd > 0 ? ' + ' + fmt(laptop.hdd) + 'GB HDD' : ''}</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Graphics</div>
            <div class="ls-detail-spec-val">${esc(laptop.graphics)}</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Screen Size</div>
            <div class="ls-detail-spec-val">${laptop.screen_size}"</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Resolution</div>
            <div class="ls-detail-spec-val">${esc(laptop.resolution)}</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Operating System</div>
            <div class="ls-detail-spec-val">${esc(laptop.os)}</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">CPU Cores / Threads</div>
            <div class="ls-detail-spec-val">${laptop.no_of_cores} cores / ${laptop.no_of_threads} threads</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Spec Score</div>
            <div class="ls-detail-spec-val">${laptop.spec_score} / 100</div>
          </div>
          <div class="ls-detail-spec">
            <div class="ls-detail-spec-label">Rec. Score</div>
            <div class="ls-detail-spec-val">${laptop.recommendation_score}%</div>
          </div>
        </div>

        <div class="ls-why-box mb-3">
          <div class="ls-why-title"><i class="bi bi-lightbulb-fill me-1"></i> Why We Recommend It</div>
          <div class="ls-why-text">${esc(laptop.why_explanation)}</div>
        </div>

        <div class="row g-2">
          <div class="col-6">
            <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px">
              <div style="font-size:0.75rem;font-weight:700;color:#16A34A;margin-bottom:6px;text-transform:uppercase">
                <i class="bi bi-check-circle-fill me-1"></i> Pros
              </div>
              <ul style="margin:0;padding-left:16px;font-size:0.8rem;color:#374151">
                ${laptop.pros.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("")}
              </ul>
            </div>
          </div>
          <div class="col-6">
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px">
              <div style="font-size:0.75rem;font-weight:700;color:#DC2626;margin-bottom:6px;text-transform:uppercase">
                <i class="bi bi-x-circle-fill me-1"></i> Cons
              </div>
              <ul style="margin:0;padding-left:16px;font-size:0.8rem;color:#374151">
                ${laptop.cons.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("")}
              </ul>
            </div>
          </div>
        </div>

        <div class="mt-3 d-flex gap-2 flex-wrap">
          <div style="flex:1;min-width:120px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:0.7rem;color:#2563EB;font-weight:700;text-transform:uppercase;margin-bottom:4px">Performance</div>
            <div style="font-size:1.5rem;font-weight:800;color:#1E40AF">${laptop.performance_score}</div>
            <div style="font-size:0.65rem;color:#64748B">/ 100</div>
          </div>
          <div style="flex:1;min-width:120px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:0.7rem;color:#16A34A;font-weight:700;text-transform:uppercase;margin-bottom:4px">Value</div>
            <div style="font-size:1.5rem;font-weight:800;color:#15803D">${laptop.value_score}</div>
            <div style="font-size:0.65rem;color:#64748B">/ 100</div>
          </div>
          <div style="flex:1;min-width:120px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:0.7rem;color:#6366F1;font-weight:700;text-transform:uppercase;margin-bottom:4px">Match</div>
            <div style="font-size:1.5rem;font-weight:800;color:#4338CA">${laptop.recommendation_score}</div>
            <div style="font-size:0.65rem;color:#64748B">/ 100</div>
          </div>
        </div>
      `;
    }
    detailsModal.show();
  };

  /* ===========================================================
     Variants (desktop panel + mobile offcanvas)
  =========================================================== */
  const variantsPanelEl  = document.getElementById("variantsPanel");
  const variantsOcEl     = document.getElementById("variantsOffcanvas");
  const variantsOc       = variantsOcEl ? new bootstrap.Offcanvas(variantsOcEl) : null;

  window.showVariants = function (modelSeries, modelName) {
    const panelTitle = document.getElementById("variantsPanelTitle");
    const ocTitle    = document.getElementById("variantsOcTitle");
    const tableContainer = document.getElementById("variantsTableContainer");
    const ocTableContainer = document.getElementById("variantsOcTableContainer");

    if (panelTitle) panelTitle.textContent = modelName + " — All Variants";
    if (ocTitle)    ocTitle.textContent    = modelName + " — All Variants";

    fetch("/variants/" + encodeURIComponent(modelSeries))
      .then(function (r) { return r.json(); })
      .then(function (variants) {
        const html = buildVariantsTable(variants);
        if (tableContainer)   tableContainer.innerHTML = html;
        if (ocTableContainer) ocTableContainer.innerHTML = html;

        // Show on desktop
        if (variantsPanelEl) {
          variantsPanelEl.classList.remove("d-none");
          const header = variantsPanelEl.querySelector(".ls-variants-panel-header");
          if (header) header.classList.remove("d-none");
        }

        // Show offcanvas on mobile (< lg)
        if (window.innerWidth < 992 && variantsOc) {
          variantsOc.show();
        }
      })
      .catch(function (err) {
        console.error("Variants fetch error:", err);
      });
  };

  function buildVariantsTable(variants) {
    if (!variants || variants.length === 0) {
      return "<p class='text-muted p-3 small'>No other variants found in the dataset for this series.</p>";
    }
    let rows = variants.map(function (v, i) {
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(v.processor)}</td>
        <td>${v.ram}GB</td>
        <td>${v.ssd > 0 ? v.ssd + "GB SSD" : ""}${v.hdd > 0 ? (v.ssd > 0 ? " + " : "") + v.hdd + "GB HDD" : ""}</td>
        <td class="ls-variant-price">₹${fmt(v.price)}</td>
      </tr>`;
    }).join("");
    return `
      <div class="p-3" style="font-size:0.75rem;color:#64748B;">
        Same model family. Different configurations. Choose what fits you best.
      </div>
      <table class="ls-variants-table w-100">
        <thead>
          <tr>
            <th>#</th><th>CPU</th><th>RAM</th><th>Storage</th><th>Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  /* ===========================================================
     Compare system
  =========================================================== */
  const compareSet   = new Set();          // stores laptop_id integers
  const compareBtn   = document.getElementById("compareNowBtn");
  const compareSlots = [
    document.getElementById("compareSlot1"),
    document.getElementById("compareSlot2"),
    document.getElementById("compareSlot3"),
  ];
  const compareModalEl = document.getElementById("compareModal");
  const compareModal   = compareModalEl ? new bootstrap.Modal(compareModalEl) : null;

  function updateCompareSidebar() {
    const ids = Array.from(compareSet);
    compareSlots.forEach(function (slot, i) {
      if (!slot) return;
      if (i < ids.length) {
        const r = findRec(ids[i]);
        const name = r ? r.model_name : "Laptop " + (i + 1);
        slot.innerHTML = `
          <span class="ls-slot-name" title="${esc(name)}">${esc(name.length > 22 ? name.substring(0, 22) + "…" : name)}</span>
          <button class="ls-slot-remove" onclick="removeFromCompare(${ids[i]})">
            <i class="bi bi-x"></i>
          </button>`;
      } else {
        slot.innerHTML = `<span style="color:rgba(255,255,255,0.25);font-size:0.75rem;font-style:italic">Empty slot</span>`;
      }
    });
    if (compareBtn) {
      compareBtn.disabled = compareSet.size < 2;
    }
  }

  window.toggleCompare = function (laptopId, btnEl) {
    if (compareSet.has(laptopId)) {
      compareSet.delete(laptopId);
      if (btnEl) {
        btnEl.classList.remove("selected");
        btnEl.innerHTML = '<i class="bi bi-columns-gap"></i> Compare';
      }
    } else {
      if (compareSet.size >= 3) {
        // Remove oldest
        const oldest = compareSet.values().next().value;
        compareSet.delete(oldest);
        const oldBtn = document.querySelector(`.ls-btn-compare[data-lid="${oldest}"]`);
        if (oldBtn) {
          oldBtn.classList.remove("selected");
          oldBtn.innerHTML = '<i class="bi bi-columns-gap"></i> Compare';
        }
      }
      compareSet.add(laptopId);
      if (btnEl) {
        btnEl.classList.add("selected");
        btnEl.innerHTML = '<i class="bi bi-check2"></i> Selected';
      }
    }
    updateCompareSidebar();
  };

  window.removeFromCompare = function (laptopId) {
    compareSet.delete(laptopId);
    const btn = document.querySelector(`.ls-btn-compare[data-lid="${laptopId}"]`);
    if (btn) {
      btn.classList.remove("selected");
      btn.innerHTML = '<i class="bi bi-columns-gap"></i> Compare';
    }
    updateCompareSidebar();
  };

  if (compareBtn) {
    compareBtn.addEventListener("click", function () {
      if (compareSet.size < 2) return;
      const ids     = Array.from(compareSet);
      const laptops = ids.map(function (id) { return findRec(id); }).filter(Boolean);
      buildCompareModal(laptops);
      if (compareModal) compareModal.show();
    });
  }

  function buildCompareModal(laptops) {
    const bodyEl = document.getElementById("compareModalBody");
    if (!bodyEl) return;

    const fields = [
      { key: "price",               label: "Price (₹)",         fmt: function (v) { return "₹" + fmt(v); }, higherBetter: false },
      { key: "processor",           label: "Processor",          fmt: esc,                                   higherBetter: null },
      { key: "ram",                 label: "RAM",                fmt: function (v) { return v + "GB"; },     higherBetter: true },
      { key: "ssd",                 label: "SSD",                fmt: function (v) { return v + "GB"; },     higherBetter: true },
      { key: "graphics",            label: "Graphics",           fmt: esc,                                   higherBetter: null },
      { key: "screen_size",         label: "Screen Size",        fmt: function (v) { return v + '"'; },      higherBetter: null },
      { key: "os",                  label: "OS",                 fmt: esc,                                   higherBetter: null },
      { key: "no_of_cores",         label: "CPU Cores",          fmt: String,                                higherBetter: true },
      { key: "spec_score",          label: "Spec Score",         fmt: String,                                higherBetter: true },
      { key: "performance_score",   label: "Performance Score",  fmt: function (v) { return v + "%"; },      higherBetter: true },
      { key: "value_score",         label: "Value Score",        fmt: function (v) { return v + "%"; },      higherBetter: true },
      { key: "recommendation_score",label: "Match Score",        fmt: function (v) { return v + "%"; },      higherBetter: true },
    ];

    const headers = laptops.map(function (l) {
      return `<th style="min-width:160px">
        <div style="font-size:0.82rem">${esc(l.model_name)}</div>
        <div style="font-size:0.72rem;opacity:0.7;font-weight:400">${esc(l.brand)}</div>
      </th>`;
    }).join("");

    const rows = fields.map(function (f) {
      const vals = laptops.map(function (l) { return l[f.key]; });
      let bestIdx = -1;
      if (f.higherBetter === true) {
        const maxVal = Math.max.apply(null, vals.map(Number));
        bestIdx = vals.findIndex(function (v) { return Number(v) === maxVal; });
      } else if (f.higherBetter === false) {
        const minVal = Math.min.apply(null, vals.map(Number));
        bestIdx = vals.findIndex(function (v) { return Number(v) === minVal; });
      }
      const cells = vals.map(function (v, i) {
        const cls = (i === bestIdx) ? 'class="best-val"' : "";
        return `<td ${cls}>${f.fmt(v)}</td>`;
      }).join("");
      return `<tr><td class="row-label">${esc(f.label)}</td>${cells}</tr>`;
    }).join("");

    bodyEl.innerHTML = `
      <div class="table-responsive">
        <table class="ls-compare-table">
          <thead>
            <tr>
              <th style="min-width:130px">Feature</th>${headers}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="mt-3 mb-0" style="font-size:0.76rem;color:#64748B;">
        <span style="color:#16A34A;font-weight:700">Green highlighted</span> cells indicate the best value for that specification.
      </p>`;
  }

  /* ===========================================================
     Save to localStorage
  =========================================================== */
  const SAVE_KEY = "ls_saved_laptops";

  function getSaved() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]");
    } catch (e) { return []; }
  }
  function setSaved(arr) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function isSaved(id) {
    return getSaved().some(function (s) { return s.laptop_id === id; });
  }

  function updateSavedBadge() {
    const saved = getSaved();
    const badge = document.getElementById("savedBadge");
    if (badge) {
      badge.textContent = saved.length;
      badge.style.display = saved.length > 0 ? "inline" : "none";
    }
  }

  window.toggleSave = function (laptopId, modelName, price) {
    let saved = getSaved();
    const exists = saved.findIndex(function (s) { return s.laptop_id === laptopId; });
    if (exists >= 0) {
      saved.splice(exists, 1);
    } else {
      saved.push({ laptop_id: laptopId, model_name: modelName, price: price });
    }
    setSaved(saved);
    updateSavedBadge();

    // Update button appearance
    const btn = document.querySelector(`.ls-btn-save[data-lid="${laptopId}"]`);
    if (btn) {
      if (isSaved(laptopId)) {
        btn.classList.add("saved");
        btn.title = "Remove from saved";
      } else {
        btn.classList.remove("saved");
        btn.title = "Save laptop";
      }
    }
  };

  function initSaveButtons() {
    document.querySelectorAll(".ls-btn-save").forEach(function (btn) {
      const id = parseInt(btn.dataset.lid, 10);
      if (isSaved(id)) {
        btn.classList.add("saved");
        btn.title = "Remove from saved";
      } else {
        btn.title = "Save laptop";
      }
    });
    updateSavedBadge();
  }

  /* ===========================================================
     Saved laptops page (triggered by clicking nav "Saved")
  =========================================================== */
  const savedNavBtn  = document.getElementById("savedNavBtn");
  const savedModalEl = document.getElementById("savedModal");
  const savedModal   = savedModalEl ? new bootstrap.Modal(savedModalEl) : null;

  if (savedNavBtn && savedModal) {
    savedNavBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const saved = getSaved();
      const bodyEl = document.getElementById("savedModalBody");
      if (bodyEl) {
        if (saved.length === 0) {
          bodyEl.innerHTML = `
            <div class="text-center py-4">
              <i class="bi bi-heart" style="font-size:2.5rem;color:#E2E8F0;display:block;margin-bottom:12px"></i>
              <p style="color:#94A3B8">No saved laptops yet. Click the ♡ icon on any recommendation to save it.</p>
            </div>`;
        } else {
          bodyEl.innerHTML = saved.map(function (s) {
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #E2E8F0">
                <div>
                  <div style="font-weight:600;font-size:0.88rem">${esc(s.model_name)}</div>
                  <div style="font-size:0.8rem;color:#64748B">₹${fmt(s.price)}</div>
                </div>
                <button onclick="removeSavedFromModal(${s.laptop_id})" style="background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer">
                  <i class="bi bi-trash"></i> Remove
                </button>
              </div>`;
          }).join("");
        }
      }
      savedModal.show();
    });
  }

  window.removeSavedFromModal = function (laptopId) {
    let saved = getSaved();
    saved = saved.filter(function (s) { return s.laptop_id !== laptopId; });
    setSaved(saved);
    updateSavedBadge();
    // Refresh modal content
    if (savedNavBtn) savedNavBtn.click();
    // Update button on card
    const btn = document.querySelector(`.ls-btn-save[data-lid="${laptopId}"]`);
    if (btn) btn.classList.remove("saved");
  };

  /* ===========================================================
     Navbar live search
  =========================================================== */
  const navSearchInput = document.getElementById("navSearchInput");
  const navSearchWrap  = document.getElementById("navSearchWrap");

  if (navSearchInput && navSearchWrap) {
    let searchTimeout = null;
    let dropdownEl    = null;

    function removeDropdown() {
      if (dropdownEl) { dropdownEl.remove(); dropdownEl = null; }
    }

    navSearchInput.addEventListener("input", function () {
      clearTimeout(searchTimeout);
      const q = navSearchInput.value.trim();
      if (q.length < 2) { removeDropdown(); return; }

      searchTimeout = setTimeout(function () {
        fetch("/search?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (results) {
            removeDropdown();
            if (results.length === 0) return;

            dropdownEl = document.createElement("div");
            dropdownEl.className = "ls-search-dropdown";

            results.forEach(function (r) {
              const item = document.createElement("div");
              item.className = "ls-search-item";

              // GPU badge colour
              const g = (r.graphics || "").toLowerCase();
              let gpuColor = "#64748B";
              if (g.includes("rtx 40")) gpuColor = "#7C3AED";
              else if (g.includes("rtx")) gpuColor = "#2563EB";
              else if (g.includes("gtx")) gpuColor = "#0891B2";
              else if (g.includes("radeon rx")) gpuColor = "#DC2626";

              // Storage string
              const storage = r.ssd > 0
                ? r.ssd + "GB SSD" + (r.hdd > 0 ? " + " + r.hdd + "GB HDD" : "")
                : (r.hdd > 0 ? r.hdd + "GB HDD" : "—");

              item.innerHTML = `
                <div class="ls-sdrop-card">
                  <div class="ls-sdrop-top">
                    <div class="ls-sdrop-name">${esc(r.model_name)}</div>
                    <div class="ls-sdrop-price">₹${fmt(r.price)}</div>
                  </div>
                  <div class="ls-sdrop-brand">${esc(r.brand)}</div>
                  <div class="ls-sdrop-specs">
                    <span class="ls-sdrop-chip" title="Processor">
                      <i class="bi bi-cpu"></i> ${esc(r.processor)}
                    </span>
                    <span class="ls-sdrop-chip" title="RAM">
                      <i class="bi bi-memory"></i> ${r.ram}GB RAM
                    </span>
                    <span class="ls-sdrop-chip" title="Storage">
                      <i class="bi bi-device-hdd"></i> ${storage}
                    </span>
                    <span class="ls-sdrop-chip" style="color:${gpuColor}" title="Graphics">
                      <i class="bi bi-gpu-card"></i> ${esc(r.graphics)}
                    </span>
                    <span class="ls-sdrop-chip" title="Screen">
                      <i class="bi bi-display"></i> ${r.screen_size}"
                    </span>
                    <span class="ls-sdrop-chip" title="OS">
                      <i class="bi bi-windows"></i> ${esc(r.os)}
                    </span>
                  </div>
                  <div class="ls-sdrop-footer">
                    <span class="ls-sdrop-score">
                      <i class="bi bi-speedometer2"></i> Spec Score: ${r.spec_score}
                    </span>
                    <span class="ls-sdrop-view">View details →</span>
                  </div>
                </div>`;

              // Clicking the item fetches laptop JSON and opens tabbed panel
              item.addEventListener("click", function () {
                removeDropdown();
                navSearchInput.value = "";
                openSearchDetailPanel(r.laptop_id, r.model_name);
              });

              dropdownEl.appendChild(item);
            });

            navSearchWrap.style.position = "relative";
            navSearchWrap.appendChild(dropdownEl);
          })
          .catch(function () { removeDropdown(); });
      }, 300);
    });

    document.addEventListener("click", function (e) {
      if (!navSearchWrap.contains(e.target)) removeDropdown();
    });
  }

  /* ===========================================================
     Search Detail Panel — tabbed offcanvas
  =========================================================== */
  window.openSearchDetailPanel = function (laptopId, modelName) {
    var offcanvasEl = document.getElementById("searchDetailOffcanvas");
    if (!offcanvasEl) return;

    // Show loading state immediately
    var titleEl    = document.getElementById("sdpTitle");
    var subtitleEl = document.getElementById("sdpSubtitle");
    if (titleEl) titleEl.textContent = modelName || "Loading…";
    if (subtitleEl) subtitleEl.textContent = "Fetching specifications…";

    ["sdpTabOverview", "sdpTabSpecs", "sdpTabPerformance", "sdpTabAlternatives"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="sdp-loading"><div class="ls-spinner" style="width:32px;height:32px;border-width:3px"></div></div>';
    });

    // Open offcanvas straight away
    var oc = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
    oc.show();

    // Reset to first tab
    var firstTabBtn = offcanvasEl.querySelector(".sdp-nav-btn");
    if (firstTabBtn) bootstrap.Tab.getOrCreateInstance(firstTabBtn).show();

    // Fetch data
    fetch("/laptop/" + laptopId + "?fmt=json", {
      headers: { "Accept": "application/json" }
    })
      .then(function (r) { return r.json(); })
      .then(function (lp) {
        if (titleEl) titleEl.textContent = lp.model_name;
        if (subtitleEl) subtitleEl.textContent = lp.brand + "  ·  ₹" + fmt(lp.price);

        var storage = lp.ssd > 0
          ? lp.ssd + "GB SSD" + (lp.hdd > 0 ? " + " + lp.hdd + "GB HDD" : "")
          : (lp.hdd > 0 ? lp.hdd + "GB HDD" : "—");

        // GPU tier colour
        var g = (lp.graphics || "").toLowerCase();
        var gpuClr = "#64748B";
        if (g.includes("rtx 40")) gpuClr = "#7C3AED";
        else if (g.includes("rtx")) gpuClr = "#2563EB";
        else if (g.includes("gtx")) gpuClr = "#0891B2";
        else if (g.includes("radeon rx")) gpuClr = "#DC2626";

        // ── TAB 1: OVERVIEW ─────────────────────────────────
        var suitableTags = (lp.suitable_for || []).map(function (t) {
          return '<span class="sdp-tag">' + esc(t) + '</span>';
        }).join("");

        document.getElementById("sdpTabOverview").innerHTML = `
          <div class="sdp-price-hero">
            <div class="sdp-price-num">₹${fmt(lp.price)}</div>
            <div class="sdp-spec-score-badge">Spec Score ${lp.spec_score}<span>/100</span></div>
          </div>

          <div class="sdp-overview-grid">
            <div class="sdp-ov-chip"><i class="bi bi-cpu" style="color:#2563EB"></i><span>${esc(lp.processor)}</span></div>
            <div class="sdp-ov-chip"><i class="bi bi-memory" style="color:#6366F1"></i><span>${lp.ram}GB RAM</span></div>
            <div class="sdp-ov-chip"><i class="bi bi-device-hdd" style="color:#16A34A"></i><span>${storage}</span></div>
            <div class="sdp-ov-chip" style="color:${gpuClr}"><i class="bi bi-gpu-card"></i><span>${esc(lp.graphics)}</span></div>
            <div class="sdp-ov-chip"><i class="bi bi-display" style="color:#D97706"></i><span>${lp.screen_size}"</span></div>
            <div class="sdp-ov-chip"><i class="bi bi-windows" style="color:#0EA5E9"></i><span>${esc(lp.os)}</span></div>
          </div>

          ${suitableTags ? '<div class="sdp-suitable-row">' + suitableTags + '</div>' : ''}

          ${lp.why_explanation ? `
          <div class="sdp-why-box">
            <div class="sdp-why-label"><i class="bi bi-lightbulb-fill"></i> Analysis</div>
            <p class="sdp-why-text">${esc(lp.why_explanation)}</p>
          </div>` : ''}`;

        // ── TAB 2: SPECIFICATIONS ────────────────────────────
        var specRows = [
          ["bi-cpu",         "Processor",        esc(lp.processor)],
          ["bi-memory",      "RAM",              lp.ram + "GB"],
          ["bi-device-hdd",  "SSD",              lp.ssd + "GB" + (lp.hdd > 0 ? " + " + lp.hdd + "GB HDD" : "")],
          ["bi-gpu-card",    "Graphics",         esc(lp.graphics)],
          ["bi-display",     "Screen Size",      lp.screen_size + '"'],
          ["bi-aspect-ratio","Resolution",       esc(lp.resolution || "—")],
          ["bi-windows",     "Operating System", esc(lp.os)],
          ["bi-diagram-3",   "CPU Cores",        lp.no_of_cores + " cores"],
          ["bi-diagram-2",   "CPU Threads",      lp.no_of_threads + " threads"],
          ["bi-speedometer2","Spec Score",       lp.spec_score + " / 100"],
        ].map(function (row) {
          return '<tr class="sdp-spec-row">' +
            '<td class="sdp-spec-label"><i class="bi ' + row[0] + '"></i> ' + row[1] + '</td>' +
            '<td class="sdp-spec-val">' + row[2] + '</td>' +
            '</tr>';
        }).join("");

        document.getElementById("sdpTabSpecs").innerHTML = `
          <table class="sdp-spec-table">
            <tbody>${specRows}</tbody>
          </table>`;

        // ── TAB 3: PERFORMANCE ───────────────────────────────
        var bars = [
          ["Performance",     lp.performance_score, "#2563EB", "#EFF6FF", "#BFDBFE"],
          ["Value for Money", lp.value_score,       "#16A34A", "#F0FDF4", "#BBF7D0"],
          ["Match Score",     lp.recommendation_score, "#6366F1", "#F5F3FF", "#DDD6FE"],
        ].map(function (b) {
          return `<div class="sdp-bar-row">
            <div class="sdp-bar-label">${b[0]}</div>
            <div class="sdp-bar-track">
              <div class="sdp-bar-fill" style="width:${b[1]}%;background:${b[2]}"></div>
            </div>
            <div class="sdp-bar-num" style="color:${b[2]}">${b[1]}%</div>
          </div>`;
        }).join("");

        var prosHtml = (lp.pros || []).map(function (p) {
          return '<li>' + esc(p) + '</li>';
        }).join("");
        var consHtml = (lp.cons || []).map(function (c) {
          return '<li>' + esc(c) + '</li>';
        }).join("");

        document.getElementById("sdpTabPerformance").innerHTML = `
          <div class="sdp-bars-section">
            <div class="sdp-section-label">Score Breakdown</div>
            ${bars}
          </div>
          <div class="sdp-pros-cons-row">
            <div class="sdp-pros-box">
              <div class="sdp-pc-label pros"><i class="bi bi-check-circle-fill"></i> Pros</div>
              <ul class="sdp-pc-list">${prosHtml}</ul>
            </div>
            <div class="sdp-cons-box">
              <div class="sdp-pc-label cons"><i class="bi bi-x-circle-fill"></i> Cons</div>
              <ul class="sdp-pc-list">${consHtml}</ul>
            </div>
          </div>`;

        // ── TAB 4: ALTERNATIVES ──────────────────────────────
        var altHtml = "";
        if (lp.cheaper_alternative) {
          altHtml += `
            <div class="sdp-alt-card sdp-alt-cheaper" onclick="openSearchDetailPanel(${lp.cheaper_alternative.laptop_id}, ${JSON.stringify(lp.cheaper_alternative.model_name)})">
              <div class="sdp-alt-arrow"><i class="bi bi-arrow-down-circle-fill"></i></div>
              <div class="sdp-alt-body">
                <div class="sdp-alt-tag">Cheaper Option</div>
                <div class="sdp-alt-name">${esc(lp.cheaper_alternative.model_name)}</div>
                <div class="sdp-alt-note">Save ₹${fmt(lp.price - lp.cheaper_alternative.price)} vs your selected laptop</div>
              </div>
              <div class="sdp-alt-price">₹${fmt(lp.cheaper_alternative.price)}</div>
            </div>`;
        }
        if (lp.better_alternative) {
          altHtml += `
            <div class="sdp-alt-card sdp-alt-better" onclick="openSearchDetailPanel(${lp.better_alternative.laptop_id}, ${JSON.stringify(lp.better_alternative.model_name)})">
              <div class="sdp-alt-arrow"><i class="bi bi-arrow-up-circle-fill"></i></div>
              <div class="sdp-alt-body">
                <div class="sdp-alt-tag">Better Performance</div>
                <div class="sdp-alt-name">${esc(lp.better_alternative.model_name)}</div>
                <div class="sdp-alt-note">Higher specs for ₹${fmt(lp.better_alternative.price - lp.price)} more</div>
              </div>
              <div class="sdp-alt-price">₹${fmt(lp.better_alternative.price)}</div>
            </div>`;
        }
        if (!altHtml) {
          altHtml = '<div class="sdp-no-alt"><i class="bi bi-check2-all"></i><p>No better alternatives found within a similar price range. This laptop already offers great value!</p></div>';
        }

        document.getElementById("sdpTabAlternatives").innerHTML =
          '<div class="sdp-alts-wrap">' + altHtml + '</div>';
      })
      .catch(function (err) {
        console.error("Detail fetch error:", err);
        if (titleEl) titleEl.textContent = "Error loading details";
        if (subtitleEl) subtitleEl.textContent = "";
      });
  };

  /* ===========================================================
     Init on DOM ready
  =========================================================== */
  document.addEventListener("DOMContentLoaded", function () {
    animateRings();
    initSaveButtons();
    updateCompareSidebar();
  });

  // Also run immediately for elements already rendered
  animateRings();
  initSaveButtons();
  updateCompareSidebar();

})();
