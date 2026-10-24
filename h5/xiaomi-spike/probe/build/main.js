// main.js
(function() {
  var lines = [];
  try {
    lines.push("typeof qg = " + typeof qg);
    if (typeof qg !== "undefined") {
      lines.push("createCanvas=" + typeof qg.createCanvas);
      lines.push("getSystemInfoSync=" + typeof qg.getSystemInfoSync);
    }
  } catch (e) {
    lines.push("probe error: " + e);
  }
  var w = 0;
  var h = 0;
  try {
    var info = qg.getSystemInfoSync();
    w = info.screenWidth;
    h = info.screenHeight;
    lines.push("screen=" + w + "x" + h + " dpr=" + info.pixelRatio);
  } catch (e) {
    lines.push("sysinfo error: " + e);
  }
  try {
    var canvas = qg.createCanvas();
    canvas.width = w || 1280;
    canvas.height = h || 720;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a7a3a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.textBaseline = "top";
    lines.push("canvas=" + canvas.width + "x" + canvas.height);
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], 60, 90 + i * 40);
  } catch (e) {
    try {
      document.body.style.background = "#a33";
      document.body.innerText = "probe fail: " + e;
    } catch (ignore) {
    }
  }
})();
