// Tiny strftime-ish formatter matching GoatBot-Pro's utils.getTime("DD/MM/YYYY HH:mm:ss").
function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function getTime(format = "DD/MM/YYYY HH:mm:ss") {
  const d = new Date();
  return format
    .replace(/YYYY/g, d.getFullYear())
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

module.exports = getTime;
