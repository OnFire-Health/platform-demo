import session, { type SessionOptions } from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { sessionSecret } from "./config";

const PgStore = connectPgSimple(session);

const options: SessionOptions = {
  store: new PgStore({
    pool,
    createTableIfMissing: false,
    tableName: "operator_sessions",
  }),
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 12,
  },
};

export const sessionMiddleware = session(options);
