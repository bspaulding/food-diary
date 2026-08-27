import { createMockAuthServer } from "./server.ts";

const port = Number(process.env.PORT ?? 4300);
const issuer = process.env.MOCK_AUTH_ISSUER ?? `http://localhost:${port}/`;

const server = createMockAuthServer({ issuer });
server.listen(port, () => {
  console.log(
    `mock auth server listening on http://localhost:${port} (issuer: ${issuer})`,
  );
});
