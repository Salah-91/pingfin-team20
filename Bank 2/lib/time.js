// SQL-vriendelijke datetime util (YYYY-MM-DD HH:MM:SS, manual-formaat)
function now(d = new Date()) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
module.exports = { now };
