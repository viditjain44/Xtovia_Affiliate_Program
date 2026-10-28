const mongoose = require("mongoose");

// One shared connection, reused across requests. On Vercel the app is woken up per
// request, so connecting on every request would quickly use up MongoDB connections.
let connecting = null;

function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    connecting = mongoose
      .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .then(() => console.log("Connected to MongoDB"))
      .catch((err) => {
        connecting = null; // try again on the next request
        throw err;
      });
  }
  return connecting;
}

module.exports = { connectDB };
