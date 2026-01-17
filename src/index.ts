import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8080);
const { httpServer } = createApp();

httpServer.listen(port, () => {
  console.log(`ShoppingLens backend listening on :${port}`);
});
