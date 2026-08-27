import { createMockApiServer } from "./server.ts";

const port = Number(process.env.PORT ?? 4200);

const server = createMockApiServer();
server.listen(port, () => {
  console.log(`mock API server listening on http://localhost:${port}`);
});
