// "98765 43210", "+91-9876543210", "09876543210" -> "+919876543210"; null if not a valid Indian mobile
function normalizeMobile(input) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

module.exports = { normalizeMobile };
