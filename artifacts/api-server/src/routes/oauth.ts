import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, connectionsTable, oauthStatesTable } from "@workspace/db";
import {
  exchangeCode,
  resolvePartnerPublicId,
  connectionExpiresAt,
} from "../lib/onfire";
import { decodeJwtPayload, extractOrgId } from "../lib/jwt";

const router: IRouter = Router();

function redirectBack(res: import("express").Response, query: string) {
  res.redirect(`/connections${query}`);
}

// Browser redirect target after OnFire's hosted consent. Not session-guarded.
router.get("/oauth/callback", async (req, res) => {
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  const oauthError =
    typeof req.query["error"] === "string" ? req.query["error"] : "";

  if (oauthError) {
    req.log.warn({ oauthError }, "OnFire returned an OAuth error");
    redirectBack(res, `?error=${encodeURIComponent(oauthError)}`);
    return;
  }
  if (!code || !state) {
    redirectBack(res, "?error=missing_code_or_state");
    return;
  }

  const stateRows = await db
    .select()
    .from(oauthStatesTable)
    .where(eq(oauthStatesTable.state, state))
    .limit(1);
  const stateRow = stateRows[0];
  if (!stateRow) {
    redirectBack(res, "?error=invalid_state");
    return;
  }
  await db.delete(oauthStatesTable).where(eq(oauthStatesTable.state, state));

  try {
    const tokens = await exchangeCode(code);
    const payload = decodeJwtPayload(tokens.access_token);
    const orgId = extractOrgId(payload);
    const partnerPublicId = await resolvePartnerPublicId(
      tokens.access_token,
      orgId,
    );

    // Upsert by partner_public_id so re-connecting refreshes the row.
    await db
      .insert(connectionsTable)
      .values({
        partnerPublicId,
        displayName: stateRow.displayName,
        orgId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: connectionExpiresAt(tokens),
        scope: tokens.scope ?? null,
        status: "active",
        connectedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: connectionsTable.partnerPublicId,
        set: {
          displayName: stateRow.displayName,
          orgId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt: connectionExpiresAt(tokens),
          scope: tokens.scope ?? null,
          status: "active",
          connectedAt: new Date(),
        },
      });

    redirectBack(res, "?connected=1");
  } catch (err) {
    req.log.error({ err }, "OAuth callback failed");
    redirectBack(res, "?error=token_exchange_failed");
  }
});

export default router;
