FROM hasura/graphql-engine:v2.48.16.cli-migrations-v3

COPY metadata /hasura-metadata
COPY migrations /hasura-migrations

ENV HASURA_GRAPHQL_ENABLE_CONSOLE="false"

ENV HASURA_GRAPHQL_ENABLE_TELEMETRY="false"

ENV HASURA_GRAPHQL_DEV_MODE="false"

ENV HASURA_GRAPHQL_ENABLED_LOG_TYPES="startup, http-log, webhook-log, websocket-log, query-log"
