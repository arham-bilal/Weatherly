/* Weatherly frontend: fetches from the Python backend and renders the dashboard. */
const $ = s => document.querySelector(s);
const API = location.protocol === "file:" ? "http://127.0.0.1:5000" : "";
const DEFAULT_CITY = "Karachi, Sindh, Pakistan";
let data = null, selectedDay = null, lastTemp = 0, clockTimer = null, lightningTimer = null;
const charts = {}; let chartsSeen = false;

/* ---------- Helpers (missing API fields show an em dash) ---------- */
const has = v => v !== null && v !== undefined;
const num = (v, unit = "", d = 0) => has(v) ? `${Number(v).toFixed(d)}${unit}` : "—";
const hm = s => { if (!s) return "—"; const [h, m] = s.split(" ")[1].split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
const dayLabel = s => new Date(s + "T00:00:00").toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });

/* ---------- Ambient scene: clouds, rain, snow, lightning ---------- */
function buildScene() {
  for (let i = 0; i < 6; i++) {
    const c = document.createElement("div"); c.className = "cloud";
    Object.assign(c.style, { top: 4 + i * 11 + "%", scale: String(0.7 + Math.random() * 0.9),
      animationDuration: 70 + Math.random() * 70 + "s", animationDelay: -Math.random() * 120 + "s" });
    $("#clouds").appendChild(c);
  }
  for (let i = 0; i < 110; i++) {
    const d = document.createElement("i"); d.className = "drop";
    Object.assign(d.style, { left: Math.random() * 105 + "%", opacity: 0.3 + Math.random() * 0.6,
      animationDuration: 0.6 + Math.random() * 0.5 + "s", animationDelay: -Math.random() * 2 + "s" });
    $("#rain").appendChild(d);
  }
  for (let i = 0; i < 70; i++) {
    const f = document.createElement("i"); f.className = "flake"; const s = 3 + Math.random() * 6;
    Object.assign(f.style, { left: Math.random() * 100 + "%", width: s + "px", height: s + "px",
      opacity: 0.5 + Math.random() * 0.5, animationDuration: 7 + Math.random() * 8 + "s", animationDelay: -Math.random() * 12 + "s" });
    $("#snow").appendChild(f);
  }
}
function scheduleLightning() {
  clearTimeout(lightningTimer);
  if (document.body.dataset.theme !== "rain") return;
  lightningTimer = setTimeout(() => {
    const f = $(".flash"); f.classList.remove("strike"); void f.offsetWidth; f.classList.add("strike");
    scheduleLightning();
  }, 9000 + Math.random() * 14000); // occasional, not constant
}
function applyTheme(theme, isDay) {
  document.body.dataset.theme = theme;
  document.body.dataset.night = String(!isDay);
  scheduleLightning();
  const cs = getComputedStyle(document.body);
  Chart.defaults.color = cs.getPropertyValue("--soft").trim();
  Chart.defaults.borderColor = cs.getPropertyValue("--grid").trim();
}

/* ---------- Clock in the searched city's own time zone ---------- */
function startClock(tz) {
  clearInterval(clockTimer);
  const tick = () => {
    const now = new Date(), o = { timeZone: tz };
    $("#day").textContent = now.toLocaleDateString(LOCALE, { ...o, weekday: "long" });
    $("#date").textContent = now.toLocaleDateString(LOCALE, { ...o, day: "numeric", month: "long", year: "numeric" });
    $("#time").textContent = now.toLocaleTimeString(LOCALE, { ...o, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  tick(); clockTimer = setInterval(tick, 1000);
}

/* ---------- Smooth temperature count ---------- */
function animateTemp(to) {
  if (!has(to)) { $("#temp").textContent = "--"; return; }
  const from = lastTemp, t0 = performance.now();
  const step = t => { const p = Math.min((t - t0) / 900, 1), e = 1 - Math.pow(1 - p, 3);
    $("#temp").textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step); else lastTemp = to; };
  requestAnimationFrame(step);
}

/* ---------- Rendering ---------- */
function render(d) {
  data = d; selectedDay = null;
  const c = d.current, l = d.location;
  applyTheme(d.theme, c.is_day);
  $("#place").textContent = [l.name, l.region, l.country].filter(Boolean).join(", ");
  startClock(l.tz_id);
  animateTemp(c.temp);
  $("#cond").textContent = c.condition || "—";
  const ic = $("#cicon"); ic.src = c.icon || ""; ic.style.display = c.icon ? "" : "none";
  $("#feels").textContent = num(c.feels_like, "°C");
  const stats = [
    ["Humidity", num(c.humidity, "%"), "Moisture in the air"],
    ["Wind", num(c.wind_kph, " km/h"), "Sustained wind speed"],
    ["Direction", c.wind_dir || "—", "Compass direction the wind blows from"],
    ["Visibility", num(c.visibility_km, " km", 1), "How far you can see"],
    ["Pressure", num(c.pressure_mb, " mb"), "Atmospheric pressure"],
    ["UV index", num(c.uv, "", 1), "0-2 low, 6-7 high, 11+ extreme"],
    ["Sunrise", c.sunrise || "—", "Local time"],
    ["Sunset", c.sunset || "—", "Local time"],
    ["Cloud cover", num(c.cloud, "%"), "Share of sky covered by cloud"],
  ];
  $("#stats").innerHTML = stats.map(([k, v, t]) => `<div class="stat" data-tip="${t}"><span>${k}</span><b>${v}</b></div>`).join("");
  $("#extra").innerHTML = [["Sunrise", c.sunrise], ["Sunset", c.sunset], ["Moon phase", c.moon_phase], ["Last updated", c.updated]]
    .map(([k, v]) => `<div><span>${k}</span><b>${v || "—"}</b></div>`).join("");
  $("#updated").textContent = "Updated " + (c.updated || "—");
  renderDaily(); renderHours(d.hourly, true); updateCharts(d.hourly);
}
function renderHours(hours, isNow) {
  $("#hourTitle").textContent = isNow ? "Next 24 hours" : "Hourly · " + dayLabel(data.daily[selectedDay].date);
  $("#resetDay").hidden = isNow;
  $("#hourly").innerHTML = hours.map((h, i) => `
    <div class="hcard ${isNow && i === 0 ? "now" : ""}" style="animation-delay:${i * 30}ms" title="${h.condition || ""}">
      <small>${isNow && i === 0 ? "Now" : hm(h.time)}</small>
      ${h.icon ? `<img src="${h.icon}" alt="${h.condition || ""}">` : ""}
      <b>${num(h.temp, "°")}</b><small>${h.condition || "—"}</small><small>${num(h.rain_chance, "% rain")}</small>
    </div>`).join("");
  $("#hourly").scrollLeft = 0;
}
function renderDaily() {
  $("#daily").innerHTML = data.daily.map((d, i) => {
    const dt = new Date(d.date + "T00:00:00");
    return `<button class="dcard ${selectedDay === i ? "active" : ""}" data-i="${i}" style="animation-delay:${i * 60}ms">
      <b>${i === 0 ? "Today" : dt.toLocaleDateString(LOCALE, { weekday: "long" })}</b>
      <small>${dt.toLocaleDateString(LOCALE, { day: "numeric", month: "short" })}</small>
      ${d.icon ? `<img src="${d.icon}" alt="">` : ""}
      <small>${d.condition || "—"}</small>
      <div class="rng">${num(d.max, "°")} <em>/ ${num(d.min, "°")}</em></div>
      <div class="rp">${num(d.rain_chance, "% rain")}</div></button>`;
  }).join("");
}
$("#daily").addEventListener("click", e => {
  const b = e.target.closest(".dcard"); if (!b || !data) return;
  selectedDay = +b.dataset.i; renderDaily();
  const hrs = data.daily[selectedDay].hours; renderHours(hrs, false); updateCharts(hrs);
  $("#hourTitle").scrollIntoView({ behavior: "smooth", block: "center" });
});
$("#resetDay").onclick = () => { selectedDay = null; renderDaily(); renderHours(data.hourly, true); updateCharts(data.hourly); };

/* ---------- Charts (created when scrolled into view so they animate in) ---------- */
function updateCharts(hours) {
  const labels = hours.map(h => hm(h.time)), acc = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  const cfg = { temp: ["cTemp", "line", hours.map(h => h.temp)], rain: ["cRain", "bar", hours.map(h => h.rain_chance)],
    hum: ["cHum", "line", hours.map(h => h.humidity)] };
  Object.entries(cfg).forEach(([k, [id, type, vals]]) => {
    const fill = type === "bar" ? acc : acc + "33";
    if (charts[k]) {
      const ch = charts[k], ds = ch.data.datasets[0];
      ch.data.labels = labels; ds.data = vals; ds.borderColor = acc; ds.backgroundColor = fill;
      ch.options.color = Chart.defaults.color;
      ch.options.scales.x.ticks.color = ch.options.scales.y.ticks.color = Chart.defaults.color;
      ch.options.scales.y.grid.color = Chart.defaults.borderColor;
      ch.update(); return;
    }
    if (!chartsSeen) return;
    charts[k] = new Chart($("#" + id), { type, data: { labels, datasets: [{ data: vals, borderColor: acc,
      backgroundColor: fill, fill: type === "line", tension: .4, borderRadius: 6, pointRadius: 0, pointHoverRadius: 5 }] },
      options: { maintainAspectRatio: false, animation: { duration: 1400, easing: "easeOutQuart" },
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
          y: { grid: { color: Chart.defaults.borderColor }, ...(k !== "temp" ? { min: 0, max: 100 } : {}) } } } });
  });
}
new IntersectionObserver((es, o) => {
  if (es.some(e => e.isIntersecting) && data) {
    chartsSeen = true; updateCharts(selectedDay === null ? data.hourly : data.daily[selectedDay].hours); o.disconnect();
  }
}, { threshold: .25 }).observe($(".charts"));

/* ---------- Loading, errors, search ---------- */
async function load(city) {
  $("#loader").classList.remove("off"); $("#error").hidden = true;
  try {
    const res = await fetch(`${API}/api/weather?city=${encodeURIComponent(city)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 404 ? "Location not found." : "fail");
    $("#app").hidden = false; render(body);
  } catch (e) {
    const box = $("#error"); box.hidden = false;
    box.textContent = e.message === "Location not found." ? e.message : "Unable to fetch weather data. Please try again.";
    box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
  } finally { setTimeout(() => $("#loader").classList.add("off"), 350); }
}
$("#search").addEventListener("submit", e => { e.preventDefault(); const v = $("#q").value.trim(); if (v) load(v); });

buildScene();
load(DEFAULT_CITY);
setInterval(() => data && load(`${data.location.name}, ${data.location.country}`), 10 * 60 * 1000); // auto-refresh
/* ===== v4: stars, tilt, extras (paste at the very bottom) ===== */
(function () {
  if ($(".tools")) return;

  /* ---- Build the new UI from here, so index.html needs no changes ---- */
  if (!$("#stars")) { const s = document.createElement("div"); s.id = "stars"; $("#scene").insertBefore(s, $("#clouds")); }
  const tools = document.createElement("div"); tools.className = "tools";
  tools.innerHTML = '<button id="loc" class="chip ghost" type="button">Use my location</button><button id="snd" class="chip ghost" type="button">Ambient sound: off</button>';
  $(".top").appendChild(tools);
  const sec = document.createElement("section"); sec.className = "duo2";
  sec.innerHTML = '<div class="glass aqi"><h2>Air quality</h2><div id="aqiBox"></div></div><div class="glass wind"><h2>Wind</h2><div id="windBox"></div></div>';
  const board = $("#cities");
  if (board) board.closest("section").before(sec); else $("#app").appendChild(sec);
  const add = $("#addCity");
  if (add) { const sh = document.createElement("button"); sh.id = "share"; sh.type = "button"; sh.className = "chip ghost"; sh.textContent = "Share"; add.after(sh); }

  /* ---- Ambient sound: rain, wind and thunder made live with the Web Audio API ---- */
  let ctx, filt, master, buf, on = false;
  const initAudio = () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    filt = ctx.createBiquadFilter(); master = ctx.createGain(); master.gain.value = 0;
    src.connect(filt); filt.connect(master); master.connect(ctx.destination); src.start();
  };
  const tune = () => {
    if (!ctx) return;
    const p = { rain: ["bandpass", 3200, 0.45], snow: ["lowpass", 260, 0.08], cloudy: ["lowpass", 420, 0.14], clear: ["lowpass", 320, 0.08] }[document.body.dataset.theme] || ["lowpass", 320, 0.08];
    filt.type = p[0]; filt.frequency.setTargetAtTime(p[1], ctx.currentTime, 0.4); filt.Q.value = 0.5;
    master.gain.setTargetAtTime(on ? p[2] : 0, ctx.currentTime, 0.4);
  };
  const thunder = () => {
    if (!ctx || !on) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
    s.buffer = buf; f.type = "lowpass"; f.frequency.value = 140;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + 3.6);
  };
  $("#snd").addEventListener("click", () => {
    if (!ctx) initAudio(); ctx.resume(); on = !on; tune();
    $("#snd").textContent = on ? "Ambient sound: on" : "Ambient sound: off";
  });
  new MutationObserver(tune).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  new MutationObserver(() => { if ($(".flash").classList.contains("strike")) setTimeout(thunder, 500 + Math.random() * 1200); })
    .observe($(".flash"), { attributes: true, attributeFilter: ["class"] });

  /* ---- Air quality gauge and wind compass ---- */
  const AQ = [null, { n: "Good", c: "#3ecf8e", t: "The air is clean. Enjoy the outdoors." },
    { n: "Moderate", c: "#f5c542", t: "Fine for most people. Sensitive people may notice it." },
    { n: "Unhealthy for sensitive groups", c: "#ff9a3c", t: "If you have asthma, limit long time outside." },
    { n: "Unhealthy", c: "#ff5a5f", t: "Cut down outdoor activity and consider a mask." },
    { n: "Very unhealthy", c: "#b15cff", t: "Stay indoors where possible." },
    { n: "Hazardous", c: "#c2345e", t: "Avoid going outside." }];
  function renderAir(d) {
    const c = d.current, i = c.aqi_index, L = AQ[i];
    if (!L) $("#aqiBox").innerHTML = "<p>Air quality data is not available for this location.</p>";
    else {
      const arc = "M20 110 A80 80 0 0 1 180 110";
      $("#aqiBox").innerHTML = `<svg viewBox="0 0 200 130"><path class="gtrack" d="${arc}" pathLength="100"/>
        <path class="gbar" d="${arc}" pathLength="100" stroke="${L.c}" style="stroke-dasharray:0 100" data-p="${Math.round(i / 6 * 100)}"/>
        <text class="gnum" x="100" y="100">${has(c.pm25) ? Math.round(c.pm25) : i}</text>
        <text class="gtxt" x="100" y="120">${has(c.pm25) ? "PM2.5 µg/m³" : "EPA index"}</text></svg>
        <p><b style="color:${L.c}">${L.n}</b><br>${L.t}</p>`;
      requestAnimationFrame(() => requestAnimationFrame(() => { const b = $("#aqiBox .gbar"); if (b) b.style.strokeDasharray = `${b.dataset.p} 100`; }));
    }
    const deg = has(c.wind_degree) ? c.wind_degree : null;
    $("#windBox").innerHTML = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="76" fill="none" stroke="currentColor" opacity=".2" stroke-width="2"/>
      <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" opacity=".1"/>
      <text x="100" y="22" class="gtxt">N</text><text x="186" y="104" class="gtxt">E</text><text x="100" y="196" class="gtxt">S</text><text x="14" y="104" class="gtxt">W</text>
      <g id="needle"><polygon points="100,34 91,100 109,100" fill="var(--accent)"/><polygon points="100,166 91,100 109,100" fill="currentColor" opacity=".25"/></g>
      <circle cx="100" cy="100" r="6" fill="currentColor"/></svg>
      <p><b>${num(c.wind_kph, " km/h")}</b>${has(c.gust_kph) ? ` · gusts ${num(c.gust_kph, " km/h")}` : ""}<br>${deg === null ? "Direction unavailable" : `Blowing from ${c.wind_dir} (${deg}°)`}</p>`;
    if (deg !== null) requestAnimationFrame(() => requestAnimationFrame(() => { $("#needle").style.transform = `rotate(${(deg + 180) % 360}deg)`; }));
  }

  /* ---- Best time to go out (scores each hour on comfort, rain, humidity, daylight) ---- */
  function renderBest(d) {
    const h = d.hourly; if (!h || h.length < 3 || !$("#insight")) return;
    const sc = x => 100 - Math.abs(x.temp - 24) * 3 - (x.rain_chance || 0) * 0.6 - Math.max(0, (x.humidity || 50) - 60) * 0.3 - (x.is_day ? 0 : 12);
    let best = null;
    for (let i = 0; i < h.length - 1; i++) {
      if (!has(h[i].temp) || !has(h[i + 1].temp)) continue;
      const s = (sc(h[i]) + sc(h[i + 1])) / 2;
      if (!best || s > best.s) best = { s, a: h[i], b: h[i + 1] };
    }
    if (!best) return;
    const t = (best.a.temp + best.b.temp) / 2, r = Math.max(best.a.rain_chance || 0, best.b.rain_chance || 0);
    $("#insight").insertAdjacentHTML("beforeend", `<p class="best">Best time to go out: <b>around ${hm(best.a.time)}</b> for about 2 hours (${num(t, "°")}, ${r}% rain)</p>`);
  }

  /* ---- Live tab title and favicon ---- */
  function setTitle(d) {
    const c = d.current, e = d.theme === "rain" ? "🌧️" : d.theme === "snow" ? "❄️" : d.theme === "cloudy" ? "☁️" : c.is_day ? "☀️" : "🌙";
    document.title = `${has(c.temp) ? Math.round(c.temp) + "°" : ""} ${d.location.name} · Weatherly`;
    let l = document.querySelector("link[rel=icon]");
    if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
    l.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${e}</text></svg>`;
  }

  /* ---- Run the new parts every time weather data is drawn ---- */
  const _render = render;
  render = function (d) { _render(d); try { renderBest(d); renderAir(d); setTitle(d); } catch (e) { console.error(e); } };

  /* ---- Share, my location, and "/" to search ---- */
  const share = $("#share");
  if (share) share.addEventListener("click", async () => {
    if (!data) return;
    const c = data.current, txt = `${data.location.name}: ${num(c.temp, "°C")}, ${c.condition || ""}. Feels like ${num(c.feels_like, "°C")}, humidity ${num(c.humidity, "%")}. via Weatherly`;
    try { if (navigator.share) await navigator.share({ text: txt }); else await navigator.clipboard.writeText(txt);
      share.textContent = "Copied"; setTimeout(() => share.textContent = "Share", 1500); } catch (e) {}
  });
  $("#loc").addEventListener("click", () => {
    const err = m => { const b = $("#error"); b.hidden = false; b.textContent = m; };
    if (!navigator.geolocation) return err("Your browser does not support location.");
    navigator.geolocation.getCurrentPosition(p => load(`${p.coords.latitude.toFixed(3)},${p.coords.longitude.toFixed(3)}`),
      () => err("Location permission was denied. Allow it in the address bar, or search a city."));
  });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
  });

  /* ---- Stars, shooting stars, 3D tilt, parallax, scroll reveal ---- */
  const sky = $("#stars");
  for (let i = 0; i < 90; i++) {
    const d = document.createElement("i"); d.className = "star";
    Object.assign(d.style, { left: Math.random() * 100 + "%", top: Math.random() * 70 + "%",
      animationDelay: -Math.random() * 3 + "s", animationDuration: 2 + Math.random() * 3 + "s" });
    sky.appendChild(d);
  }
  setInterval(() => {
    if (document.body.dataset.night !== "true") return;
    const m = document.createElement("i"); m.className = "shoot";
    m.style.left = 35 + Math.random() * 60 + "%"; m.style.top = Math.random() * 35 + "%";
    sky.appendChild(m); setTimeout(() => m.remove(), 1400);
  }, 6000);
  const touch = matchMedia("(pointer:coarse)").matches;
  const resetTilt = keep => document.querySelectorAll(".tilting").forEach(x => {
    if (x !== keep) { x.style.transform = ""; x.classList.remove("tilting"); }
  });
  document.addEventListener("pointermove", e => {
    if (touch) return;
    $("#scene").style.setProperty("--px", e.clientX / innerWidth - 0.5);
    $("#scene").style.setProperty("--py", e.clientY / innerHeight - 0.5);
    const el = e.target.closest && e.target.closest(".hero,.insight,.arc,.chart,.aqi,.wind");
    resetTilt(el); if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.classList.add("tilting");
    el.style.transform = `perspective(900px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg)`;
    el.style.setProperty("--gx", (x + 0.5) * 100 + "%"); el.style.setProperty("--gy", (y + 0.5) * 100 + "%");
  });
  document.documentElement.addEventListener("mouseleave", () => resetTilt(null));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll("#app > section:not(.hero)").forEach(s => { s.classList.add("reveal"); io.observe(s); });
})();/* ===== International: 5 languages, RTL, localized dates (paste at the very bottom) ===== */
let LOCALE = "en-US", LANG = "en";
(function () {
  const LANGS = { en: ["English", "en-US"], es: ["Español", "es-ES"], fr: ["Français", "fr-FR"], ar: ["العربية", "ar-u-ca-gregory-nu-latn"], ur: ["اردو", "ur-PK"] };
  const COL = { es: 1, fr: 2, ar: 3, ur: 4 };
  // [English (the key), Spanish, French, Arabic, Urdu]. "#" is a placeholder for numbers/names.
  const ROWS = [
    ["Search", "Buscar", "Rechercher", "بحث", "تلاش"],
    ["Search a city, e.g. Lahore", "Busca una ciudad, p. ej. Madrid", "Rechercher une ville, ex. Paris", "ابحث عن مدينة، مثل دبي", "شہر تلاش کریں، مثلاً لاہور"],
    ["Use my location", "Mi ubicación", "Ma position", "موقعي", "میرا مقام"],
    ["Ambient sound: off", "Sonido ambiente: apagado", "Son d'ambiance : désactivé", "الصوت المحيط: متوقف", "ماحول کی آواز: بند"],
    ["Ambient sound: on", "Sonido ambiente: activado", "Son d'ambiance : activé", "الصوت المحيط: يعمل", "ماحول کی آواز: چالو"],
    ["+ Add to board", "+ Añadir al panel", "+ Ajouter au tableau", "+ إضافة إلى اللوحة", "+ بورڈ میں شامل کریں"],
    ["Share", "Compartir", "Partager", "مشاركة", "شیئر"],
    ["Copied", "Copiado", "Copié", "تم النسخ", "کاپی ہو گیا"],
    ["Added", "Añadido", "Ajouté", "تمت الإضافة", "شامل ہو گیا"],
    ["Fetching latest weather...", "Obteniendo el clima más reciente...", "Chargement de la météo...", "جارٍ جلب أحدث حالة للطقس...", "تازہ ترین موسم حاصل کیا جا رہا ہے..."],
    ["Feels like", "Sensación térmica", "Ressenti", "الإحساس بالحرارة", "محسوس ہوتا ہے"],
    ["Next 24 hours", "Próximas 24 horas", "24 prochaines heures", "الـ 24 ساعة القادمة", "اگلے 24 گھنٹے"],
    ["Back to next 24 hours", "Volver a las próximas 24 horas", "Retour aux 24 prochaines heures", "العودة إلى الـ 24 ساعة القادمة", "اگلے 24 گھنٹوں پر واپس"],
    ["Hourly · #", "Por hora · #", "Par heure · #", "كل ساعة · #", "گھنٹہ وار · #"],
    ["7-day forecast", "Pronóstico de 7 días", "Prévisions sur 7 jours", "توقعات 7 أيام", "7 دن کی پیشگوئی"],
    ["Select a day to see its hours", "Elige un día para ver sus horas", "Choisissez un jour pour voir ses heures", "اختر يومًا لعرض ساعاته", "کسی دن پر کلک کریں تاکہ اس کے گھنٹے دیکھیں"],
    ["Trends", "Tendencias", "Tendances", "الاتجاهات", "رجحانات"],
    ["Temperature (°C)", "Temperatura (°C)", "Température (°C)", "درجة الحرارة (°C)", "درجہ حرارت (°C)"],
    ["Rain probability (%)", "Probabilidad de lluvia (%)", "Probabilité de pluie (%)", "احتمال المطر (%)", "بارش کا امکان (%)"],
    ["Humidity (%)", "Humedad (%)", "Humidité (%)", "الرطوبة (%)", "نمی (%)"],
    ["Sun and moon", "Sol y luna", "Soleil et lune", "الشمس والقمر", "سورج اور چاند"],
    ["Today in plain words", "Hoy en palabras sencillas", "Aujourd'hui en clair", "اليوم بكلمات بسيطة", "آج کا حال سادہ الفاظ میں"],
    ["Daylight", "Luz del día", "Lumière du jour", "ضوء النهار", "دن کی روشنی"],
    ["Air quality", "Calidad del aire", "Qualité de l'air", "جودة الهواء", "ہوا کا معیار"],
    ["Wind", "Viento", "Vent", "الرياح", "ہوا"],
    ["World board", "Panel mundial", "Tableau mondial", "لوحة العالم", "عالمی بورڈ"],
    ["Tap a city to open it · × removes it", "Toca una ciudad para abrirla · × la quita", "Touchez une ville pour l'ouvrir · × la retire", "اضغط على مدينة لفتحها · × يزيلها", "شہر کھولنے کے لیے دبائیں · × ہٹاتا ہے"],
    ["Data from WeatherAPI.com ·", "Datos de WeatherAPI.com ·", "Données de WeatherAPI.com ·", "البيانات من WeatherAPI.com ·", "ڈیٹا ماخذ: WeatherAPI.com ·"],
    ["Updated #", "Actualizado #", "Mis à jour #", "آخر تحديث #", "تازہ کاری #"],
    ["Last updated", "Última actualización", "Dernière mise à jour", "آخر تحديث", "آخری تازہ کاری"],
    ["Humidity", "Humedad", "Humidité", "الرطوبة", "نمی"],
    ["Direction", "Dirección", "Direction", "الاتجاه", "سمت"],
    ["Visibility", "Visibilidad", "Visibilité", "مدى الرؤية", "نظر آنے کا فاصلہ"],
    ["Pressure", "Presión", "Pression", "الضغط", "دباؤ"],
    ["UV index", "Índice UV", "Indice UV", "مؤشر الأشعة فوق البنفسجية", "یو وی انڈیکس"],
    ["Sunrise", "Amanecer", "Lever du soleil", "الشروق", "طلوعِ آفتاب"],
    ["Sunset", "Atardecer", "Coucher du soleil", "الغروب", "غروبِ آفتاب"],
    ["Cloud cover", "Nubosidad", "Couverture nuageuse", "الغطاء السحابي", "بادلوں کا احاطہ"],
    ["Moon phase", "Fase lunar", "Phase de la lune", "طور القمر", "چاند کی شکل"],
    ["Now", "Ahora", "Maintenant", "الآن", "ابھی"],
    ["Today", "Hoy", "Aujourd'hui", "اليوم", "آج"],
    ["#% rain", "#% lluvia", "#% pluie", "مطر #%", "بارش #%"],
    ["Best time to go out:", "Mejor momento para salir:", "Meilleur moment pour sortir :", "أفضل وقت للخروج:", "باہر جانے کا بہترین وقت:"],
    ["around #", "alrededor de las #", "vers #", "حوالي #", "تقریباً #"],
    ["for about 2 hours (#, #% rain)", "durante unas 2 horas (#, #% lluvia)", "pendant environ 2 heures (#, #% de pluie)", "لمدة ساعتين تقريبًا (#، مطر #%)", "تقریباً 2 گھنٹے (#، بارش #%)"],
    ["· gusts #", "· ráfagas de #", "· rafales à #", "· هبّات #", "· جھکڑ #"],
    ["Blowing from # (#°)", "Viento del # (#°)", "Vent du # (#°)", "رياح من # (#°)", "ہوا کی سمت # (#°)"],
    ["Direction unavailable", "Dirección no disponible", "Direction indisponible", "الاتجاه غير متاح", "سمت دستیاب نہیں"],
    ["#h #m of daylight left", "Quedan #h #m de luz", "Encore #h #m de jour", "تبقّى #س #د من ضوء النهار", "دن کی روشنی باقی: #گھ #م"],
    ["The sun is down", "El sol se ha puesto", "Le soleil est couché", "غابت الشمس", "سورج غروب ہو چکا ہے"],
    ["Sun times unavailable", "Horas solares no disponibles", "Heures du soleil indisponibles", "أوقات الشمس غير متاحة", "سورج کے اوقات دستیاب نہیں"],
    ["Cold, so layer up.", "Frío, abrígate bien.", "Froid, couvrez-vous bien.", "بارد، ارتدِ طبقات من الملابس.", "سردی ہے، گرم کپڑے پہنیں۔"],
    ["Cool and comfortable.", "Fresco y agradable.", "Frais et agréable.", "منعش ومريح.", "ٹھنڈا اور آرام دہ۔"],
    ["Pleasant out there.", "Agradable afuera.", "Agréable dehors.", "الجو لطيف في الخارج.", "باہر موسم خوشگوار ہے۔"],
    ["Warm, so stay hydrated.", "Cálido, mantente hidratado.", "Chaud, pensez à vous hydrater.", "دافئ، حافظ على ترطيب جسمك.", "گرمی ہے، پانی پیتے رہیں۔"],
    ["Hot, so avoid the midday sun.", "Calor, evita el sol del mediodía.", "Très chaud, évitez le soleil de midi.", "حار، تجنّب شمس الظهيرة.", "شدید گرمی، دوپہر کی دھوپ سے بچیں۔"],
    ["High UV: wear sunscreen", "UV alto: usa protector solar", "UV élevé : mettez de la crème solaire", "أشعة قوية: استخدم واقي الشمس", "یو وی زیادہ: سن اسکرین لگائیں"],
    ["Humid: it will feel heavier than the number says", "Húmedo: se sentirá más pesado de lo que indica la cifra", "Humide : cela paraîtra plus lourd que le chiffre", "رطب: سيبدو الجو أثقل مما يوحي الرقم", "نمی زیادہ: عدد سے زیادہ بھاری محسوس ہوگا"],
    ["Rain likely (#%): take an umbrella", "Lluvia probable (#%): lleva paraguas", "Pluie probable (#%) : prenez un parapluie", "المطر محتمل (#%): خذ مظلة", "بارش کا امکان (#%): چھتری ساتھ رکھیں"],
    ["Windy: secure loose items", "Ventoso: asegura los objetos sueltos", "Venteux : fixez les objets légers", "عاصف: ثبّت الأغراض الخفيفة", "تیز ہوا: ہلکی چیزیں محفوظ کریں"],
    ["Low visibility: drive carefully", "Poca visibilidad: conduce con cuidado", "Faible visibilité : conduisez prudemment", "رؤية ضعيفة: قد بحذر", "کم نظر آنا: احتیاط سے گاڑی چلائیں"],
    ["Good conditions to be outside", "Buenas condiciones para salir", "Bonnes conditions pour sortir", "أجواء جيدة للخروج", "باہر نکلنے کے لیے اچھا موسم"],
    ["Good", "Buena", "Bonne", "جيدة", "اچھا"],
    ["Moderate", "Moderada", "Modérée", "معتدلة", "درمیانہ"],
    ["Unhealthy for sensitive groups", "Dañina para grupos sensibles", "Mauvaise pour les personnes sensibles", "غير صحية للفئات الحساسة", "حساس افراد کے لیے مضر"],
    ["Unhealthy", "Dañina", "Mauvaise", "غير صحية", "مضرِ صحت"],
    ["Very unhealthy", "Muy dañina", "Très mauvaise", "غير صحية جدًا", "انتہائی مضرِ صحت"],
    ["Hazardous", "Peligrosa", "Dangereuse", "خطيرة", "خطرناک"],
    ["The air is clean. Enjoy the outdoors.", "El aire está limpio. Disfruta al aire libre.", "L'air est pur. Profitez du plein air.", "الهواء نظيف. استمتع بالخارج.", "ہوا صاف ہے۔ باہر کا لطف اٹھائیں۔"],
    ["Fine for most people. Sensitive people may notice it.", "Aceptable para la mayoría. Los sensibles pueden notarlo.", "Correct pour la plupart. Les personnes sensibles peuvent le ressentir.", "مقبولة لمعظم الناس. قد يلاحظها الحساسون.", "اکثر لوگوں کے لیے ٹھیک ہے۔ حساس افراد محسوس کر سکتے ہیں۔"],
    ["If you have asthma, limit long time outside.", "Si tienes asma, limita el tiempo al aire libre.", "Si vous êtes asthmatique, limitez le temps dehors.", "إن كنت تعاني من الربو فقلّل البقاء في الخارج.", "اگر دمہ ہے تو باہر کم وقت گزاریں۔"],
    ["Cut down outdoor activity and consider a mask.", "Reduce la actividad al aire libre y considera una mascarilla.", "Réduisez les activités extérieures et portez un masque.", "قلّل النشاط الخارجي وفكّر في ارتداء كمامة.", "باہر کی سرگرمی کم کریں اور ماسک پہنیں۔"],
    ["Stay indoors where possible.", "Quédate en interiores si es posible.", "Restez à l'intérieur si possible.", "ابقَ في الداخل قدر الإمكان.", "جہاں تک ممکن ہو گھر کے اندر رہیں۔"],
    ["Avoid going outside.", "Evita salir.", "Évitez de sortir.", "تجنّب الخروج.", "باہر جانے سے گریز کریں۔"],
    ["Air quality data is not available for this location.", "No hay datos de calidad del aire para este lugar.", "Données de qualité de l'air indisponibles pour ce lieu.", "بيانات جودة الهواء غير متاحة لهذا الموقع.", "اس مقام کے لیے ہوا کے معیار کا ڈیٹا دستیاب نہیں۔"],
    ["EPA index", "Índice EPA", "Indice EPA", "مؤشر EPA", "EPA انڈیکس"],
    ["Location not found.", "Ubicación no encontrada.", "Lieu introuvable.", "الموقع غير موجود.", "مقام نہیں ملا۔"],
    ["Unable to fetch weather data. Please try again.", "No se pudo obtener el clima. Inténtalo de nuevo.", "Impossible de récupérer la météo. Veuillez réessayer.", "تعذّر جلب بيانات الطقس. يرجى المحاولة مرة أخرى.", "موسم کا ڈیٹا حاصل نہیں ہو سکا۔ دوبارہ کوشش کریں۔"]
  ];

  /* ---- Dictionary per language: exact strings and "#" templates ---- */
  const cache = {};
  const rx = k => new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/#/g, "(.+?)") + "$");
  function dict(l) {
    if (cache[l]) return cache[l];
    const exact = new Map(), tpl = [];
    ROWS.forEach(r => { r[0].includes("#") ? tpl.push([rx(r[0]), r[COL[l]]]) : exact.set(r[0], r[COL[l]]); });
    return (cache[l] = { exact, tpl });
  }
  function tr(s, l) {
    if (l === "en") return s;
    const core = s.trim(); if (!core) return s;
    const t = /^(\d{1,2})(?::(\d{2}))? (AM|PM)$/.exec(core);          // 7 PM  ->  19:00
    if (t) return s.replace(core, () => String((+t[1] % 12) + (t[3] === "PM" ? 12 : 0)).padStart(2, "0") + ":" + (t[2] || "00"));
    const d = dict(l); let out = d.exact.get(core);
    if (out === undefined) for (const [re, v] of d.tpl) {
      const m = re.exec(core); if (m) { let i = 1; out = v.replace(/#/g, () => tr(m[i++], l)); break; }
    }
    if (out === undefined) {                                           // "Sunny. Warm, so stay hydrated."
      out = core; let hit = false;
      for (const [k, v] of d.exact) if (k.length > 12 && k.endsWith(".") && core.includes(k)) { out = out.replace(k, () => v); hit = true; }
      if (!hit) return s;
    }
    return s.replace(core, () => out);
  }

  /* ---- Translate everything on screen (remembers the English original of each node) ---- */
  const SKIP = new Set(["SCRIPT", "STYLE", "CANVAS", "SELECT", "OPTION", "TEXTAREA"]);
  function walk() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT,
      { acceptNode: n => n.parentNode && !SKIP.has(n.parentNode.nodeName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let n; (n = w.nextNode());) {
      const o = (n.__t !== undefined && n.data === n.__t) ? n.__o : n.data, t = tr(o, LANG);
      n.__o = o; n.__t = t; if (n.data !== t) n.data = t;
    }
    document.querySelectorAll("[placeholder]").forEach(el => {
      const cur = el.getAttribute("placeholder"), o = (el.__p && cur === el.__p.t) ? el.__p.o : cur, t = tr(o, LANG);
      el.__p = { o, t }; if (cur !== t) el.setAttribute("placeholder", t);
    });
  }
  const cfg = { childList: true, subtree: true, characterData: true };
  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { mo.disconnect(); walk(); mo.observe(document.body, cfg); queued = false; });
  });

  /* ---- Apply a language ---- */
  function applyLang(reload) {
    LOCALE = LANGS[LANG][1];
    const rtl = LANG === "ar" || LANG === "ur";
    document.documentElement.lang = LANG; document.documentElement.dir = rtl ? "rtl" : "ltr";
    if (rtl && !document.getElementById("rtlfont")) {
      const l = document.createElement("link"); l.id = "rtlfont"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&display=swap"; document.head.appendChild(l);
    }
    walk();
    if (reload) {
      load(data ? `${data.location.name}, ${data.location.country}` : DEFAULT_CITY);
      if (typeof loadBoard === "function") loadBoard();
    }
  }

  /* ---- Language picker ---- */
  const sel = document.createElement("select"); sel.id = "lang"; sel.setAttribute("aria-label", "Language");
  sel.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
  ($(".tools") || $(".top")).appendChild(sel);
  sel.addEventListener("change", () => {
    LANG = sel.value; try { localStorage.setItem("wx_lang", LANG); } catch (e) {}
    applyLang(true);
  });

  /* ---- Send the chosen language to the Flask backend so weather conditions come translated ---- */
  const _fetch = window.fetch.bind(window);
  window.fetch = (u, o) => {
    if (typeof u === "string" && /\/api\/(weather|cities)/.test(u) && LANG !== "en") u += (u.includes("?") ? "&" : "?") + "lang=" + LANG;
    return _fetch(u, o);
  };

  /* ---- Start-up: saved choice, else the browser's language ---- */
  let saved = null; try { saved = localStorage.getItem("wx_lang"); } catch (e) {}
  const guess = (navigator.language || "en").slice(0, 2);
  LANG = LANGS[saved] ? saved : (LANGS[guess] ? guess : "en");
  sel.value = LANG;
  let pending = LANG !== "en";                 // reload data once, after the first English render
  const _r = render;
  render = function (d) { _r(d); if (pending) { pending = false; applyLang(true); } };
  applyLang(false);
  mo.observe(document.body, cfg);
})();/* ===== Design pack: aurora, spotlight, dark mode, transitions, splash, ripple, Ctrl+K (paste at the very bottom) ===== */
(function () {
  if ($("#splash")) return;
  const E = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- Splash intro and scroll progress bar ---- */
  document.body.insertAdjacentHTML("afterbegin", '<div id="splash"><div><b>Weatherly</b><i></i></div></div><div id="prog"></div>');
  setTimeout(() => { $("#splash").classList.add("off"); setTimeout(() => { const s = $("#splash"); if (s) s.remove(); }, 1000); }, 1500);
  addEventListener("scroll", () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    $("#prog").style.width = (h > 0 ? scrollY / h * 100 : 0) + "%";
  }, { passive: true });

  /* ---- Aurora light blobs behind the glass, and a spotlight that follows the mouse ---- */
  $("#scene .sky").insertAdjacentHTML("afterend", '<div class="aurora"><i></i><i></i><i></i></div>');
  $("#scene").insertAdjacentHTML("beforeend", '<div id="spot"></div>');
  document.addEventListener("pointermove", e => {
    const s = $("#spot"); if (!s) return;
    s.style.setProperty("--mx", e.clientX + "px"); s.style.setProperty("--my", e.clientY + "px");
  });

  /* ---- Ripple on buttons and cards ---- */
  document.addEventListener("click", e => {
    const t = e.target.closest(".chip,.dcard,.city,#search button"); if (!t) return;
    const r = t.getBoundingClientRect(), s = document.createElement("span"); s.className = "ripple";
    s.style.left = e.clientX - r.left + "px"; s.style.top = e.clientY - r.top + "px";
    t.appendChild(s); setTimeout(() => s.remove(), 650);
  });

  /* ---- Smooth blur-fade every time a new city is drawn ---- */
  const _r = render;
  render = function (d) {
    const a = $("#app"); a.classList.remove("swap"); void a.offsetWidth; a.classList.add("swap");
    _r(d);
  };

  /* ---- Dark mode toggle (remembered) ---- */
  const tools = $(".tools") || $(".top");
  const dk = document.createElement("button"); dk.id = "dark"; dk.type = "button"; dk.className = "chip ghost";
  const kb = document.createElement("button"); kb.type = "button"; kb.className = "chip ghost"; kb.textContent = "Ctrl K";
  tools.appendChild(dk); tools.appendChild(kb);
  function setDark(v) {
    document.body.classList.toggle("dark", v); dk.textContent = v ? "☀" : "☾";
    try { localStorage.setItem("wx_dark", v ? "1" : "0"); } catch (e) {}
    if (data) { applyTheme(data.theme, data.current.is_day); updateCharts(selectedDay === null ? data.hourly : data.daily[selectedDay].hours); }
  }
  dk.addEventListener("click", () => setDark(!document.body.classList.contains("dark")));
  let saved = null; try { saved = localStorage.getItem("wx_dark"); } catch (e) {}
  setDark(saved === "1");

  /* ---- Command palette: Ctrl + K ---- */
  const pal = document.createElement("div"); pal.id = "pal"; pal.hidden = true;
  pal.innerHTML = '<div class="box"><input id="palq" placeholder="Type a city or a command..." autocomplete="off"><ul id="pall"></ul></div>';
  document.body.appendChild(pal);
  let items = [], sel = 0;
  const acts = [
    ["Toggle ambient sound", () => { const b = $("#snd"); if (b) b.click(); }],
    ["Toggle dark mode", () => dk.click()],
    ["Use my location", () => { const b = $("#loc"); if (b) b.click(); }],
    ["Refresh weather", () => { if (data) load(`${data.location.name}, ${data.location.country}`); }]];
  function draw() {
    const raw = $("#palq").value.trim(), q = raw.toLowerCase();
    const cities = (typeof boardList === "function" ? boardList() : ["Karachi", "Lahore", "Islamabad", "Dubai", "London", "New York", "Tokyo", "Sydney"]).map(c => [c, () => load(c)]);
    items = [...cities, ...acts].filter(([n]) => !q || n.toLowerCase().includes(q));
    if (raw) items.push([`Search "${raw}"`, () => load(raw)]);
    sel = Math.max(0, Math.min(sel, items.length - 1));
    $("#pall").innerHTML = items.map(([n], i) => `<li class="${i === sel ? "on" : ""}" data-i="${i}">${E(n)}</li>`).join("");
  }
  const openPal = () => { pal.hidden = false; $("#palq").value = ""; sel = 0; draw(); $("#palq").focus(); };
  const closePal = () => { pal.hidden = true; };
  const run = i => { const it = items[i]; if (it) { closePal(); it[1](); } };
  kb.addEventListener("click", openPal);
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.hidden ? openPal() : closePal(); return; }
    if (pal.hidden) return;
    if (e.key === "Escape") closePal();
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % items.length; draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel); }
  });
  $("#palq").addEventListener("input", () => { sel = 0; draw(); });
  $("#pall").addEventListener("click", e => { const li = e.target.closest("li"); if (li) run(+li.dataset.i); });
  pal.addEventListener("mousedown", e => { if (e.target === pal) closePal(); });
})();/* ===== Pro pack: day ribbon, compare cities, save card, speak, voice search (paste at the very bottom) ===== */
(function () {
  if ($("#rbar")) return;
  const E = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LG = () => (typeof LANG !== "undefined" ? LANG : "en");
  const CODES = { en: "en-US", es: "es-ES", fr: "fr-FR", ar: "ar-SA", ur: "ur-PK" };

  /* ---- New sections (built here, so index.html stays untouched) ---- */
  const rs = document.createElement("section");
  rs.innerHTML = '<div class="sec-head"><h2>Day at a glance</h2><span class="hint">Move over the bar</span></div><div class="glass ribbon"><div class="rbar" id="rbar"></div><div class="rlabels" id="rlab"></div><p class="rtip" id="rtip"></p></div>';
  $("#hourly").closest("section").after(rs);
  const cs = document.createElement("section");
  cs.innerHTML = '<div class="sec-head"><h2>Compare cities</h2><span class="hint">Type a city and press Enter</span></div><div class="glass cmp"><input id="cmpq" placeholder="Compare with... e.g. London" autocomplete="off"><div id="cmpbox"></div></div>';
  const ft = $("#app footer"); if (ft) ft.before(cs); else $("#app").appendChild(cs);

  /* ---- Day at a glance: 24 hours as one colour ribbon, rain bars on the bottom ---- */
  function ribbon(d) {
    const h = d.hourly || []; if (h.length < 2) return;
    const t = h.map(x => x.temp).filter(has), lo = Math.min(...t), hi = Math.max(...t), sp = Math.max(hi - lo, 1), n = h.length - 1;
    const col = v => `hsl(${Math.round(215 - (v - lo) / sp * 195)} 85% 56%)`;
    $("#rbar").style.background = `linear-gradient(90deg,${h.map((x, i) => `${has(x.temp) ? col(x.temp) : "#999"} ${i / n * 100}%`).join(",")})`;
    $("#rbar").innerHTML = h.map((x, i) => `<i class="rr" style="left:${i / n * 100}%;height:${6 + (x.rain_chance || 0) * 0.42}px"></i>`).join("") + '<b class="rcur"></b>';
    $("#rlab").innerHTML = `<span>${hm(h[0].time)}</span><span>Low ${num(lo, "°")} · High ${num(hi, "°")}</span><span>${hm(h[n].time)}</span>`;
    $("#rtip").textContent = "";
  }
  ["pointermove", "pointerdown"].forEach(ev => $("#rbar").addEventListener(ev, e => {
    if (!data || !data.hourly.length) return;
    const h = data.hourly, r = e.currentTarget.getBoundingClientRect(), i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (h.length - 1)), x = h[i];
    const cur = e.currentTarget.querySelector(".rcur"); if (cur) cur.style.left = i / (h.length - 1) * 100 + "%";
    $("#rtip").textContent = `${hm(x.time)} · ${num(x.temp, "°")} · ${x.condition || "—"} · ${num(x.rain_chance, "% rain")}`;
  }));

  /* ---- Compare two cities with animated bars ---- */
  let cmpB = null, cmpAuto = false;
  function cmpDraw() {
    const box = $("#cmpbox"); if (!data || !cmpB) { box.innerHTML = ""; return; }
    const A = data.current, B = cmpB.current;
    const rows = [["Temperature", A.temp, B.temp, "°", 50], ["Feels like", A.feels_like, B.feels_like, "°", 50], ["Humidity", A.humidity, B.humidity, "%", 100],
      ["Wind", A.wind_kph, B.wind_kph, " km/h", 60], ["UV index", A.uv, B.uv, "", 12], ["PM2.5 air pollution", A.pm25, B.pm25, "", 100]];
    const bar = (v, mx, u, cls, win) => `<div class="cb ${cls}${win ? " win" : ""}"><i style="width:0" data-w="${has(v) ? Math.max(2, Math.min(100, v / mx * 100)) : 0}"></i><b>${num(v, u, u === "" ? 1 : 0)}</b></div>`;
    box.innerHTML = `<div class="chead"><span class="ca">${E(data.location.name)}</span><span class="cbn">${E(cmpB.location.name)}</span></div>` +
      rows.map(([l, a, b, u, mx]) => `<div class="crow"><span class="cl">${l}</span>${bar(a, mx, u, "a", has(a) && has(b) && a > b)}${bar(b, mx, u, "b", has(a) && has(b) && b > a)}</div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll("i[data-w]").forEach(i => { i.style.width = i.dataset.w + "%"; })));
  }
  async function cmpLoad(q) {
    $("#cmpbox").innerHTML = '<p class="cmsg">Loading...</p>';
    try { const r = await fetch(`${API}/api/weather?city=${encodeURIComponent(q)}`); if (!r.ok) throw new Error("x"); cmpB = await r.json(); cmpDraw(); }
    catch (e) { cmpB = null; $("#cmpbox").innerHTML = '<p class="cmsg">Location not found.</p>'; }
  }
  $("#cmpq").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.value.trim()) cmpLoad(e.target.value.trim()); });

  /* ---- Save a shareable weather card as a PNG image ---- */
  function saveCard() {
    if (!data) return;
    const c = data.current, W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d"), pal = { clear: ["#2f8fdd", "#8fd3ff"], cloudy: ["#6f7f90", "#c9d2db"], rain: ["#1d2a3b", "#4a5f78"], snow: ["#5aa7d6", "#e6f4ff"] }[data.theme] || ["#2f8fdd", "#8fd3ff"];
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c.is_day ? pal[0] : "#0f2244"); g.addColorStop(1, c.is_day ? pal[1] : "#4a6fa5");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const o = x.createRadialGradient(840, 240, 10, 840, 240, 420); o.addColorStop(0, c.is_day ? "rgba(255,235,160,.85)" : "rgba(220,232,255,.5)"); o.addColorStop(1, "rgba(255,235,160,0)");
    x.fillStyle = o; x.fillRect(0, 0, W, H);
    x.fillStyle = "#fff"; x.textAlign = "left";
    x.font = "300 46px Sora, sans-serif"; x.fillText([data.location.name, data.location.country].filter(Boolean).join(", "), 80, 150);
    x.font = "300 360px Sora, sans-serif"; x.fillText(has(c.temp) ? Math.round(c.temp) + "°" : "--", 70, 640);
    x.font = "500 64px Manrope, sans-serif"; x.fillText(c.condition || "", 80, 750);
    x.font = "400 42px Manrope, sans-serif"; x.globalAlpha = 0.9;
    [["Feels like", num(c.feels_like, "°")], ["Humidity", num(c.humidity, "%")], ["Wind", num(c.wind_kph, " km/h")], ["UV index", num(c.uv, "", 1)]].forEach(([k, v], i) => {
      x.textAlign = "left"; x.fillText(k, 80, 920 + i * 92); x.textAlign = "right"; x.fillText(v, 1000, 920 + i * 92);
    });
    x.globalAlpha = 0.7; x.textAlign = "left"; x.font = "500 34px Manrope, sans-serif"; x.fillText("Weatherly · live weather", 80, 1280);
    const a = document.createElement("a"); a.download = `weather-${data.location.name}.png`; a.href = cv.toDataURL("image/png"); a.click();
  }

  /* ---- Read the weather aloud, in the chosen language ---- */
  function speak() {
    if (!data || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const c = data.current, deg = { en: "degrees", es: "grados", fr: "degrés", ar: "درجة", ur: "ڈگری" }[LG()] || "degrees";
    const u = new SpeechSynthesisUtterance(`${data.location.name}. ${c.condition || ""}. ${has(c.temp) ? Math.round(c.temp) + " " + deg + "." : ""}`);
    u.lang = CODES[LG()] || "en-US"; u.rate = 0.95; speechSynthesis.speak(u);
  }

  /* ---- Buttons ---- */
  const mk = (t, f) => { const b = document.createElement("button"); b.type = "button"; b.className = "chip ghost"; b.textContent = t; b.addEventListener("click", f); return b; };
  const anchor = $("#share") || $("#addCity"), tools = $(".tools") || $(".top");
  const btns = [mk("Save card", saveCard)]; if (window.speechSynthesis) btns.push(mk("Speak", speak));
  if (anchor) { anchor.after(...btns); btns.forEach(b => { b.style.marginTop = "10px"; b.style.marginLeft = "6px"; }); } else btns.forEach(b => tools.appendChild(b));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) tools.appendChild(mk("Voice", () => {
    const rec = new SR(); rec.lang = CODES[LG()] || "en-US";
    rec.onresult = e => { const t = e.results[0][0].transcript.replace(/[.,!?]/g, "").trim(); if (t) { $("#q").value = t; load(t); } };
    rec.start();
  }));

  /* ---- Keep the new sections in sync with every render ---- */
  const _r = render;
  render = function (d) {
    _r(d);
    try {
      ribbon(d); cmpDraw();
      if (!cmpAuto) { cmpAuto = true; cmpLoad(/london/i.test(d.location.name) ? "Dubai" : "London"); }
    } catch (e) { console.error(e); }
  };
})();
/* ===== Countries A-Z picker (replaces the Ctrl+K palette). Paste at the very bottom ===== */
(function () {
  if ($("#cp")) return;
  const E = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- Remove the old Ctrl+K palette, its button and its shortcut ---- */
  const old = $("#pal"); if (old) old.remove();
  document.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "Ctrl K") b.remove(); });
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") e.stopImmediatePropagation(); }, true);

  /* ===== Complete A-Z Country List Modal Feature ===== */
const COUNTRIES_LIST = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe"
];

function openCp() {
  let modal = $("#countryModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "countryModal";
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);";
    modal.innerHTML = `
      <div style="background:var(--bg, #1e1e1e);color:var(--text, #fff);padding:24px;border-radius:16px;width:90%;max-width:500px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;font-size:1.2rem;">Select a Country (A-Z)</h3>
          <button id="closeModal" style="background:none;border:none;color:inherit;font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        <input type="text" id="countrySearchInput" placeholder="Search country..." style="padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;margin-bottom:12px;outline:none;">
        <div id="countryListContainer" style="overflow-y:auto;flex-grow:1;display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:8px;padding-right:4px;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#closeModal").onclick = () => modal.style.display = "none";
    modal.onclick = e => { if (e.target === modal) modal.style.display = "none"; };

    modal.querySelector("#countrySearchInput").oninput = e => {
      const q = e.target.value.toLowerCase();
      renderCountryGrid(q);
    };
  }

  renderCountryGrid("");
  modal.style.display = "flex";
}

function renderCountryGrid(filter) {
  const container = $("#countryListContainer");
  if (!container) return;
  const filtered = COUNTRIES_LIST.filter(c => c.toLowerCase().includes(filter));
  container.innerHTML = filtered.map(c => `
    <button class="country-item-btn" style="padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:inherit;border-radius:8px;cursor:pointer;text-align:left;transition:all 0.2s;" data-country="${c}">${c}</button>
  `).join("");

  container.querySelectorAll(".country-item-btn").forEach(btn => {
    btn.onclick = () => {
      const countryName = btn.dataset.country;
      $("#countryModal").style.display = "none";
      load(countryName); // Yeh function us country ka weather load kar dega
    };
  });
}

  /* ---- Panel ---- */
  const cp = document.createElement("div"); cp.id = "cp"; cp.hidden = true;
  cp.innerHTML = '<div class="cbox"><div class="chd"><input id="cpq" placeholder="Search country or capital..." autocomplete="off"><button id="cpx" type="button" aria-label="Close">×</button></div><div class="cwrap"><div id="cpl"></div><div id="cpr"></div></div></div>';
  document.body.appendChild(cp);

  function draw() {
    const q = $("#cpq").value.trim().toLowerCase(), list = C.filter(x => !q || x.n.toLowerCase().includes(q) || x.c.toLowerCase().includes(q));
    let html = "", last = ""; const letters = [];
    list.forEach(x => {
      const L = x.n[0].toUpperCase();
      if (L !== last) { last = L; letters.push(L); html += `<h4 id="cpL${L}">${L}</h4>`; }
      html += `<button class="cpi" type="button" data-i="${C.indexOf(x)}"><b>${E(x.n)}</b><span>${E(x.c)}</span></button>`;
    });
    $("#cpl").innerHTML = html || '<p class="cmsg">No country found.</p>';
    $("#cpr").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L => `<a data-l="${L}" class="${letters.includes(L) ? "on" : ""}">${L}</a>`).join("");
  }

  $("#cpl").addEventListener("click", e => {
    const b = e.target.closest(".cpi"); if (!b) return;
    const x = C[+b.dataset.i]; closeCp(); load(`${x.c}, ${x.n}`); window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---- Button ---- */
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "chip ghost"; btn.textContent = "All countries";
  btn.addEventListener("click", openCp);
  ($(".tools") || $(".top")).appendChild(btn);
})();

/* ===== Speed pack: faster responses + smoother animation (paste at the very bottom) ===== */
(function () {
  if (window.__speed) return; window.__speed = true;

  /* ---- 0. Firefox and Safari are slow with SVG filters, so they get a lighter cloud ---- */
  if (!/Chrome|Chromium|Edg\//.test(navigator.userAgent)) document.body.classList.add("soft-clouds");

  /* ---- 1. Mouse effects: at most ~30 updates per second ---- */
  let lastMove = 0;
  document.addEventListener("pointermove", e => {
    const t = performance.now();
    if (t - lastMove < 32) e.stopImmediatePropagation(); else lastMove = t;
  }, true);

  /* ---- 2. Remember answers for 5 minutes (instant when you open a city again) ---- */
  const store = new Map(), pending = new Set(), TTL = 5 * 60 * 1000, _f = window.fetch.bind(window);
  const lang = () => (typeof LANG !== "undefined" ? LANG : "en");
  window.fetch = (u, o) => {
    if (typeof u !== "string" || !/\/api\/(weather|cities|suggest)/.test(u) || (o && o.method && o.method !== "GET")) return _f(u, o);
    const k = u + "|" + lang(), hit = store.get(k);
    if (hit && Date.now() - hit.t < TTL) return Promise.resolve(new Response(hit.body, { status: 200, headers: { "Content-Type": "application/json" } }));
    return _f(u, o).then(r => {
      if (r.ok) r.clone().text().then(body => { store.set(k, { t: Date.now(), body }); if (store.size > 80) store.delete(store.keys().next().value); });
      return r;
    });
  };

  /* ---- 3. Start loading a city when the mouse reaches its card (click feels instant) ---- */
  document.addEventListener("pointerover", e => {
    const c = e.target.closest && e.target.closest(".city"); if (!c || !c.dataset.q) return;
    const u = `${API}/api/weather?city=${encodeURIComponent(decodeURIComponent(c.dataset.q))}`, k = u + "|" + lang();
    if (store.has(k) || pending.has(k)) return;
    pending.add(k); fetch(u).catch(() => {}).finally(() => pending.delete(k));
  });

  /* ---- 4. Lite mode: turns the heaviest effects off (switches on by itself on slow screens) ---- */
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "chip ghost";
  ($(".tools") || $(".top")).appendChild(btn);
  let manual = null; try { manual = localStorage.getItem("wx_lite"); } catch (e) {}
  function setLite(on, save) {
    document.body.classList.toggle("lite", on); btn.textContent = on ? "Lite: on" : "Lite: off";
    if (save) { try { localStorage.setItem("wx_lite", on ? "1" : "0"); } catch (e) {} }
  }
  btn.addEventListener("click", () => setLite(!document.body.classList.contains("lite"), true));
  setLite(manual === "1", false);
  if (manual === null) setTimeout(() => {
    if (document.hidden) return;
    let n = 0, t0 = 0;
    const tick = t => {
      if (!t0) t0 = t; n++;
      if (t - t0 < 2500) requestAnimationFrame(tick);
      else if (!document.hidden && n / ((t - t0) / 1000) < 40) setLite(true, false);
    };
    requestAnimationFrame(tick);
  }, 3500);

  /* ---- 5. Faster search: no artificial waiting after the data arrives ---- */
  load = async function (city) {
    const L = $("#loader"); L.classList.remove("off"); $("#error").hidden = true;
    try {
      const res = await fetch(`${API}/api/weather?city=${encodeURIComponent(city)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 404 ? "Location not found." : "fail");
      $("#app").hidden = false; render(body);
    } catch (e) {
      const box = $("#error"); box.hidden = false;
      box.textContent = e.message === "Location not found." ? e.message : "Unable to fetch weather data. Please try again.";
      box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
    } finally { L.classList.add("off"); }
  };

  /* ---- 6. Show the page sooner ---- */
  const sp = $("#splash"); if (sp) setTimeout(() => sp.classList.add("off"), 700);
})();