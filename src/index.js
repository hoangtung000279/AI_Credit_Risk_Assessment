const { port } = require("./config/env");
const { createApp } = require("./app");

const app = createApp();

app.listen(port, "0.0.0.0", () => {
  console.log(`API running on port ${port}`);
});
