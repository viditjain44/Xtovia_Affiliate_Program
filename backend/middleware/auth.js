const jwt = require("jsonwebtoken");

// Usage: requireAuth("admin") or requireAuth("creator")
function requireAuth(role) {
  return (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Please log in" });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (role && payload.role !== role) {
        return res.status(403).json({ message: "Not allowed" });
      }
      req.user = payload; // { id, role }
      next();
    } catch (err) {
      return res.status(401).json({ message: "Session expired, please log in again" });
    }
  };
}

module.exports = { requireAuth };