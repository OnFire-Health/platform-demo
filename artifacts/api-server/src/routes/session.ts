import { Router, type IRouter } from "express";
import { LoginBody } from "@workspace/api-zod";
import { operatorPassword } from "../lib/config";

const router: IRouter = Router();

router.get("/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.authenticated),
    operator: req.session?.operator ?? null,
  });
});

router.post("/session", (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password is required" });
    return;
  }
  if (parsed.data.password !== operatorPassword()) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  req.session.authenticated = true;
  req.session.operator = "operator";
  res.json({ authenticated: true, operator: "operator" });
});

router.delete("/session", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

export default router;
