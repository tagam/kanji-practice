/* てがきの じを まるつけする
 * strokes.js（KanjiVG の かきじゅんデータ）の おてほんと、1かくずつ かたちを くらべる。
 *  - かくすうが ちがう → ×
 *  - かたちが にていない、または ほかの かんじの ほうが にている → ×
 *  - かたちは あっているが かきじゅん・むきが ちがう → ○（ちゅういを だす）
 * ざひょうは 0〜109（KanjiVG の viewBox と おなじ）。 */
(function(){
  "use strict";
  var N = 16;            /* 1かくを なんてんで くらべるか */
  var MEAN_OK = 0.15;    /* ぜんたいの ずれ（じの おおきさを 1と した ときの へいきん） */
  var WORST_OK = 0.30;   /* いちばん ずれた 1かくの ゆるせる はば */
  var MIN_LEN = 1.5;     /* これより みじかい せんは タッチの まちがいと みなす */
  var cache = {};
  var probe = null;

  function samplePath(d){
    if (!probe) {
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      svg.style.visibility = "hidden";
      probe = document.createElementNS(ns, "path");
      svg.appendChild(probe);
      document.body.appendChild(svg);
    }
    probe.setAttribute("d", d);
    var len = probe.getTotalLength(), pts = [];
    for (var i = 0; i <= 40; i++) {
      var p = probe.getPointAtLength(len * i / 40);
      pts.push([p.x, p.y]);
    }
    return pts;
  }
  function template(k){
    if (!cache[k]) {
      var src = (window.KANJI_STROKES || {})[k];
      if (!src) return null;
      cache[k] = normalize(src.map(function(d){ return resample(samplePath(d)); }));
    }
    return cache[k];
  }
  function lengthOf(pts){
    var s = 0;
    for (var i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
    return s;
  }
  /* せんの ながさに そって N てんに ならべなおす */
  function resample(pts){
    if (pts.length === 1) { var out1 = []; for (var a = 0; a < N; a++) out1.push(pts[0].slice()); return out1; }
    var total = lengthOf(pts), step = total / (N - 1), out = [pts[0].slice()], acc = 0;
    if (total === 0) { while (out.length < N) out.push(pts[0].slice()); return out; }
    for (var i = 1; i < pts.length && out.length < N; i++) {
      var p = pts[i-1], q = pts[i], seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      while (seg > 0 && acc + seg >= step && out.length < N) {
        var t = (step - acc) / seg;
        p = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        out.push(p);
        seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
        acc = 0;
      }
      acc += seg;
    }
    while (out.length < N) out.push(pts[pts.length - 1].slice());
    return out;
  }
  /* じの おおきさと いちを そろえる（まんなかを 0、ながい ほうの はばを 1 に） */
  function normalize(strokes){
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    strokes.forEach(function(s){ s.forEach(function(p){
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }); });
    var size = Math.max(x1 - x0, y1 - y0, 1e-6), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return strokes.map(function(s){ return s.map(function(p){ return [(p[0] - cx) / size, (p[1] - cy) / size]; }); });
  }
  function dist(a, b){
    var s = 0;
    for (var i = 0; i < N; i++) s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    return s / N;
  }
  function reversed(a){ return a.slice().reverse(); }

  /* user と おてほんを くらべる（かくすうは おなじ ときだけ） */
  function compare(user, tpl){
    var n = tpl.length, i, j;
    /* かきじゅんどおりに くらべた ずれ */
    var inOrder = [], flipped = [];
    for (i = 0; i < n; i++) {
      var f = dist(user[i], tpl[i]), r = dist(reversed(user[i]), tpl[i]);
      inOrder.push(f);
      flipped.push(r + 0.03 < f);
    }
    /* じゅんばんを きにせず いちばん にている かく どうしを くみあわせた ずれ */
    var m = [];
    for (i = 0; i < n; i++) {
      m.push([]);
      for (j = 0; j < n; j++) m[i].push(Math.min(dist(user[i], tpl[j]), dist(reversed(user[i]), tpl[j])));
    }
    var usedU = {}, usedT = {}, pairs = [];
    for (var c = 0; c < n; c++) {
      var best = Infinity, bi = -1, bj = -1;
      for (i = 0; i < n; i++) if (!usedU[i]) for (j = 0; j < n; j++) if (!usedT[j] && m[i][j] < best) { best = m[i][j]; bi = i; bj = j; }
      usedU[bi] = usedT[bj] = true;
      pairs.push(best);
    }
    function mean(a){ return a.reduce(function(x, y){ return x + y; }, 0) / a.length; }
    return {
      shapeMean: mean(pairs), shapeWorst: Math.max.apply(null, pairs),
      orderMean: mean(inOrder), orderWorst: Math.max.apply(null, inOrder),
      flipped: flipped
    };
  }

  /* k：こたえの かんじ  raw：かいた せん（[[x,y], ...] の はいれつ、0〜109）
     others：まちがえやすい ほかの かんじ */
  function judge(k, raw, others){
    var tpl = template(k);
    if (!tpl) return {ok: false, reason: "nodata"};
    var drawn = raw.filter(function(s){ return s.length; });
    var long = drawn.filter(function(s){ return lengthOf(s) >= MIN_LEN; });
    if (long.length >= tpl.length) drawn = long; /* てんの つもりの タッチは のこす */
    if (!drawn.length) return {ok: false, reason: "empty", count: 0, need: tpl.length};
    if (drawn.length !== tpl.length) return {ok: false, reason: "count", count: drawn.length, need: tpl.length};
    var user = normalize(drawn.map(resample));
    var c = compare(user, tpl);
    var res = {ok: false, count: drawn.length, need: tpl.length, score: c.shapeMean};
    if (c.shapeMean > MEAN_OK || c.shapeWorst > WORST_OK) { res.reason = "shape"; return res; }
    /* おなじ かくすうの ほかの かんじの ほうが ずっと にていたら × */
    var rival = null;
    (others || []).forEach(function(o){
      var t2 = o !== k && template(o);
      if (!t2 || t2.length !== tpl.length) return;
      var c2 = compare(user, t2);
      if (c2.shapeMean < c.shapeMean * 0.85 && (!rival || c2.shapeMean < rival.score)) rival = {k: o, score: c2.shapeMean};
    });
    if (rival) { res.reason = "rival"; res.rival = rival.k; return res; }
    res.ok = true;
    /* かたちは OK。かきじゅんと むきを しらべる */
    var wrongOrder = c.orderWorst > WORST_OK || c.orderMean > c.shapeMean + 0.03;
    var firstBad = -1;
    if (wrongOrder) {
      for (var i = 0; i < tpl.length; i++) {
        if (dist(user[i], tpl[i]) > WORST_OK * 0.8 && dist(reversed(user[i]), tpl[i]) > WORST_OK * 0.8) { firstBad = i; break; }
      }
      res.note = "order";
      res.at = firstBad >= 0 ? firstBad + 1 : 0;
    } else {
      var fl = c.flipped.indexOf(true);
      if (fl >= 0) { res.note = "direction"; res.at = fl + 1; }
    }
    return res;
  }

  window.KanjiJudge = {judge: judge, template: template, resample: resample, N: N};
})();
